import type { AudioStreamEvent } from '../api/conversationClient';
import { TtsPlayer } from './ttsPlayer';
import { PcmQueue } from './pcmQueue';
import { CartesiaTtsSocket, TTS_SAMPLE_RATE, CARTESIA_VERSION } from './cartesiaTtsSocket';

// Cartesia-backed NPC voice, streaming.
//
// Text fragments arrive as the LLM writes them and are pushed straight into a
// Cartesia TTS context; raw PCM streams back and is scheduled gaplessly by
// PcmQueue, so the first audio lands ~90ms after the first fragment instead of
// after a whole MP3 has been synthesized.
//
// Subtitles are paced by Cartesia's own word timestamps against the audio
// clock, so what the sprite "says" on screen matches what you hear. If no API
// key is configured (or the socket fails) we fall back to the speechSynthesis
// player — the game never blocks on audio.

const CARTESIA_BASE = 'https://api.cartesia.ai';
/**
 * Native Cartesia speed instead of HTMLAudioElement.playbackRate: the streamed
 * path has no media element, and native speed preserves prosody rather than
 * resampling the voice upward.
 */
const SPEECH_SPEED = 'fast' as const;
const VOICE_ID_CACHE_KEY = 'cartesia-voice-ids-v1';

export type NpcVoice = 'normal' | 'dana' | 'lebron' | 'trump';

export interface NpcVoiceOption {
  id: NpcVoice;
  label: string;
  /** Name candidates to match against the Cartesia voice library, in order. */
  libraryNames: string[];
  /** Cartesia speech speed for this voice; defaults to SPEECH_SPEED. */
  speed?: 'slow' | 'normal' | 'fast';
}

export const NPC_VOICE_OPTIONS: NpcVoiceOption[] = [
  { id: 'normal', label: 'Normal (Daniel)', libraryNames: ['Daniel - Modern Assistant', 'Daniel (Modern Assistant)', 'Daniel'] },
  { id: 'dana', label: 'Dana Schafer-Smith', libraryNames: ['Dana Schafer-Smith', 'Dana Schafer Smith', 'Dana'], speed: 'slow' },
  { id: 'lebron', label: 'Lebron James', libraryNames: ['Lebron James', 'Lebron'] },
  // The library entry is literally named "Trump" — keep both spellings.
  { id: 'trump', label: 'Donald Trump', libraryNames: ['Donald Trump', 'Trump'] },
];

export function getCartesiaApiKey(): string {
  return (import.meta.env.VITE_CARTESIA_API_KEY as string | undefined)?.trim() ?? '';
}

function cartesiaHeaders(apiKey: string): Record<string, string> {
  return {
    'X-API-Key': apiKey,
    'Cartesia-Version': CARTESIA_VERSION,
    'Content-Type': 'application/json',
  };
}

interface CartesiaVoiceRow { id: string; name: string }

function readIdCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VOICE_ID_CACHE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeIdCache(cache: Record<string, string>): void {
  try { localStorage.setItem(VOICE_ID_CACHE_KEY, JSON.stringify(cache)); } catch { /* private mode */ }
}

/**
 * Resolve an NPC voice to a Cartesia voice id by listing the voice library
 * and matching by name (exact first, then substring). Results are cached in
 * localStorage so the library is only walked once per voice.
 */
async function resolveVoiceId(voice: NpcVoiceOption, apiKey: string): Promise<string> {
  const cache = readIdCache();
  if (cache[voice.id]) return cache[voice.id];

  const wanted = voice.libraryNames.map((n) => n.toLowerCase());
  let exact: string | null = null;
  let partial: string | null = null;
  let startingAfter: string | null = null;

  for (let page = 0; page < 20 && !exact; page++) {
    const url = new URL(`${CARTESIA_BASE}/voices/`);
    url.searchParams.set('limit', '100');
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);
    const res = await fetch(url, { headers: cartesiaHeaders(apiKey) });
    if (!res.ok) throw new Error(`Cartesia voice list failed (${res.status})`);
    const body: unknown = await res.json();
    const rows: CartesiaVoiceRow[] = Array.isArray(body)
      ? body as CartesiaVoiceRow[]
      : ((body as { data?: CartesiaVoiceRow[] }).data ?? []);
    for (const row of rows) {
      const name = row.name?.toLowerCase() ?? '';
      if (wanted.includes(name)) { exact = row.id; break; }
      if (!partial && name && wanted.some((w) => name.includes(w))) partial = row.id;
    }
    const hasMore = !Array.isArray(body) && (body as { has_more?: boolean }).has_more === true;
    if (!hasMore || rows.length === 0) break;
    startingAfter = rows[rows.length - 1].id;
  }

  const id = exact ?? partial;
  if (!id) {
    throw new Error(
      `Voice "${voice.libraryNames[0]}" not found in your Cartesia voice library — add it at play.cartesia.ai.`,
    );
  }
  cache[voice.id] = id;
  writeIdCache(cache);
  return id;
}

export interface CartesiaPlayerEvents {
  onSpeakingChange(speaking: boolean): void;
  onAudioUnavailable(message?: string): void;
  /** Playback-paced partial subtitle text for a response Cartesia is voicing. */
  onTextProgress(responseId: string, text: string, final: boolean): void;
  /** Cartesia gave up on this response — subtitles return to the transcript stream. */
  onDrivingFailed(responseId: string): void;
}

interface ActivePlayback {
  responseId: string;
  epoch: number;
  /** Text sent to Cartesia so far, for subtitle assembly. */
  sentText: string;
  /** Word timings from Cartesia, in audio-clock seconds. */
  words: string[];
  wordStarts: number[];
  raf: number | null;
  /** Set once the fragment stream is closed. */
  complete: boolean;
  lastSubtitle: string;
}

export class CartesiaVoicePlayer {
  private events: CartesiaPlayerEvents;
  private fallback: TtsPlayer;
  private muted = false;
  private voice: NpcVoiceOption = NPC_VOICE_OPTIONS[0];
  private epoch = 0;
  private active: ActivePlayback | null = null;
  private speaking = false;
  private socket: CartesiaTtsSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private queue: PcmQueue | null = null;
  /** Resolved voice ids, prewarmed at connect so no response pays the lookup. */
  private voiceIdPromises = new Map<NpcVoice, Promise<string>>();

  constructor(events: CartesiaPlayerEvents) {
    this.events = events;
    this.fallback = new TtsPlayer({
      onSpeakingChange: (s) => this.setSpeaking(s),
      onAudioUnavailable: () => events.onAudioUnavailable(),
    });
  }

  setVoice(id: NpcVoice): void {
    this.voice = NPC_VOICE_OPTIONS.find((v) => v.id === id) ?? NPC_VOICE_OPTIONS[0];
  }

  /**
   * Pay every fixed cost before the player ever speaks: resolve the voice id
   * (which can walk the whole voice library) and open the TTS websocket. Called
   * at conversation connect; failures are non-fatal since the speechSynthesis
   * fallback still works.
   */
  prewarm(): void {
    const apiKey = getCartesiaApiKey();
    if (!apiKey) return;
    void this.resolveVoiceCached(this.voice, apiKey).catch(() => { /* falls back later */ });
    try {
      void this.getSocket(apiKey).ensureOpen().catch(() => { /* falls back later */ });
    } catch { /* destroyed */ }
  }

  /** Resume the AudioContext from a user gesture (browsers require this). */
  unlockAudio(): void {
    const ctx = this.audioCtx;
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => { /* noop */ });
  }

  private resolveVoiceCached(voice: NpcVoiceOption, apiKey: string): Promise<string> {
    const existing = this.voiceIdPromises.get(voice.id);
    if (existing) return existing;
    const p = resolveVoiceId(voice, apiKey).catch((err: unknown) => {
      // Do not cache failures — a transient network error should be retried.
      this.voiceIdPromises.delete(voice.id);
      throw err;
    });
    this.voiceIdPromises.set(voice.id, p);
    return p;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
    }
    return this.audioCtx;
  }

  private getSocket(apiKey: string): CartesiaTtsSocket {
    if (!this.socket) {
      this.socket = new CartesiaTtsSocket(apiKey, {
        onChunk: (responseId, pcm) => this.onPcmChunk(responseId, pcm),
        onTimestamps: (responseId, words, starts) => this.onWordTimestamps(responseId, words, starts),
        onDone: (responseId) => this.onGenerationDone(responseId),
        onError: (responseId, message) => {
          // Only tear down a response the error actually belongs to. An
          // unattributable error (no context_id) must not drop the NPC to the
          // browser voice mid-sentence.
          if (!responseId || this.active?.responseId !== responseId) return;
          this.failStreaming(message);
        },
      });
    }
    return this.socket;
  }

  getVoice(): NpcVoice {
    return this.voice.id;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.fallback.setMuted(muted);
    if (muted) this.stop();
  }

  isMuted(): boolean {
    return this.muted;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  /** True while Cartesia owns subtitle pacing for this response. */
  isDriving(responseId: string | undefined): boolean {
    return !!responseId && this.active?.responseId === responseId;
  }

  /**
   * Consume one streamed TTS event. Non-`last` events carry an incremental
   * text fragment to synthesize; `last` closes (or cancels) the response.
   */
  handle(event: AudioStreamEvent): void {
    if (event.kind !== 'tts') return;

    if (event.last) {
      if (event.cancelled) {
        // Interrupted / cancelled — audio must stop immediately.
        if (this.active?.responseId === event.responseId) this.stop();
        else this.fallback.handle(event);
        return;
      }
      if (this.isDriving(event.responseId)) {
        // Close the Cartesia context; audio already queued finishes naturally.
        this.closeStream(event.responseId);
      } else {
        // Natural end of the text stream while on the fallback path.
        this.fallback.handle(event);
      }
      return;
    }

    if (this.muted) return;

    const apiKey = getCartesiaApiKey();
    if (!apiKey) {
      this.fallback.handle(event);
      return;
    }

    // A fragment for the response already streaming: append to its context.
    if (this.active?.responseId === event.responseId) {
      void this.pushFragment(this.active, event.text, apiKey);
      return;
    }

    // First fragment of a new response — replace whatever came before.
    this.stop();
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* gesture needed */ });

    const playback: ActivePlayback = {
      responseId: event.responseId,
      epoch: ++this.epoch,
      sentText: '',
      words: [],
      wordStarts: [],
      raf: null,
      complete: false,
      lastSubtitle: '',
    };
    this.active = playback;
    this.queue = new PcmQueue(ctx, {
      onFirstAudio: () => {
        if (this.epoch !== playback.epoch) return;
        this.setSpeaking(true);
        this.startRevealLoop(playback);
      },
      onDrained: () => {
        if (this.epoch !== playback.epoch) return;
        this.finishPlayback(playback);
      },
    });
    void this.pushFragment(playback, event.text, apiKey);
  }

  private async pushFragment(
    playback: ActivePlayback,
    text: string,
    apiKey: string,
  ): Promise<void> {
    const fragment = text.trim();
    if (!fragment) return;
    playback.sentText = playback.sentText ? `${playback.sentText} ${fragment}` : fragment;
    try {
      const voiceId = await this.resolveVoiceCached(this.voice, apiKey);
      if (this.epoch !== playback.epoch) return; // replaced while resolving
      await this.getSocket(apiKey).send(playback.responseId, voiceId, fragment, false, this.voice.speed ?? SPEECH_SPEED);
    } catch (err) {
      if (this.epoch !== playback.epoch) return;
      const message = err instanceof Error ? err.message : 'Cartesia voice unavailable.';
      this.failStreaming(`${message} Using the built-in voice.`);
    }
  }

  /** The text stream ended: tell Cartesia no more fragments are coming. */
  private closeStream(responseId: string): void {
    const playback = this.active;
    if (!playback || playback.responseId !== responseId) return;
    playback.complete = true;
    const apiKey = getCartesiaApiKey();
    if (!apiKey || !this.socket) return;
    void this.resolveVoiceCached(this.voice, apiKey)
      .then((voiceId) => {
        if (this.epoch !== playback.epoch) return;
        // Empty transcript + continue:false is Cartesia's end-of-input signal.
        return this.socket?.send(responseId, voiceId, '', true, SPEECH_SPEED);
      })
      .catch(() => { /* the tail may just end early */ });
  }

  private onPcmChunk(responseId: string, pcm: Int16Array): void {
    const playback = this.active;
    if (!playback || playback.responseId !== responseId || this.muted) return;
    this.queue?.enqueue(pcm, TTS_SAMPLE_RATE);
  }

  private onWordTimestamps(responseId: string, words: string[], starts: number[]): void {
    const playback = this.active;
    if (!playback || playback.responseId !== responseId) return;
    // Timestamps arrive per fragment, already offset within the context.
    playback.words.push(...words);
    playback.wordStarts.push(...starts);
  }

  private onGenerationDone(responseId: string): void {
    const playback = this.active;
    if (!playback || playback.responseId !== responseId) return;
    // Generation finished; playback may still be draining.
    this.queue?.markComplete();
  }

  /**
   * Reveal subtitle words as they are actually heard, using Cartesia's word
   * timestamps against the audio clock.
   */
  private startRevealLoop(playback: ActivePlayback): void {
    const tick = () => {
      if (this.epoch !== playback.epoch) return;
      const elapsed = this.queue?.elapsed() ?? -1;
      if (elapsed >= 0 && playback.words.length > 0) {
        // Slight lead so a word appears as it starts being spoken.
        const t = elapsed + 0.12;
        let count = 0;
        while (count < playback.wordStarts.length && playback.wordStarts[count] <= t) count++;
        if (count > 0) {
          const partial = playback.words.slice(0, count).join(' ');
          if (partial !== playback.lastSubtitle) {
            playback.lastSubtitle = partial;
            this.events.onTextProgress(playback.responseId, partial, false);
          }
        }
      }
      playback.raf = requestAnimationFrame(tick);
    };
    playback.raf = requestAnimationFrame(tick);
  }

  private finishPlayback(playback: ActivePlayback): void {
    const finalText = playback.words.length
      ? playback.words.join(' ')
      : playback.sentText;
    this.events.onTextProgress(playback.responseId, finalText, true);
    this.cleanup(playback);
    this.active = null;
    this.queue = null;
    this.setSpeaking(false);
  }

  /**
   * Streaming failed mid-response. Anything already spoken stays spoken; the
   * remainder is abandoned and subtitles revert to the transcript stream.
   */
  private failStreaming(message: string): void {
    const playback = this.active;
    if (!playback) return;
    this.cleanup(playback);
    this.queue?.stop();
    this.queue = null;
    this.active = null;
    this.epoch++;
    this.setSpeaking(false);
    this.events.onAudioUnavailable(message);
    this.events.onDrivingFailed(playback.responseId);
  }

  stop(): void {
    this.epoch++;
    const playback = this.active;
    if (playback) {
      this.socket?.cancel(playback.responseId);
      this.cleanup(playback);
      this.active = null;
    }
    this.queue?.stop();
    this.queue = null;
    this.fallback.stop();
    this.setSpeaking(false);
  }

  /** Release the socket and audio graph (conversation teardown). */
  destroy(): void {
    this.stop();
    this.socket?.destroy();
    this.socket = null;
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => { /* already closed */ });
      this.audioCtx = null;
    }
  }

  private cleanup(playback: ActivePlayback): void {
    if (playback.raf !== null) {
      cancelAnimationFrame(playback.raf);
      playback.raf = null;
    }
  }

  private setSpeaking(s: boolean): void {
    if (this.speaking !== s) {
      this.speaking = s;
      this.events.onSpeakingChange(s);
    }
  }
}
