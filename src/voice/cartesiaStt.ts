import type { DictationEvents, DictationStatus } from './dictation';
import { getCartesiaApiKey } from './cartesiaTts';

// Cartesia streaming speech-to-text (ink-whisper) over WebSocket. Replaces
// the browser's SpeechRecognition, which needs Google's speech service and
// fails with 'network' errors on Linux/Chromium. Microphone PCM is streamed
// to wss://api.cartesia.ai/stt/websocket; incremental transcripts come back
// with an is_final flag. Emits the same DictationEvents as the Web Speech
// adapter, so the conversation layer treats both identically — transcripts
// go ONLY to the conversation client as text, never to the poker layer.

const STT_URL = 'wss://api.cartesia.ai/stt/websocket';
const CARTESIA_VERSION = '2025-04-16';
const MODEL = 'ink-whisper';

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
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private wantListening = false;

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
    const sampleRate = ctx.sampleRate;

    const url = `${STT_URL}?model=${MODEL}&language=en&encoding=pcm_s16le` +
      `&sample_rate=${sampleRate}&api_key=${encodeURIComponent(getCartesiaApiKey())}` +
      `&cartesia_version=${CARTESIA_VERSION}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      if (!this.wantListening) return;
      this.setStatus('listening');
      // Pump mic PCM into the socket. ScriptProcessor keeps this dependency-
      // free (no worklet file); 4096 frames ≈ 85ms at 48kHz.
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      this.source = source;
      this.processor = processor;
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        ws.send(pcm.buffer);
      };
      source.connect(processor);
      processor.connect(ctx.destination); // required for onaudioprocess to fire
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data) as { type?: string; text?: string; is_final?: boolean };
        if (msg.type === 'transcript') {
          const text = msg.text?.trim() ?? '';
          if (!text) return;
          if (msg.is_final) this.events.onFinal(text);
          else this.events.onInterim(text);
        } else if (msg.type === 'error') {
          this.events.onError('Transcription error — the game continues. Try again or type instead.', true);
        }
      } catch { /* non-JSON frame */ }
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
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send('finalize');
        this.ws.send('done');
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
    try { this.processor?.disconnect(); } catch { /* noop */ }
    try { this.source?.disconnect(); } catch { /* noop */ }
    this.processor = null;
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
