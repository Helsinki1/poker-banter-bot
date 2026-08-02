// Streaming Cartesia TTS over a persistent websocket.
//
// Replaces the REST /tts/bytes call, which had to synthesize a complete MP3
// before a single sample could play. Here text fragments are pushed into a
// Cartesia "context" as the LLM produces them and raw PCM streams back, so
// audio starts while the model is still writing.
//
// The socket is opened once and kept warm: TLS + handshake cost is paid at
// connect() time, not on the first taunt. Each response uses a fresh
// context_id; contexts expire on their own 1s after their last output.

const TTS_WS_URL = 'wss://api.cartesia.ai/tts/websocket';
export const CARTESIA_VERSION = '2026-03-01';
export const TTS_MODEL_ID = 'sonic-3.5';
/** 24kHz is the sweet spot: clearly better than 16k, half the bytes of 44.1k. */
export const TTS_SAMPLE_RATE = 24_000;

export interface TtsSocketEvents {
  /** One decoded PCM chunk for the given response. */
  onChunk(responseId: string, pcm: Int16Array): void;
  /** Word-level timings, used to pace subtitles against real audio. */
  onTimestamps(responseId: string, words: string[], starts: number[], ends: number[]): void;
  /** Cartesia finished generating this response. */
  onDone(responseId: string): void;
  onError(responseId: string | null, message: string): void;
}

function decodeBase64Pcm(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // The byte length may be odd if a chunk boundary splits a sample; drop the
  // stray byte rather than misaligning every sample after it.
  const usable = bytes.length - (bytes.length % 2);
  return new Int16Array(bytes.buffer, 0, usable / 2);
}

export class CartesiaTtsSocket {
  private apiKey: string;
  private events: TtsSocketEvents;
  private ws: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  private closed = false;
  /** context_id → responseId, so replies route to the right response. */
  private contexts = new Map<string, string>();
  private reopen: ReturnType<typeof setTimeout> | null = null;

  constructor(apiKey: string, events: TtsSocketEvents) {
    this.apiKey = apiKey;
    this.events = events;
  }

  /** Open the socket (idempotent). Safe to call at connect() to prewarm. */
  async ensureOpen(): Promise<void> {
    if (this.closed) throw new Error('TTS socket has been destroyed');
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.opening) return this.opening;

    this.opening = new Promise<void>((resolve, reject) => {
      const url = `${TTS_WS_URL}?cartesia_version=${CARTESIA_VERSION}` +
        `&api_key=${encodeURIComponent(this.apiKey)}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      const failed = (msg: string) => {
        this.opening = null;
        if (this.ws === ws) this.ws = null;
        reject(new Error(msg));
      };

      ws.onopen = () => {
        this.opening = null;
        resolve();
      };
      ws.onerror = () => failed('Could not reach the Cartesia voice service.');
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.contexts.clear();
        if (this.opening) {
          failed('Cartesia voice connection closed.');
          return;
        }
        // Cartesia drops idle sockets. Reopen straight away so the next taunt
        // does not pay a handshake — there is no application-level ping on this
        // endpoint (every frame is parsed as a generation request), so staying
        // warm means reconnecting, not polling.
        if (!this.closed) {
          this.reopen = setTimeout(() => {
            this.reopen = null;
            if (!this.closed) void this.ensureOpen().catch(() => { /* retried on next send */ });
          }, 250);
        }
      };
      ws.onmessage = (event) => this.handleMessage(event);
    });
    return this.opening;
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') return;
    let msg: {
      type?: string; context_id?: string; data?: string; done?: boolean;
      message?: string; word_timestamps?: { words?: string[]; start?: number[]; end?: number[] };
    };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    const responseId = msg.context_id ? this.contexts.get(msg.context_id) : undefined;

    switch (msg.type) {
      case 'chunk': {
        if (!responseId || !msg.data) return;
        const pcm = decodeBase64Pcm(msg.data);
        if (pcm.length) this.events.onChunk(responseId, pcm);
        break;
      }
      case 'timestamps': {
        const t = msg.word_timestamps;
        if (!responseId || !t?.words || !t.start || !t.end) return;
        this.events.onTimestamps(responseId, t.words, t.start, t.end);
        break;
      }
      case 'done': {
        if (!responseId) return;
        if (msg.context_id) this.contexts.delete(msg.context_id);
        this.events.onDone(responseId);
        break;
      }
      case 'error': {
        if (msg.context_id) this.contexts.delete(msg.context_id);
        this.events.onError(responseId ?? null, msg.message ?? 'Cartesia voice error.');
        break;
      }
    }
  }

  /**
   * Push one text fragment into a response's context. The first call for a
   * responseId opens the context; `last` closes it.
   */
  async send(
    responseId: string,
    voiceId: string,
    text: string,
    last: boolean,
    speed: 'slow' | 'normal' | 'fast' = 'normal',
  ): Promise<void> {
    await this.ensureOpen();
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('TTS socket not open');

    const contextId = `ctx-${responseId}`;
    this.contexts.set(contextId, responseId);

    // Cartesia concatenates a context's fragments with no separator, so a
    // fragment ending mid-phrase would fuse with the next one ("the" +
    // "clutch" → "theclutch") in both the audio and the word timestamps.
    // A trailing space keeps the words apart.
    const transcript = !last && text && !/\s$/.test(text) ? `${text} ` : text;

    // model_id / voice / output_format must be identical across every message
    // in a context, so they are sent every time rather than only on the first.
    ws.send(JSON.stringify({
      model_id: TTS_MODEL_ID,
      transcript,
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: TTS_SAMPLE_RATE },
      language: 'en',
      speed,
      context_id: contextId,
      continue: !last,
      add_timestamps: true,
    }));
  }

  /** Close a response's context early (barge-in). */
  cancel(responseId: string): void {
    const contextId = `ctx-${responseId}`;
    if (!this.contexts.has(contextId)) return;
    this.contexts.delete(contextId);
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      // An empty transcript with continue:false ends the context; Cartesia
      // stops generating and we stop scheduling whatever already arrived.
      try {
        ws.send(JSON.stringify({ context_id: contextId, transcript: '', continue: false }));
      } catch { /* socket going away anyway */ }
    }
  }

  destroy(): void {
    this.closed = true;
    if (this.reopen) { clearTimeout(this.reopen); this.reopen = null; }
    this.contexts.clear();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try { ws.close(); } catch { /* noop */ }
    }
  }
}
