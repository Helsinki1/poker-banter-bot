import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockPokerGameClient } from './pokerClient';
import { MockRealtimeConversationClient } from './mockConversationClient';
import { toPublicSnapshot } from './conversationClient';
import type { GameSnapshot } from '../game/types';

// GAME_GOAL requirement: speech must NEVER execute, click, focus or modify a
// poker action. These tests speak every phrase from the spec while a hand is
// live and prove authoritative poker state does not move.

const SPOKEN_PHRASES = [
  'Check.',
  'Call.',
  'Fold.',
  'Raise.',
  'Raise to fifty.',
  'Bet the pot.',
  'All in.',
  'I fold.',
  'I call.',
  "Let's check.",
  'You should fold.',
];

describe('speech cannot mutate poker state', () => {
  let poker: MockPokerGameClient;
  let convo: MockRealtimeConversationClient;
  let snap: GameSnapshot;

  beforeEach(async () => {
    vi.useFakeTimers();
    poker = new MockPokerGameClient({ seed: 99, latencyMs: 0 });
    convo = new MockRealtimeConversationClient({ seed: 3, latencyScale: 0 });
    await poker.startMatch('lebron');
    let p = poker.startHand();
    await vi.runAllTimersAsync();
    snap = await p;
    // Reach a PLAYER decision point (the opponent may act first).
    for (let i = 0; i < 20 && snap.activePlayer !== 'player'; i++) {
      p = snap.activePlayer === 'opponent' ? poker.requestOpponentAction() : poker.advancePhase();
      await vi.runAllTimersAsync();
      snap = await p;
      if (snap.phase === 'hand-complete') {
        p = poker.startNextHand();
        await vi.runAllTimersAsync();
        snap = await p;
      }
    }
    const c = convo.connect({ opponentId: 'lebron', snapshot: toPublicSnapshot(snap) });
    await vi.runAllTimersAsync();
    await c;
    convo.setMicrophoneEnabled(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reaches a live player decision point', () => {
    expect(snap.activePlayer).not.toBeNull();
    expect(snap.legalActions.length).toBeGreaterThan(0);
  });

  for (const phrase of SPOKEN_PHRASES) {
    it(`"${phrase}" produces talk only — no state change`, async () => {
      const before = JSON.stringify(poker.getSnapshot());
      convo.sendPlayerUtterance(phrase);
      await vi.runAllTimersAsync(); // let transcription + NPC response fully play out
      const after = JSON.stringify(poker.getSnapshot());
      // Authoritative poker state is byte-identical: no action submitted,
      // no bet amount changed, no phase advanced.
      expect(after).toBe(before);
      // The NPC may respond conversationally.
      expect(convo.getMemory().turns.some((t) => t.speaker === 'player' && t.text === phrase.trim())).toBe(true);
    });
  }

  it('the conversation client exposes no poker-action pathway', () => {
    const proto = Object.getPrototypeOf(convo) as object;
    const methods = Object.getOwnPropertyNames(proto);
    for (const m of methods) {
      expect(m.toLowerCase()).not.toMatch(/poker|bet|raise|fold|submit/);
    }
  });

  it('poker state changes ONLY through the poker client controls', async () => {
    const before = poker.getSnapshot();
    expect(before.activePlayer).toBe('player');
    const legal = before.legalActions[0];
    const p = poker.submitAction({ type: legal.type, amount: legal.min, seat: 'player' });
    await vi.runAllTimersAsync();
    const after = await p;
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
    expect(after.previousAction?.seat).toBe('player');
  });

  it('poker controls keep working while the NPC is speaking', async () => {
    convo.sendPlayerUtterance('nice table');
    // Do NOT flush timers: NPC is mid-response.
    const before = poker.getSnapshot();
    expect(before.activePlayer).toBe('player');
    const legal = before.legalActions.find((l) => l.type === 'call') ?? before.legalActions[0];
    const p = poker.submitAction({ type: legal.type, amount: legal.min, seat: 'player' });
    await vi.runAllTimersAsync();
    const after = await p;
    expect(after.previousAction?.type).toBe(legal.type);
  });
});
