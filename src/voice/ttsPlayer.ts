import type { AudioStreamEvent } from '../api/conversationClient';

// NPC audio playback. Consumes AudioStreamEvents from the conversation
// client. The local mock streams 'tts' directives which we synthesize with
// the browser's speechSynthesis — original synthetic voices shaped by pitch
// and rate, never a cloned or imitated real voice. A production backend
// would stream 'pcm' chunks through the same interface (Web Audio).

export interface TtsPlayerEvents {
  onSpeakingChange(speaking: boolean): void;
  onAudioUnavailable(): void;
}

export class TtsPlayer {
  private muted = false;
  private available: boolean;
  private events: TtsPlayerEvents;
  private currentResponseId: string | null = null;
  private speaking = false;

  constructor(events: TtsPlayerEvents) {
    this.events = events;
    this.available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  isAvailable(): boolean {
    return this.available;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Handle one streamed audio event from the conversation client. */
  handle(event: AudioStreamEvent): void {
    if (event.kind !== 'tts') return; // pcm path reserved for the real backend
    if (event.last) {
      // End of (or cancelled) response — stop anything still queued for it.
      if (this.currentResponseId === event.responseId) this.stop();
      return;
    }
    if (this.muted) return;
    if (!this.available) {
      this.events.onAudioUnavailable();
      return;
    }
    // Only one NPC response may play at a time.
    this.stop();
    this.currentResponseId = event.responseId;
    try {
      const utterance = new SpeechSynthesisUtterance(event.text);
      utterance.pitch = event.voice.pitch;
      utterance.rate = event.voice.rate;
      const voices = window.speechSynthesis.getVoices();
      for (const hint of event.voice.voiceHint) {
        const match = voices.find((v) => v.name.includes(hint));
        if (match) { utterance.voice = match; break; }
      }
      utterance.onstart = () => this.setSpeaking(true);
      utterance.onend = () => this.setSpeaking(false);
      utterance.onerror = () => {
        this.setSpeaking(false);
        // Audio failure must not block anything — subtitles carry the response.
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      this.available = false;
      this.events.onAudioUnavailable();
    }
  }

  /** Immediately stop playback; cancelled audio must not keep playing. */
  stop(): void {
    if (this.available) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    this.currentResponseId = null;
    this.setSpeaking(false);
  }

  private setSpeaking(s: boolean): void {
    if (this.speaking !== s) {
      this.speaking = s;
      this.events.onSpeakingChange(s);
    }
  }
}
