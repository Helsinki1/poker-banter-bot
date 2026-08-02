import type { Card, GameSnapshot, OpponentId, PokerAction } from '../game/types';
import type { EngineState } from '../game/engine';
import {
  advancePhase, applyAction, createMatch, isActionPhase, snapshot, startHand,
} from '../game/engine';
import { decideOpponentAction } from '../game/ai';

// The narrow poker API boundary. The real backend will implement this same
// interface; nothing in the UI may touch game state through any other path.
// NOTE: the conversation layer has NO reference to this client — speech can
// never submit poker actions (see src/api/conversationClient.ts).

export interface PokerGameClient {
  startMatch(opponentId: OpponentId): Promise<GameSnapshot>;
  startHand(): Promise<GameSnapshot>;
  /** Step one automatic (non-action) phase — lets the UI pace dealer animations. */
  advancePhase(): Promise<GameSnapshot>;
  submitAction(action: PokerAction): Promise<GameSnapshot>;
  requestOpponentAction(): Promise<GameSnapshot>;
  startNextHand(): Promise<GameSnapshot>;
  getSnapshot(): GameSnapshot;
}

export interface MockPokerOptions {
  /** Deterministic seed for demo scenes and tests. */
  seed?: number;
  /** Simulated network latency in ms (0 in tests). */
  latencyMs?: number;
  /** Rigged deck per hand number (visual-review scenes only). */
  riggedDecks?: Card[][];
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockPokerGameClient implements PokerGameClient {
  private state: EngineState | null = null;
  private readonly seed?: number;
  private readonly latencyMs: number;
  private readonly riggedDecks?: Card[][];

  constructor(options: MockPokerOptions = {}) {
    this.seed = options.seed;
    this.latencyMs = options.latencyMs ?? 30;
    this.riggedDecks = options.riggedDecks;
  }

  private rig(next: EngineState): EngineState {
    const rigged = this.riggedDecks?.[next.handNumber - 1];
    return rigged ? { ...next, deck: [...rigged] } : next;
  }

  private require(): EngineState {
    if (!this.state) throw new Error('Match not started');
    return this.state;
  }

  private async settle(next: EngineState): Promise<GameSnapshot> {
    this.state = next;
    if (this.latencyMs > 0) await delay(this.latencyMs);
    return snapshot(next);
  }

  async startMatch(opponentId: OpponentId): Promise<GameSnapshot> {
    return this.settle(createMatch(opponentId, this.seed));
  }

  async startHand(): Promise<GameSnapshot> {
    return this.settle(this.rig(startHand(this.require())));
  }

  async advancePhase(): Promise<GameSnapshot> {
    return this.settle(advancePhase(this.require()));
  }

  async submitAction(action: PokerAction): Promise<GameSnapshot> {
    const s = this.require();
    if (!isActionPhase(s.phase)) throw new Error(`No action allowed in phase ${s.phase}`);
    return this.settle(applyAction(s, action));
  }

  async requestOpponentAction(): Promise<GameSnapshot> {
    const s = this.require();
    if (s.toAct !== 'opponent') throw new Error('Opponent is not the active player');
    const decision = decideOpponentAction(s);
    return this.settle(applyAction(s, decision));
  }

  async startNextHand(): Promise<GameSnapshot> {
    return this.settle(this.rig(startHand(this.require())));
  }

  getSnapshot(): GameSnapshot {
    return snapshot(this.require());
  }
}
