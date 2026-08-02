import type {
  AudioStreamEvent, ConversationContext, ConversationError, NpcConversationState,
  PublicGameSnapshot, RealtimeConversationClient, TranscriptEvent, Unsubscribe,
} from './conversationClient';
import type { OpponentId } from '../game/types';
import { createRng } from '../game/deck';
import {
  emptyMemory, generateNpcLine, npcPerspectiveResult, rememberHand, rememberTurn,
  VOICE_PROFILES, type ConversationMemory, type NpcTrigger,
} from './npcScript';
import { streamBanterLine, cleanAssembledLine } from './llmBanter';
import { TextChunker } from '../voice/chunker';
import { CHARACTER_MAP } from '../characters/data';
import type { NpcVoice } from '../voice/cartesiaTts';

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

interface ActiveResponse {
  id: string;
  timers: ReturnType<typeof setTimeout>[];
  snapshotHandId: string;
  street: string | null;
  /** Aborts the in-flight LLM stream on barge-in or a stale-context cancel. */
  controller: AbortController;
}

/**
 * A reply generated during the turn.eager_end window, before the player's turn
 * was confirmed. Buffered, never audible, and discarded if speech resumes.
 */
interface SpeculativeResponse {
  id: string;
  text: string;
  controller: AbortController;
  /** Deltas received so far, consumed in order once promoted. */
  deltas: string[];
  done: boolean;
  failed: boolean;
  /** Wakes a promoted consumer waiting on the next delta. */
  notify: (() => void) | null;
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
  private npcVoice: NpcVoice = 'normal';
  private memory: ConversationMemory = emptyMemory();
  private rng: () => number;
  private latencyScale: number;
  private dropRate: number;
  private responseCounter = 0;
  private activeResponse: ActiveResponse | null = null;
  private speculative: SpeculativeResponse | null = null;
  /** A speculative response whose turn was confirmed and is now being spoken. */
  private promoted: SpeculativeResponse | null = null;
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
    this.discardSpeculative();
    for (const t of this.activeTimersMisc) clearTimeout(t);
    this.activeTimersMisc = [];
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

  /** Persona for LLM banter — follows the voice picked in the Voice Dock. */
  setNpcVoice(voice: NpcVoice): void {
    this.npcVoice = voice;
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
      else if (act.type === 'fold') this.memory.playerFolds++;
      else this.memory.playerPassiveActions++;
    }
    this.memory.biggestPotSeen = Math.max(this.memory.biggestPotSeen, snapshot.pot);

    // Record completed hands once.
    if (snapshot.winner && snapshot.resultText && snapshot.handNumber > this.lastResultHand) {
      this.lastResultHand = snapshot.handNumber;
      // The UI's resultText says "you"/"opponent" from the PLAYER's seat; the
      // NPC prompt and its spoken recaps need the NPC's own perspective.
      const headline = npcPerspectiveResult(snapshot.winner, snapshot.resultText);
      rememberHand(this.memory, {
        handNumber: snapshot.handNumber,
        winner: snapshot.winner,
        potWon: snapshot.pot,
        reason: snapshot.resultText.includes('fold') ? 'fold' : 'showdown',
        headline,
      });
      this.scheduleResponse({ kind: 'hand-result', winner: snapshot.winner, resultText: headline }, 600);
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

    // If a speculative response for this exact text is already in flight, keep
    // it — it has a head start of however long the eager window lasted.
    if (this.speculative?.text === trimmed) {
      const promoted = this.speculative;
      this.speculative = null;
      rememberTurn(this.memory, 'player', trimmed);
      emit(this.playerTranscriptE, { text: trimmed, final: true });
      this.promoteSpeculative(promoted);
      return;
    }
    this.discardSpeculative();

    rememberTurn(this.memory, 'player', trimmed);
    // The transcript is already final — emit it as-is. (It used to be replayed
    // word-by-word on a timer, which delayed the reply by ~60ms per word.)
    emit(this.playerTranscriptE, { text: trimmed, final: true });
    // No artificial think delay: a reply to speech should start immediately.
    this.scheduleResponse({ kind: 'player-utterance', text: trimmed }, 0);
  }

  /**
   * Cartesia thinks the player has probably stopped talking. Start generating
   * now, but do not commit it to memory or emit a transcript — `turn.resume`
   * may retract this, and `sendPlayerUtterance` promotes it if confirmed.
   */
  sendSpeculativeUtterance(text: string): void {
    if (!this.context || this.state === 'disconnected' || this.state === 'connecting') return;
    const trimmed = text.trim();
    if (!trimmed || this.speculative?.text === trimmed) return;
    this.discardSpeculative();
    // Never barge in on the NPC for a guess — only a confirmed turn does that.
    if (this.activeResponse) return;

    const id = `resp-${++this.responseCounter}`;
    const controller = new AbortController();
    this.speculative = {
      id, text: trimmed, controller, deltas: [], done: false, failed: false, notify: null,
    };
    void this.bufferSpeculative(this.speculative, trimmed, controller);
  }

  /** The eager guess was wrong — the player kept talking. */
  cancelSpeculativeUtterance(): void {
    this.discardSpeculative();
  }

  private discardSpeculative(): void {
    if (!this.speculative) return;
    this.speculative.controller.abort();
    this.speculative = null;
  }

  /**
   * Generate a speculative reply into a queue rather than to the speakers.
   * Nothing is heard unless the turn is confirmed. Once promoted, the SAME
   * stream keeps filling the queue and the consumer drains it — the request is
   * never reissued, so the head start is kept and tokens are not paid twice.
   */
  private async bufferSpeculative(
    spec: SpeculativeResponse,
    text: string,
    controller: AbortController,
  ): Promise<void> {
    if (!this.context) return;
    const opponentId = this.context.opponentId;
    const stillWanted = () => this.speculative === spec || this.promoted === spec;
    try {
      const stream = streamBanterLine(
        CHARACTER_MAP[opponentId].name, this.npcVoice,
        { kind: 'player-utterance', text }, this.memory, this.snapshot, controller.signal,
      );
      for await (const delta of stream) {
        if (!stillWanted()) return; // retracted or superseded
        spec.deltas.push(delta);
        spec.notify?.();
      }
    } catch {
      spec.failed = true;
    } finally {
      spec.done = true;
      spec.notify?.();
    }
  }

  /** Drain a promoted speculative stream as an async iterator. */
  private async *drainSpeculative(spec: SpeculativeResponse): AsyncGenerator<string, void, void> {
    let i = 0;
    for (;;) {
      while (i < spec.deltas.length) yield spec.deltas[i++];
      if (spec.done) return;
      // Wait for the producer to push more (or finish).
      await new Promise<void>((resolve) => { spec.notify = resolve; });
      spec.notify = null;
    }
  }

  interruptNpc(): void {
    if (!this.activeResponse) return;
    this.clearResponseTimers();
    const id = this.activeResponse.id;
    // Stop paying for tokens nobody will hear.
    this.activeResponse.controller.abort();
    this.activeResponse = null;
    this.releasePromoted();
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
    return VOICE_PROFILES[(this.context?.opponentId ?? 'dana') as OpponentId];
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

    const response: ActiveResponse = {
      id,
      timers: [],
      snapshotHandId: this.snapshot?.handId ?? '',
      street: this.snapshot?.street ?? null,
      controller: new AbortController(),
    };
    this.activeResponse = response;
    this.setState('thinking');

    // thinkMs is deliberate pacing for unprompted commentary (a beat after the
    // flop feels human). Replies to the player use 0 — every ms is dead air.
    const startNow = thinkMs <= 0;
    const begin = () => {
      if (this.activeResponse?.id !== id) return;
      void this.speakStream(id, response, opponentId, trigger);
    };
    if (startNow) begin();
    else response.timers.push(setTimeout(begin, thinkMs * this.latencyScale));
  }

  /**
   * Speak a fully-known scripted line. Used when the LLM is unavailable: the
   * whole text goes to TTS at once, and because that path (speechSynthesis)
   * reports no word timings, the transcript is revealed on timers so subtitles
   * still read at a human pace instead of appearing all at once.
   */
  private speakScriptedLine(id: string, response: ActiveResponse, line: string): void {
    rememberTurn(this.memory, 'npc', line);
    this.setState('speaking');
    if (this.npcAudioEnabled) {
      emit(this.npcAudioE, { kind: 'tts', responseId: id, text: line, voice: this.voice(), last: false });
    }

    const words = line.split(/\s+/);
    let elapsed = 0;
    let acc = '';
    words.forEach((w) => {
      elapsed += (45 + this.rng() * 40) * this.latencyScale;
      response.timers.push(setTimeout(() => {
        if (this.activeResponse?.id !== id) return;
        acc = acc ? `${acc} ${w}` : w;
        emit(this.npcTranscriptE, { text: acc, final: false, responseId: id });
      }, elapsed));
    });

    elapsed += 120 * this.latencyScale;
    response.timers.push(setTimeout(() => {
      if (this.activeResponse?.id !== id) return;
      emit(this.npcTranscriptE, { text: line, final: true, responseId: id });
      emit(this.npcAudioE, { kind: 'tts', responseId: id, text: '', voice: this.voice(), last: true });
      this.activeResponse = null;
      this.releasePromoted();
      this.setState(this.micEnabled ? 'listening' : 'connected');
    }, elapsed));
  }

  /** Detach a promoted speculative stream once its response is over. */
  private releasePromoted(): void {
    if (!this.promoted) return;
    this.promoted.controller.abort();
    this.promoted.notify?.();
    this.promoted = null;
  }

  /**
   * Adopt an already-buffered speculative response. Its generation started
   * during the eager-end window, so first audio can be nearly instant.
   */
  private promoteSpeculative(spec: SpeculativeResponse): void {
    if (!this.context) return;
    const response = {
      id: spec.id,
      timers: [] as ReturnType<typeof setTimeout>[],
      snapshotHandId: this.snapshot?.handId ?? '',
      street: this.snapshot?.street ?? null,
      controller: spec.controller,
    };
    this.activeResponse = response;
    this.promoted = spec;

    // Whatever was buffered is spoken immediately; the rest of the stream (if
    // still open) continues to flow through the same chunker.
    void this.speakStream(spec.id, response, this.context.opponentId,
      { kind: 'player-utterance', text: spec.text }, spec);
  }

  /**
   * Stream one NPC response: LLM deltas → sentence fragments → TTS, with the
   * transcript following the same fragments. Nothing waits for the full line.
   */
  private async speakStream(
    id: string,
    response: ActiveResponse,
    opponentId: OpponentId,
    trigger: NpcTrigger,
    adopted?: SpeculativeResponse,
  ): Promise<void> {
    const chunker = new TextChunker();
    let assembled = '';
    let spokeAnything = false;

    const shipFragment = (fragment: string) => {
      if (!fragment) return;
      if (!spokeAnything) {
        spokeAnything = true;
        this.setState('speaking');
      }
      assembled = assembled ? `${assembled} ${fragment}` : fragment;
      if (this.npcAudioEnabled) {
        emit(this.npcAudioE, {
          kind: 'tts', responseId: id, text: fragment, voice: this.voice(), last: false,
        });
      }
      // Transcript mirrors what has been sent to the synthesizer. When audio is
      // playing, the player re-paces this against real word timings.
      emit(this.npcTranscriptE, { text: assembled, final: false, responseId: id });
    };

    try {
      // A promoted speculative response continues its EXISTING stream — issuing
      // a second request here would interleave two different replies.
      const stream = adopted
        ? this.drainSpeculative(adopted)
        : streamBanterLine(
          CHARACTER_MAP[opponentId].name, this.npcVoice, trigger,
          this.memory, this.snapshot, response.controller.signal,
        );
      for await (const delta of stream) {
        if (this.activeResponse?.id !== id) return; // interrupted mid-stream
        for (const fragment of chunker.push(delta)) shipFragment(fragment);
      }
      const tail = chunker.flush();
      if (tail) {
        if (this.activeResponse?.id !== id) return;
        shipFragment(tail);
      }
    } catch {
      // Fall through: partial text already spoken stands on its own.
    }

    if (this.activeResponse?.id !== id) return;

    // Nothing came back (no key, aborted, or API failure) — the scripted line
    // guarantees the table never goes silent. It takes the non-streamed path:
    // the full text is known at once and there are no word timestamps to pace
    // subtitles against, so the transcript is paced on timers instead.
    if (!assembled) {
      const scripted = generateNpcLine(opponentId, trigger, this.memory, this.snapshot, this.rng);
      this.speakScriptedLine(id, response, scripted);
      return;
    }

    const finalLine = cleanAssembledLine(assembled);
    rememberTurn(this.memory, 'npc', finalLine);
    emit(this.npcTranscriptE, { text: finalLine, final: true, responseId: id });
    // Closes the TTS context; queued audio finishes playing on its own.
    emit(this.npcAudioE, { kind: 'tts', responseId: id, text: '', voice: this.voice(), last: true });
    this.activeResponse = null;
    this.releasePromoted();
    this.setState(this.micEnabled ? 'listening' : 'connected');
  }
}
