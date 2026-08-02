// Browser dictation adapter. Wraps the Web Speech API where available and
// degrades cleanly: no support → text-input fallback; permission denied →
// clear recoverable error. Dictation output goes ONLY to the conversation
// client as text — it has no reference to the poker layer.

export type DictationStatus =
  | 'unsupported'
  | 'idle'
  | 'starting'
  | 'listening'
  | 'error'
  | 'permission-denied';

export interface DictationEvents {
  onStatus(status: DictationStatus): void;
  /** Incremental (interim) transcript for live display. */
  onInterim(text: string): void;
  /** A finalized utterance, ready to send to the conversation backend. */
  onFinal(text: string): void;
  /**
   * The speaker has *probably* finished, but may resume. Lets the backend
   * start generating early; `onEagerCancel` retracts it if speech continues.
   * Only emitted by adapters with real turn detection.
   */
  onEagerFinal?(text: string): void;
  /** A prior onEagerFinal was premature — the speaker kept going. */
  onEagerCancel?(): void;
  onError(message: string, recoverable: boolean): void;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isDictationSupported(): boolean {
  return typeof window !== 'undefined' && getRecognitionCtor() !== null;
}

export class DictationAdapter {
  private recognition: SpeechRecognitionLike | null = null;
  private events: DictationEvents;
  private status: DictationStatus;
  private wantListening = false;
  /** Consecutive failures without a single result — breaks the restart loop. */
  private consecutiveErrors = 0;

  constructor(events: DictationEvents) {
    this.events = events;
    this.status = isDictationSupported() ? 'idle' : 'unsupported';
  }

  getStatus(): DictationStatus {
    return this.status;
  }

  private setStatus(s: DictationStatus): void {
    this.status = s;
    this.events.onStatus(s);
  }

  /** Start continuous listening (open-mic conversation mode). */
  start(): void {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      this.setStatus('unsupported');
      this.events.onError('Speech recognition is not supported in this browser. Use the text box instead.', true);
      return;
    }
    if (this.recognition) return;
    this.wantListening = true;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => this.setStatus('listening');
    rec.onresult = (e) => {
      this.consecutiveErrors = 0;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript.trim();
        if (res.isFinal) {
          if (text) this.events.onFinal(text);
        } else {
          interim += ` ${text}`;
        }
      }
      if (interim.trim()) this.events.onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.wantListening = false;
        this.setStatus('permission-denied');
        this.events.onError('Microphone permission was denied. You can retry, or use the text box.', true);
      } else if (e.error === 'no-speech' || e.error === 'aborted') {
        // benign — continuous mode restarts via onend
      } else if (e.error === 'network') {
        // Chrome's cloud speech service is unreachable (common on Linux
        // builds). Retrying just flickers the mic forever — stop after two
        // failures and let the caller fall back to another input mode.
        this.consecutiveErrors++;
        if (this.consecutiveErrors >= 2) {
          this.wantListening = false;
          this.setStatus('error');
          this.events.onError(
            "Your browser's speech service is unavailable (network error). Switching to the text box — the game continues.",
            false,
          );
        }
      } else {
        this.consecutiveErrors++;
        if (this.consecutiveErrors >= 3) this.wantListening = false;
        this.setStatus('error');
        this.events.onError(`Speech recognition error: ${e.error}. The game continues — try again or type instead.`, true);
      }
    };
    rec.onend = () => {
      this.recognition = null;
      if (this.wantListening && this.status !== 'permission-denied') {
        // Browsers end continuous sessions periodically; restart quietly.
        setTimeout(() => { if (this.wantListening) this.start(); }, 200);
      } else if (this.status === 'listening') {
        this.setStatus('idle');
      }
    };
    this.recognition = rec;
    this.setStatus('starting');
    try {
      rec.start();
    } catch {
      this.recognition = null;
      this.setStatus('error');
      this.events.onError('Could not start the microphone. Try again or use the text box.', true);
    }
  }

  stop(): void {
    this.wantListening = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* already stopped */ }
      this.recognition = null;
    }
    if (this.status !== 'unsupported' && this.status !== 'permission-denied') {
      this.setStatus('idle');
    }
  }

  destroy(): void {
    this.wantListening = false;
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* noop */ }
      this.recognition = null;
    }
  }
}
