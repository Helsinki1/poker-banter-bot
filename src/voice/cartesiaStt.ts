import type { DictationEvents, DictationStatus } from './dictation';
import { getCartesiaApiKey } from './cartesiaTts';

// Cartesia streaming speech-to-text (Ink 2) with native turn detection.
//
// Uses /stt/turns/websocket rather than /stt/websocket: Cartesia decides when a
// turn ends, which removes the silence-timeout guesswork that made replies feel
// late. It also emits `turn.eager_end` — "they have probably finished" — which
// we surface as onEagerFinal so the backend can start generating before the
// turn is confirmed, then `turn.resume` if the speaker carries on.
//
// Emits the same DictationEvents as the Web Speech adapter, so the conversation
// layer treats both identically — transcripts go ONLY to the conversation
// client as text, never to the poker layer.

const STT_URL = 'wss://api.cartesia.ai/stt/turns/websocket';
const CARTESIA_VERSION = '2026-03-01';
const MODEL = 'ink-2';
/** 16kHz is plenty for speech and a third of the bytes of 48kHz. */
const STT_SAMPLE_RATE = 16_000;

// Downsamples mic audio to 16kHz mono s16le off the main thread. Inlined as a
// blob URL so the build needs no separate worklet asset.
const WORKLET_SOURCE = `
class PcmDownsampler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.target = options.processorOptions.targetRate;
    this.ratio = sampleRate / this.target;
    this.carry = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const chan = input[0];
    // Walk the source at a fractional step; nearest-neighbour is adequate for
    // speech recognition and far cheaper than a filtered resample.
    const out = [];
    let pos = this.carry;
    while (pos < chan.length) {
      const s = Math.max(-1, Math.min(1, chan[Math.floor(pos)]));
      out.push(s < 0 ? s * 0x8000 : s * 0x7fff);
      pos += this.ratio;
    }
    this.carry = pos - chan.length;
    if (out.length) {
      const pcm = new Int16Array(out);
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-downsampler', PcmDownsampler);
`;

export function isCartesiaSttAvailable(): boolean {
  return typeof window !== 'undefined' &&
    !!getCartesiaApiKey() &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;
}

export class CartesiaSttAdapter {
  private events: DictationEvents;
  private status: DictationStatus = 'idle';
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private wantListening = false;
  /** True between turn.eager_end and either turn.end or turn.resume. */
  private eagerPending = false;

  constructor(events: DictationEvents) {
    this.events = events;
  }

  getStatus(): DictationStatus {
    return this.status;
  }

  private setStatus(s: DictationStatus): void {
    this.status = s;
    this.events.onStatus(s);
  }

  start(): void {
    if (this.ws || this.wantListening) return;
    this.wantListening = true;
    this.setStatus('starting');
    void this.open();
  }

  private async open(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (err) {
      this.wantListening = false;
      const denied = err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      this.setStatus(denied ? 'permission-denied' : 'error');
      this.events.onError(
        denied
          ? 'Microphone permission was denied. You can retry, or use the text box.'
          : 'Could not open the microphone. Try again or use the text box.',
        true,
      );
      return;
    }
    if (!this.wantListening) {
      for (const t of stream.getTracks()) t.stop();
      return;
    }
    this.stream = stream;

    const ctx = new AudioContext();
    this.audioCtx = ctx;

    // Load the downsampler before opening the socket, so audio can start
    // flowing the instant the connection is live.
    let workletReady = true;
    const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(blobUrl);
    } catch {
      workletReady = false;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
    if (!this.wantListening) return;
    if (!workletReady) {
      this.setStatus('error');
      this.events.onError('Could not initialise audio capture. Try again or type instead.', true);
      return;
    }

    const url = `${STT_URL}?model=${MODEL}&language=en&encoding=pcm_s16le` +
      `&sample_rate=${STT_SAMPLE_RATE}&api_key=${encodeURIComponent(getCartesiaApiKey())}` +
      `&cartesia_version=${CARTESIA_VERSION}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      if (!this.wantListening) return;
      this.setStatus('listening');
      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'pcm-downsampler', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        processorOptions: { targetRate: STT_SAMPLE_RATE },
      });
      this.source = source;
      this.worklet = worklet;
      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(e.data);
      };
      // No destination connection needed: a worklet with zero outputs is
      // pulled by the graph on its own, unlike ScriptProcessorNode.
      source.connect(worklet);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let msg: { type?: string; transcript?: string; message?: string };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return; // non-JSON frame
      }
      const text = msg.transcript?.trim() ?? '';
      switch (msg.type) {
        case 'turn.start':
          // A new turn began — retract any outstanding eager guess.
          if (this.eagerPending) {
            this.eagerPending = false;
            this.events.onEagerCancel?.();
          }
          break;
        case 'turn.update':
          if (text) this.events.onInterim(text);
          break;
        case 'turn.eager_end':
          // Probably finished. Let the backend start early; turn.resume undoes it.
          if (text) {
            this.eagerPending = true;
            this.events.onEagerFinal?.(text);
          }
          break;
        case 'turn.resume':
          if (this.eagerPending) {
            this.eagerPending = false;
            this.events.onEagerCancel?.();
          }
          break;
        case 'turn.end':
          this.eagerPending = false;
          if (text) this.events.onFinal(text);
          break;
        case 'error':
          this.events.onError('Transcription error — the game continues. Try again or type instead.', true);
          break;
      }
    };

    ws.onerror = () => {
      if (!this.wantListening) return;
      this.setStatus('error');
      this.events.onError('Could not reach the Cartesia transcription service. Check your key/network, or type instead.', true);
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.wantListening && this.status === 'listening') {
        // Cartesia closes idle sockets after ~3 minutes; reconnect quietly.
        this.teardownAudio();
        setTimeout(() => {
          if (this.wantListening) {
            this.wantListening = false;
            this.start();
          }
        }, 250);
      }
    };
  }

  stop(): void {
    this.wantListening = false;
    this.eagerPending = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // Flush buffered audio, then end the session.
        this.ws.send('finalize');
        this.ws.send('close');
      } catch { /* closing anyway */ }
    }
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
    this.teardownAudio();
    if (this.status !== 'permission-denied') this.setStatus('idle');
  }

  destroy(): void {
    this.stop();
  }

  private teardownAudio(): void {
    if (this.worklet) this.worklet.port.onmessage = null;
    try { this.worklet?.disconnect(); } catch { /* noop */ }
    try { this.source?.disconnect(); } catch { /* noop */ }
    this.worklet = null;
    this.source = null;
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => { /* already closed */ });
      this.audioCtx = null;
    }
  }
}
