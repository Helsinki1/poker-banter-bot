import type { AudioStreamEvent } from '../api/conversationClient';
import { TtsPlayer } from './ttsPlayer';

// Cartesia-backed NPC voice. Takes the full text of an NPC response, calls
// the Cartesia TTS API to synthesize an MP3, and plays it at 1.1x speed.
// While the MP3 plays, the subtitle text is revealed word-by-word in step
// with actual playback progress, so what the sprite "says" on screen tracks
// what you hear. If no API key is configured (or a request fails) we fall
// back to the original speechSynthesis player and the mock's own word
// pacing — the game never blocks on audio.

const CARTESIA_BASE = 'https://api.cartesia.ai';
const CARTESIA_VERSION = '2025-04-16';
const MODEL_ID = 'sonic-2';
const PLAYBACK_RATE = 1.1;
const VOICE_ID_CACHE_KEY = 'cartesia-voice-ids-v1';

export type NpcVoice = 'normal' | 'lebron' | 'trump';

export interface NpcVoiceOption {
  id: NpcVoice;
  label: string;
  /** Name candidates to match against the Cartesia voice library, in order. */
  libraryNames: string[];
}

export const NPC_VOICE_OPTIONS: NpcVoiceOption[] = [
  { id: 'normal', label: 'Normal (Daniel)', libraryNames: ['Daniel - Modern Assistant', 'Daniel (Modern Assistant)', 'Daniel'] },
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

/** Synthesize one MP3 for the given text and voice. */
async function synthesizeMp3(text: string, voiceId: string, apiKey: string): Promise<Blob> {
  const res = await fetch(`${CARTESIA_BASE}/tts/bytes`, {
    method: 'POST',
    headers: cartesiaHeaders(apiKey),
    body: JSON.stringify({
      model_id: MODEL_ID,
      transcript: text,
      voice: { mode: 'id', id: voiceId },
      language: 'en',
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
    }),
  });
  if (!res.ok) throw new Error(`Cartesia TTS failed (${res.status})`);
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: 'audio/mpeg' });
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
  audio: HTMLAudioElement | null;
  objectUrl: string | null;
  raf: number | null;
}

export class CartesiaVoicePlayer {
  private events: CartesiaPlayerEvents;
  private fallback: TtsPlayer;
  private muted = false;
  private voice: NpcVoiceOption = NPC_VOICE_OPTIONS[0];
  private epoch = 0;
  private active: ActivePlayback | null = null;
  private speaking = false;

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

  handle(event: AudioStreamEvent): void {
    if (event.kind !== 'tts') return;

    if (event.last) {
      if (event.cancelled) {
        // Interrupted / cancelled — audio must stop immediately.
        if (this.active?.responseId === event.responseId) this.stop();
        else this.fallback.handle(event);
      } else if (!this.isDriving(event.responseId)) {
        // Natural end of the text stream while on the fallback path.
        this.fallback.handle(event);
      }
      // When Cartesia is driving, a natural stream end is ignored: the MP3
      // finishes on its own and emits the final subtitle then.
      return;
    }

    this.stop();
    if (this.muted) return;

    const apiKey = getCartesiaApiKey();
    if (!apiKey) {
      this.fallback.handle(event);
      return;
    }

    const playback: ActivePlayback = {
      responseId: event.responseId,
      epoch: ++this.epoch,
      audio: null,
      objectUrl: null,
      raf: null,
    };
    this.active = playback;
    void this.speakViaCartesia(event, playback, apiKey);
  }

  private async speakViaCartesia(
    event: Extract<AudioStreamEvent, { kind: 'tts' }>,
    playback: ActivePlayback,
    apiKey: string,
  ): Promise<void> {
    try {
      const voiceId = await resolveVoiceId(this.voice, apiKey);
      const mp3 = await synthesizeMp3(event.text, voiceId, apiKey);
      if (this.epoch !== playback.epoch) return; // stopped/replaced while fetching

      const url = URL.createObjectURL(mp3);
      const audio = new Audio(url);
      playback.audio = audio;
      playback.objectUrl = url;
      audio.playbackRate = PLAYBACK_RATE;
      audio.preservesPitch = true;

      const words = event.text.split(/\s+/).filter(Boolean);
      let lastPartial = '';
      const reveal = () => {
        if (this.epoch !== playback.epoch) return;
        const dur = audio.duration;
        if (Number.isFinite(dur) && dur > 0) {
          // Slight lead so the word appears as it starts being spoken.
          const frac = Math.min(1, (audio.currentTime + 0.12) / dur);
          const count = Math.max(1, Math.ceil(frac * words.length));
          const partial = words.slice(0, count).join(' ');
          if (partial !== lastPartial) {
            lastPartial = partial;
            this.events.onTextProgress(playback.responseId, partial, false);
          }
        }
        if (!audio.ended && !audio.paused) {
          playback.raf = requestAnimationFrame(reveal);
        }
      };

      audio.onplaying = () => {
        if (this.epoch !== playback.epoch) return;
        audio.playbackRate = PLAYBACK_RATE; // some browsers reset it on play()
        this.setSpeaking(true);
        reveal();
      };
      audio.onended = () => {
        if (this.epoch !== playback.epoch) return;
        this.events.onTextProgress(playback.responseId, event.text, true);
        this.cleanup(playback);
        this.active = null;
        this.setSpeaking(false);
      };
      audio.onerror = () => {
        if (this.epoch !== playback.epoch) return;
        this.failOver(event, playback, 'Voice playback failed — using the built-in voice.');
      };

      await audio.play();
    } catch (err) {
      if (this.epoch !== playback.epoch) return;
      const message = err instanceof Error ? err.message : 'Cartesia voice unavailable.';
      this.failOver(event, playback, `${message} Using the built-in voice.`);
    }
  }

  /** Cartesia failed for this response: hand off to speechSynthesis + transcript pacing. */
  private failOver(
    event: Extract<AudioStreamEvent, { kind: 'tts' }>,
    playback: ActivePlayback,
    message: string,
  ): void {
    this.cleanup(playback);
    this.active = null;
    this.epoch++;
    this.setSpeaking(false);
    this.events.onAudioUnavailable(message);
    this.events.onDrivingFailed(playback.responseId);
    this.fallback.handle(event);
  }

  stop(): void {
    this.epoch++;
    if (this.active) {
      this.cleanup(this.active);
      this.active = null;
    }
    this.fallback.stop();
    this.setSpeaking(false);
  }

  private cleanup(playback: ActivePlayback): void {
    if (playback.raf !== null) cancelAnimationFrame(playback.raf);
    if (playback.audio) {
      playback.audio.onplaying = null;
      playback.audio.onended = null;
      playback.audio.onerror = null;
      try { playback.audio.pause(); } catch { /* noop */ }
      playback.audio = null;
    }
    if (playback.objectUrl) {
      URL.revokeObjectURL(playback.objectUrl);
      playback.objectUrl = null;
    }
  }

  private setSpeaking(s: boolean): void {
    if (this.speaking !== s) {
      this.speaking = s;
      this.events.onSpeakingChange(s);
    }
  }
}
