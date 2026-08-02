// Gapless PCM playback queue for streamed NPC speech.
//
// Cartesia's TTS websocket returns raw PCM in many small chunks. Playing each
// chunk with its own `new Audio()` would stutter; instead every chunk becomes
// an AudioBuffer scheduled back-to-back on the AudioContext clock, so playback
// is sample-accurate even when chunks arrive unevenly.
//
// A small jitter buffer absorbs network variance: the first chunk starts
// JITTER_SEC in the future, which is cheap insurance against a mid-word gap.

const JITTER_SEC = 0.08;

export interface PcmQueueEvents {
  /** Fires once per response, the moment the first chunk is actually scheduled. */
  onFirstAudio?(): void;
  /** Fires when everything scheduled has finished playing. */
  onDrained?(): void;
}

export class PcmQueue {
  private ctx: AudioContext;
  private gain: GainNode;
  private events: PcmQueueEvents;
  /** AudioContext time at which the current response's audio begins. */
  private startTime = 0;
  /** AudioContext time at which the next chunk should begin. */
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private started = false;
  private ended = false;
  private pending = 0;

  constructor(ctx: AudioContext, events: PcmQueueEvents = {}) {
    this.ctx = ctx;
    this.events = events;
    this.gain = ctx.createGain();
    this.gain.connect(ctx.destination);
  }

  /** Begin a new response. Any audio still queued from a previous one is dropped. */
  reset(): void {
    this.stop();
    this.started = false;
    this.ended = false;
    this.startTime = 0;
    this.nextTime = 0;
    this.pending = 0;
  }

  /** True once the first chunk of this response has been scheduled. */
  hasStarted(): boolean {
    return this.started;
  }

  /**
   * Seconds of audio elapsed for this response, on the audio clock. Negative
   * while still inside the jitter buffer. Used to pace subtitles against what
   * the player is actually hearing.
   */
  elapsed(): number {
    if (!this.started) return -1;
    return this.ctx.currentTime - this.startTime;
  }

  /** Total duration scheduled so far, in seconds. */
  scheduledDuration(): number {
    if (!this.started) return 0;
    return this.nextTime - this.startTime;
  }

  /** Schedule one chunk of signed 16-bit PCM. */
  enqueue(pcm: Int16Array, sampleRate: number): void {
    if (this.ended || pcm.length === 0) return;

    const buffer = this.ctx.createBuffer(1, pcm.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;

    // The first chunk starts slightly ahead of "now"; later chunks butt up
    // against the previous one. If the network fell behind and nextTime is
    // already in the past, restart from now to avoid scheduling in the past.
    if (!this.started) {
      this.startTime = this.ctx.currentTime + JITTER_SEC;
      this.nextTime = this.startTime;
      this.started = true;
      this.events.onFirstAudio?.();
    } else if (this.nextTime < this.ctx.currentTime) {
      this.nextTime = this.ctx.currentTime;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    this.pending++;
    source.onended = () => {
      this.sources.delete(source);
      this.pending--;
      if (this.pending === 0 && this.ended) this.events.onDrained?.();
    };
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.sources.add(source);
  }

  /** No more chunks are coming; onDrained fires once the tail finishes. */
  markComplete(): void {
    this.ended = true;
    if (this.pending === 0) this.events.onDrained?.();
  }

  /** Hard stop — barge-in must silence audio immediately. */
  stop(): void {
    this.ended = true;
    for (const source of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* noop */ }
    }
    this.sources.clear();
    this.pending = 0;
  }
}
