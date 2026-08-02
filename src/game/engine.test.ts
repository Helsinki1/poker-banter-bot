import { describe, expect, it } from 'vitest';
import {
  advancePhase, applyAction, createMatch, isActionLegal, legalActionsFor,
  snapshot, startHand, type EngineState,
} from './engine';
import type { Card, PokerAction, Seat, Suit } from './types';
import { BIG_BLIND, SMALL_BLIND, STARTING_STACK } from './types';

const c = (rank: number, suit: Suit): Card => ({ rank, suit });

/** Advance through automatic phases until an action phase or terminal state. */
function run(s: EngineState, max = 30): EngineState {
  let cur = s;
  for (let i = 0; i < max; i++) {
    if (cur.toAct !== null || cur.phase === 'hand-complete' || cur.matchOver) return cur;
    const next = advancePhase(cur);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

/** Start a hand with a rigged deck (dealt: non-button, button, non-button, button, burn, flop x3, burn, turn, burn, river). */
function riggedHand(deck: Card[], seed = 42): EngineState {
  let s = createMatch('einstein', seed);
  s = startHand(s); // phase: shuffling
  s = { ...s, deck };
  return run(s);
}

const act = (s: EngineState, seat: Seat, type: PokerAction['type'], amount?: number) =>
  applyAction(s, { type, amount, seat });

// Deck helper: button is 'opponent' on hand 1, so deal order is
// player, opponent, player, opponent.
const DECK = [
  c(14, 's'), // player card 1
  c(2, 'd'),  // opponent card 1
  c(14, 'h'), // player card 2
  c(7, 'c'),  // opponent card 2
  c(9, 'd'),  // burn
  c(5, 's'), c(10, 'd'), c(3, 'c'), // flop
  c(4, 'h'), // burn
  c(12, 'd'), // turn
  c(6, 'h'), // burn
  c(8, 's'), // river
  c(2, 'c'), c(3, 'd'), c(4, 'c'), c(5, 'h'), // spare
];

describe('hand setup', () => {
  it('posts blinds and deals two cards each; button (SB) acts first preflop', () => {
    const s = riggedHand(DECK);
    expect(s.playerCards).toHaveLength(2);
    expect(s.opponentCards).toHaveLength(2);
    expect(s.buttonSeat).toBe('opponent');
    // Button posts SB, other posts BB.
    expect(s.opponentCommitted).toBe(SMALL_BLIND);
    expect(s.playerCommitted).toBe(BIG_BLIND);
    expect(s.toAct).toBe('opponent');
    expect(s.phase).toBe('preflop-opponent-action');
  });

  it('rotates the button between hands', () => {
    let s = riggedHand(DECK);
    s = act(s, 'opponent', 'fold');
    s = run(s);
    expect(s.phase).toBe('hand-complete');
    s = run(advancePhase(s)); // resetting-hand -> next hand
    s = run(s);
    expect(s.buttonSeat).toBe('player');
    expect(s.playerCommitted).toBe(SMALL_BLIND);
    expect(s.toAct).toBe('player');
  });
});

describe('legal actions', () => {
  it('facing the BB, the SB may fold, call, raise or go all-in — not check or bet', () => {
    const s = riggedHand(DECK);
    const types = legalActionsFor(s, 'opponent').map((l) => l.type).sort();
    expect(types).toEqual(['all-in', 'call', 'fold', 'raise']);
  });

  it('never offers actions to the seat not on turn', () => {
    const s = riggedHand(DECK);
    expect(legalActionsFor(s, 'player')).toEqual([]);
  });

  it('BB may check or raise after a limp (option)', () => {
    let s = riggedHand(DECK);
    s = act(s, 'opponent', 'call');
    expect(s.toAct).toBe('player');
    const types = legalActionsFor(s, 'player').map((l) => l.type).sort();
    expect(types).toEqual(['all-in', 'check', 'raise']);
  });

  it('enforces minimum raise = last raise size and maximum = stack', () => {
    let s = riggedHand(DECK);
    s = act(s, 'opponent', 'raise', 60); // SB raises to 60 (raise size 40)
    const raise = legalActionsFor(s, 'player').find((l) => l.type === 'raise');
    expect(raise?.min).toBe(100); // 60 + 40
    expect(raise?.max).toBe(STARTING_STACK); // commit-to cap
    expect(isActionLegal(s, { type: 'raise', amount: 99, seat: 'player' })).toBe(false);
    expect(isActionLegal(s, { type: 'raise', amount: 100, seat: 'player' })).toBe(true);
    expect(isActionLegal(s, { type: 'raise', amount: STARTING_STACK + 1, seat: 'player' })).toBe(false);
  });

  it('rejects illegal actions with a throw', () => {
    const s = riggedHand(DECK);
    expect(() => act(s, 'opponent', 'check')).toThrow(/Illegal/);
    expect(() => act(s, 'player', 'call')).toThrow(/Illegal/);
  });

  it('postflop, first to act may check or bet with min = big blind', () => {
    let s = riggedHand(DECK);
    s = act(s, 'opponent', 'call');
    s = act(s, 'player', 'check');
    s = run(s); // deal flop
    expect(s.phase).toBe('flop-player-action'); // non-button first postflop
    const legal = legalActionsFor(s, 'player');
    const bet = legal.find((l) => l.type === 'bet');
    expect(legal.find((l) => l.type === 'check')).toBeTruthy();
    expect(bet?.min).toBe(BIG_BLIND);
  });
});

describe('fold resolution', () => {
  it('awards the pot to the non-folder and refunds the uncalled excess', () => {
    let s = riggedHand(DECK);
    s = act(s, 'opponent', 'raise', 100);
    s = act(s, 'player', 'fold');
    expect(s.phase).toBe('fold-resolution');
    expect(s.handResult?.winner).toBe('opponent');
    // Matched amount = BB (20): pot should be 40; excess 80 refunded.
    expect(s.handResult?.potWon).toBe(40);
    s = run(s);
    expect(s.phase).toBe('hand-complete');
    expect(s.opponentStack).toBe(STARTING_STACK + BIG_BLIND);
    expect(s.playerStack).toBe(STARTING_STACK - BIG_BLIND);
  });
});

describe('showdown resolution', () => {
  function playToShowdown(): EngineState {
    let s = riggedHand(DECK);
    s = act(s, 'opponent', 'call');
    s = act(s, 'player', 'check');
    s = run(s);
    s = act(s, 'player', 'bet', 40);
    s = act(s, 'opponent', 'call');
    s = run(s);
    s = act(s, 'player', 'check');
    s = act(s, 'opponent', 'check');
    s = run(s);
    s = act(s, 'player', 'check');
    s = act(s, 'opponent', 'check');
    return run(s);
  }

  it('reaches showdown through all four streets and awards the better hand', () => {
    const s = playToShowdown();
    expect(s.phase).toBe('hand-complete');
    // Player had AA vs 7-2: player wins pot of 120 (40 blinds matched + 80 flop).
    expect(s.handResult?.winner).toBe('player');
    expect(s.handResult?.reason).toBe('showdown');
    expect(s.playerStack).toBe(STARTING_STACK + 60);
    expect(s.opponentStack).toBe(STARTING_STACK - 60);
    expect(s.handResult?.playerHandName).toContain('Pair of Aces');
  });

  it('reveals opponent cards only at showdown', () => {
    let s = riggedHand(DECK);
    expect(snapshot(s).opponentCards).toBeUndefined();
    const done = playToShowdown();
    expect(snapshot(done).opponentCards).toHaveLength(2);
  });

  it('splits the pot on equal hands', () => {
    // Both play the board: community is a royal flush.
    const deck = [
      c(2, 's'), c(2, 'd'), c(3, 's'), c(3, 'd'),
      c(9, 'd'), // burn
      c(14, 'h'), c(13, 'h'), c(12, 'h'), // flop
      c(4, 'h'), // burn
      c(11, 'h'), // turn
      c(6, 'h'), // burn
      c(10, 'h'), // river
    ];
    let s = riggedHand(deck);
    s = act(s, 'opponent', 'call');
    s = act(s, 'player', 'check');
    s = run(s);
    for (const street of [0, 1, 2]) {
      void street;
      s = act(s, 'player', 'check');
      s = act(s, 'opponent', 'check');
      s = run(s);
    }
    expect(s.phase).toBe('hand-complete');
    expect(s.handResult?.winner).toBe('split');
    expect(s.playerStack).toBe(STARTING_STACK);
    expect(s.opponentStack).toBe(STARTING_STACK);
  });
});

describe('all-in behavior', () => {
  it('runs out the remaining streets automatically when both are all-in', () => {
    let s = riggedHand(DECK);
    s = act(s, 'opponent', 'all-in');
    expect(s.toAct).toBe('player');
    const types = legalActionsFor(s, 'player').map((l) => l.type).sort();
    expect(types).toEqual(['call', 'fold']); // cannot raise an all-in that covers us
    s = act(s, 'player', 'call');
    s = run(s);
    expect(s.phase).toBe('hand-complete');
    // AA holds on this board: player doubles, and the busted opponent
    // immediately re-buys at the player's new stack (arcade format).
    expect(s.playerStack).toBe(STARTING_STACK * 2);
    expect(s.opponentStack).toBe(STARTING_STACK * 2);
    expect(s.matchOver).toBe(false);
    expect(s.opponentRebuys).toBe(1);
    expect(s.opponentRebuyAmount).toBe(STARTING_STACK * 2);
    // The re-buy marker is transient: cleared once the next hand starts.
    const next = startHand(s);
    expect(next.opponentRebuyAmount).toBeUndefined();
    expect(next.opponentRebuys).toBe(1);
  });

  it('ends the match only when the PLAYER busts — no re-buy for the player', () => {
    let s = riggedHand(DECK);
    // Swap hole cards so the opponent holds AA and the player 7-2.
    s = { ...s, playerCards: s.opponentCards, opponentCards: s.playerCards };
    s = act(s, 'opponent', 'all-in');
    s = act(s, 'player', 'call');
    s = run(s);
    expect(s.phase).toBe('hand-complete');
    expect(s.playerStack).toBe(0);
    expect(s.opponentStack).toBe(STARTING_STACK * 2);
    expect(s.matchOver).toBe(true);
    expect(s.opponentRebuys).toBe(0);
    expect(s.opponentRebuyAmount).toBeUndefined();
  });

  it('caps the call at the shorter stack and refunds the excess', () => {
    let s = riggedHand(DECK);
    // Give the player a short stack.
    s = { ...s, playerStack: 180 }; // + 20 committed = 200 total
    s = act(s, 'opponent', 'all-in'); // to 2000
    s = act(s, 'player', 'call'); // only 200 total
    s = run(s);
    expect(s.phase).toBe('hand-complete');
    // Player wins 400 total (200 each); opponent keeps the refunded 1800.
    expect(s.playerStack).toBe(400);
    expect(s.opponentStack).toBe(STARTING_STACK - 200);
  });
});

describe('snapshot integrity', () => {
  it('exposes pot, stacks, call amount, raise bounds and active player', () => {
    let s = riggedHand(DECK);
    s = act(s, 'opponent', 'raise', 60);
    const snap = snapshot(s);
    expect(snap.pot).toBe(80);
    expect(snap.amountToCall).toBe(40);
    expect(snap.minimumRaise).toBe(100);
    expect(snap.maximumRaise).toBe(STARTING_STACK);
    expect(snap.activePlayer).toBe('player');
    expect(snap.previousAction?.type).toBe('raise');
    expect(snap.playerCards).toHaveLength(2);
    expect(snap.opponentCards).toBeUndefined();
  });
});
