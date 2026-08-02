import type {
  AudioStreamEvent, ConversationContext, ConversationError, NpcConversationState,
  PublicGameSnapshot, RealtimeConversationClient, TranscriptEvent, Unsubscribe,
} from './conversationClient';
import type { OpponentId } from '../game/types';
import { createRng } from '../game/deck';
import {
  emptyMemory, generateNpcLine, rememberHand, rememberTurn, VOICE_PROFILES,
  type ConversationMemory, type NpcTrigger,
} from './npcScript';

// Local mock of the realtime conversation backend. Demonstrates the complete
// streaming interaction loop with no production credentials:
// connection latency, incremental NPC text, chunked "audio", interruption,
// cancellation, independent mutes, simulated drops and reconnection.
//
// There is intentionally NO code path from anything in this file to the
// poker engine — this class cannot submit poker actions.

interface Emitter<T> {
  listeners: Set<(v: T) => void>;
}
function emitter<T>(): Emitter<T> {
  return { listeners: new Set() };
}
function emit<T>(e: Emitter<T>, v: T): void {
  for (const l of [...e.listeners]) l(v);
}
function sub<T>(e: Emitter<T>, cb: (v: T) => void): Unsubscribe {
  e.listeners.add(cb);
  return () => e.listeners.delete(cb);
}

export interface MockConversationOptions {
  seed?: number;
  /** Base latency scale; 0 makes everything immediate (tests). */
  latencyScale?: number;
  /** Probability per response of a simulated recoverable connection drop. */
  dropRate?: number;
}

export class MockRealtimeConversationClient implements RealtimeConversationClient {
  private state: NpcConversationState = 'disconnected';
  private context: ConversationContext | null = null;
  private snapshot: PublicGameSnapshot | null = null;
  private micEnabled = false;
  private npcAudioEnabled = true;
  private memory: ConversationMemory = emptyMemory();
  private rng: () => number;
  private latencyScale: number;
  private dropRate: number;
  private responseCounter = 0;
  private activeResponse: { id: string; timers: ReturnType<typeof setTimeout>[]; snapshotHandId: string; street: string | null } | null = null;
  private lastResultHand = 0;

  private playerTranscriptE = emitter<TranscriptEvent>();
  private npcTranscriptE = emitter<TranscriptEvent>();
  private npcAudioE = emitter<AudioStreamEvent>();
  private stateE = emitter<NpcConversationState>();
  private errorE = emitter<ConversationError>();

  constructor(options: MockConversationOptions = {}) {
    this.rng = createRng(options.seed ?? 0xbadc0de);
    this.latencyScale = options.latencyScale ?? 1;
    this.dropRate = options.dropRate ?? 0;
  }

  // --- lifecycle -----------------------------------------------------------

  async connect(context: ConversationContext): Promise<void> {
    this.context = context;
    this.snapshot = context.snapshot;
    this.setState('connecting');
    await this.wait(500 + this.rng() * 500);
    this.setState('connected');
    // Character greets the player shortly after connecting.
    this.scheduleResponse({ kind: 'greeting' }, 350);
  }

  async disconnect(): Promise<void> {
    this.cancelCurrentResponse();
    this.context = null;
    this.setState('disconnected');
  }

  setMicrophoneEnabled(enabled: boolean): void {
    this.micEnabled = enabled;
    if (this.state === 'connected' || this.state === 'listening') {
      this.setState(enabled ? 'listening' : 'connected');
    }
  }

  setNpcAudioEnabled(enabled: boolean): void {
    this.npcAudioEnabled = enabled;
  }

  // --- game context --------------------------------------------------------

  updateGameContext(snapshot: PublicGameSnapshot): void {
    const prev = this.snapshot;
    this.snapshot = snapshot;
    if (!this.context) return;

    // Cancel responses that are materially outdated (street or hand changed).
    if (this.activeResponse &&
      (this.activeResponse.snapshotHandId !== snapshot.handId ||
        (this.activeResponse.street !== null && this.activeResponse.street !== snapshot.street))) {
      this.cancelCurrentResponse();
    }

    // Bounded memory bookkeeping.
    const act = snapshot.previousAction;
    if (act && act.seat === 'player' && act !== prev?.previousAction) {
      if (act.type === 'bet' || act.type === 'raise' || act.type === 'all-in') this.memory.playerAggressiveActions++;
      else this.memory.playerPassiveActions++;
    }
    this.memory.biggestPotSeen = Math.max(this.memory.biggestPotSeen, snapshot.pot);

    // Record completed hands once.
    if (snapshot.winner && snapshot.resultText && snapshot.handNumber > this.lastResultHand) {
      this.lastResultHand = snapshot.handNumber;
      rememberHand(this.memory, {
        handNumber: snapshot.handNumber,
        winner: snapshot.winner,
        potWon: snapshot.pot,
        reason: snapshot.resultText.includes('fold') ? 'fold' : 'showdown',
        headline: snapshot.resultText,
      });
      this.scheduleResponse({ kind: 'hand-result', winner: snapshot.winner, resultText: snapshot.resultText }, 600);
      return;
    }

    // Occasional street commentary (never after every event).
    const streetChanged = prev && prev.street !== snapshot.street && snapshot.street && snapshot.street !== 'preflop';
    if (streetChanged && !this.activeResponse && this.rng() < 0.65) {
      this.scheduleResponse({ kind: 'street-dealt', street: snapshot.street as string }, 700);
      return;
    }
    const playerActed = act && act.seat === 'player' && act !== prev?.previousAction;
    if (playerActed && !this.activeResponse && this.rng() < 0.4) {
      this.scheduleResponse({ kind: 'player-action', action: act.type, amount: act.amount }, 800);
    }
  }

  // --- player speech (text in, talk out — never poker actions) -------------

  sendPlayerUtterance(text: string): void {
    if (!this.context || this.state === 'disconnected' || this.state === 'connecting') return;
    const trimmed = text.trim();
    if (!trimmed) return;
    // Barge-in: a new player utterance interrupts any current NPC response.
    if (this.activeResponse) this.interruptNpc();
    rememberTurn(this.memory, 'player', trimmed);
    // Stream the "incremental transcription" of the utterance word by word.
    const words = trimmed.split(/\s+/);
    let acc = '';
    words.forEach((w, i) => {
      const t = setTimeout(() => {
        acc = acc ? `${acc} ${w}` : w;
        emit(this.playerTranscriptE, { text: acc, final: i === words.length - 1 });
        if (i === words.length - 1) {
          this.scheduleResponse({ kind: 'player-utterance', text: trimmed }, 150);
        }
      }, i * 60 * this.latencyScale);
      this.activeTimersMisc.push(t);
    });
  }

  interruptNpc(): void {
    if (!this.activeResponse) return;
    this.clearResponseTimers();
    const id = this.activeResponse.id;
    this.activeResponse = null;
    // Cancelled audio must stop: signal a final empty audio chunk.
    emit(this.npcAudioE, { kind: 'tts', responseId: id, text: '', voice: this.voice(), last: true, cancelled: true });
    this.setState('interrupted');
    const t = setTimeout(() => {
      if (this.state === 'interrupted') this.setState(this.micEnabled ? 'listening' : 'connected');
    }, 250 * this.latencyScale);
    this.activeTimersMisc.push(t);
  }

  cancelCurrentResponse(): void {
    this.interruptNpc();
  }

  // --- events --------------------------------------------------------------

  onPlayerTranscript(cb: (e: TranscriptEvent) => void): Unsubscribe { return sub(this.playerTranscriptE, cb); }
  onNpcTranscript(cb: (e: TranscriptEvent) => void): Unsubscribe { return sub(this.npcTranscriptE, cb); }
  onNpcAudio(cb: (e: AudioStreamEvent) => void): Unsubscribe { return sub(this.npcAudioE, cb); }
  onNpcStateChange(cb: (s: NpcConversationState) => void): Unsubscribe { return sub(this.stateE, cb); }
  onError(cb: (e: ConversationError) => void): Unsubscribe { return sub(this.errorE, cb); }

  /** Test/dev hook: force a simulated recoverable connection drop. */
  simulateConnectionDrop(): void {
    this.cancelCurrentResponse();
    this.setState('reconnecting');
    emit(this.errorE, { recoverable: true, message: 'Connection lost — reconnecting…', code: 'connection-lost' });
    const t = setTimeout(() => {
      if (this.context) this.setState(this.micEnabled ? 'listening' : 'connected');
    }, 1500 * this.latencyScale);
    this.activeTimersMisc.push(t);
  }

  /** Test/dev hook: inspect bounded memory. */
  getMemory(): ConversationMemory {
    return this.memory;
  }

  getState(): NpcConversationState {
    return this.state;
  }

  // --- internals -----------------------------------------------------------

  private activeTimersMisc: ReturnType<typeof setTimeout>[] = [];

  private voice() {
    return VOICE_PROFILES[(this.context?.opponentId ?? 'einstein') as OpponentId];
  }

  private setState(s: NpcConversationState): void {
    this.state = s;
    emit(this.stateE, s);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms * this.latencyScale));
  }

  private clearResponseTimers(): void {
    if (this.activeResponse) {
      for (const t of this.activeResponse.timers) clearTimeout(t);
      this.activeResponse.timers = [];
    }
  }

  private scheduleResponse(trigger: NpcTrigger, thinkMs: number): void {
    if (!this.context) return;
    // Only one NPC response at a time — a new trigger replaces a pending one.
    if (this.activeResponse) this.interruptNpc();

    if (this.dropRate > 0 && this.rng() < this.dropRate) {
      this.simulateConnectionDrop();
      return;
    }

    const id = `resp-${++this.responseCounter}`;
    const opponentId = this.context.opponentId;
    const line = generateNpcLine(opponentId, trigger, this.memory, this.snapshot, this.rng);
    rememberTurn(this.memory, 'npc', line);

    const response = {
      id,
      timers: [] as ReturnType<typeof setTimeout>[],
      snapshotHandId: this.snapshot?.handId ?? '',
      street: this.snapshot?.street ?? null,
    };
    this.activeResponse = response;
    this.setState('thinking');

    const words = line.split(/\s+/);
    let elapsed = thinkMs * this.latencyScale;

    // Response start → speaking.
    response.timers.push(setTimeout(() => {
      if (this.activeResponse?.id !== id) return;
      this.setState('speaking');
      // Audio begins with the FIRST safe chunk, before full text exists.
      if (this.npcAudioEnabled) {
        emit(this.npcAudioE, { kind: 'tts', responseId: id, text: line, voice: this.voice(), last: false });
      }
    }, elapsed));

    // Stream text word by word.
    let acc = '';
    words.forEach((w) => {
      elapsed += (45 + this.rng() * 40) * this.latencyScale;
      response.timers.push(setTimeout(() => {
        if (this.activeResponse?.id !== id) return;
        acc = acc ? `${acc} ${w}` : w;
        emit(this.npcTranscriptE, { text: acc, final: false, responseId: id });
      }, elapsed));
    });

    // Completion.
    elapsed += 120 * this.latencyScale;
    response.timers.push(setTimeout(() => {
      if (this.activeResponse?.id !== id) return;
      emit(this.npcTranscriptE, { text: line, final: true, responseId: id });
      emit(this.npcAudioE, { kind: 'tts', responseId: id, text: '', voice: this.voice(), last: true });
      this.activeResponse = null;
      this.setState(this.micEnabled ? 'listening' : 'connected');
    }, elapsed));
  }
}
