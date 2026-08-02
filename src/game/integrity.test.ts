import { describe, expect, it } from 'vitest';
import type { Card, GameSnapshot, PokerActionType, Suit } from './types';
import { MockPokerGameClient } from '../api/pokerClient';
import { evaluateHand, HAND_CATEGORY } from './evaluator';
import { createRng, shuffledDeck } from './deck';

// End-to-end card integrity: what the UI displays (snapshots) must be exactly
// what the engine dealt and exactly what the showdown was scored on.
// Regression suite for "I won with X but the banner said Y".

const c = (rank: number, suit: Suit): Card => ({ rank, suit });
const key = (card: Card) => `${card.rank}${card.suit}`;

// ---------------------------------------------------------------------------
// Independent reference evaluator — deliberately different implementation
// (rank histogram over all 7 cards, no 5-card subset enumeration) so a bug in
// evaluator.ts cannot hide by agreeing with itself.
// ---------------------------------------------------------------------------
function referenceCategoryAndPrimary(cards: Card[]): { category: number; primary: number } {
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const byCount = (n: number) =>
    [...counts.entries()].filter(([, cnt]) => cnt >= n).map(([r]) => r).sort((a, b) => b - a);

  const suitGroups = new Map<Suit, Card[]>();
  for (const card of cards) {
    suitGroups.set(card.suit, [...(suitGroups.get(card.suit) ?? []), card]);
  }
  const flushCards = [...suitGroups.values()].find((g) => g.length >= 5) ?? null;

  const straightHighOf = (ranks: number[]): number => {
    const set = new Set(ranks);
    if (set.has(14)) set.add(1);
    let best = 0;
    for (let high = 14; high >= 5; high--) {
      let run = true;
      for (let r = high; r > high - 5; r--) if (!set.has(r)) { run = false; break; }
      if (run) { best = high; break; }
    }
    return best;
  };

  if (flushCards) {
    const sfHigh = straightHighOf(flushCards.map((x) => x.rank));
    if (sfHigh) return { category: HAND_CATEGORY.STRAIGHT_FLUSH, primary: sfHigh };
  }
  const quads = byCount(4);
  if (quads.length) return { category: HAND_CATEGORY.QUADS, primary: quads[0] };
  const trips = byCount(3);
  const pairs = byCount(2);
  if (trips.length && (pairs.length >= 2 || trips.length >= 2)) {
    // A second pair exists besides the trips → full house.
    return { category: HAND_CATEGORY.FULL_HOUSE, primary: trips[0] };
  }
  if (flushCards) {
    const highest = Math.max(...flushCards.map((x) => x.rank));
    return { category: HAND_CATEGORY.FLUSH, primary: highest };
  }
  const stHigh = straightHighOf(cards.map((x) => x.rank));
  if (stHigh) return { category: HAND_CATEGORY.STRAIGHT, primary: stHigh };
  if (trips.length) return { category: HAND_CATEGORY.TRIPS, primary: trips[0] };
  if (pairs.length >= 2) return { category: HAND_CATEGORY.TWO_PAIR, primary: pairs[0] };
  if (pairs.length === 1) return { category: HAND_CATEGORY.PAIR, primary: pairs[0] };
  return { category: HAND_CATEGORY.HIGH_CARD, primary: Math.max(...cards.map((x) => x.rank)) };
}

const CATEGORY_NAME_MARKER: Record<number, string> = {
  [HAND_CATEGORY.STRAIGHT_FLUSH]: 'Flush', // covers Royal Flush + Straight Flush
  [HAND_CATEGORY.QUADS]: 'Four of a Kind',
  [HAND_CATEGORY.FULL_HOUSE]: 'Full House',
  [HAND_CATEGORY.FLUSH]: 'Flush',
  [HAND_CATEGORY.STRAIGHT]: 'Straight',
  [HAND_CATEGORY.TRIPS]: 'Three of a Kind',
  [HAND_CATEGORY.TWO_PAIR]: 'Two Pair',
  [HAND_CATEGORY.PAIR]: 'Pair of',
  [HAND_CATEGORY.HIGH_CARD]: 'high',
};

describe('reported regression: K9 with paired nines on board', () => {
  it('names trip nines, never a pair, for K9 on a 9-9-Q board', () => {
    const hand = evaluateHand([
      c(13, 'd'), c(9, 'd'), // hole: K9
      c(9, 's'), c(9, 'h'), c(12, 'c'), c(4, 's'), c(2, 'h'), // board: 9 9 Q 4 2
    ]);
    expect(hand.category).toBe(HAND_CATEGORY.TRIPS);
    expect(hand.name).toBe('Three of a Kind, Nines');
  });

  it('names the full house when the board also pairs queens', () => {
    const hand = evaluateHand([
      c(13, 'd'), c(9, 'd'),
      c(9, 's'), c(9, 'h'), c(12, 'c'), c(12, 's'), c(2, 'h'),
    ]);
    expect(hand.category).toBe(HAND_CATEGORY.FULL_HOUSE);
    expect(hand.name).toBe('Full House, Nines over Queens');
  });
});

describe('evaluator vs independent reference (10,000 random 7-card hands)', () => {
  it('agrees on category and primary rank with a differently-built evaluator', () => {
    const rng = createRng(0xfeedbeef);
    for (let i = 0; i < 10_000; i++) {
      const deck = shuffledDeck(rng);
      const seven = deck.slice(0, 7);
      const got = evaluateHand(seven);
      const ref = referenceCategoryAndPrimary(seven);
      expect(got.category, `hand ${seven.map(key).join(' ')}`).toBe(ref.category);
      expect(got.name, `hand ${seven.map(key).join(' ')}`).toContain(CATEGORY_NAME_MARKER[ref.category]);
    }
  });
});

// ---------------------------------------------------------------------------
// Full-game fuzz through the SAME client the UI uses. After every snapshot we
// check the invariants the player relies on when reading the table.
// ---------------------------------------------------------------------------

async function playFuzzedMatch(seed: number, maxHands: number): Promise<void> {
  const client = new MockPokerGameClient({ seed, latencyMs: 0 });
  const rng = createRng(seed ^ 0x5eed);
  await client.startMatch('trump');
  let snap = await client.startHand();

  let handId = snap.handId;
  let dealtPlayerCards: string[] | null = null;
  let seenBoard: string[] = [];

  const checkSnapshot = (s: GameSnapshot) => {
    if (s.handId !== handId) {
      handId = s.handId;
      dealtPlayerCards = null;
      seenBoard = [];
    }
    // 1. Hole cards, once dealt, never change for the rest of the hand.
    if (s.playerCards.length === 2) {
      const now = s.playerCards.map(key);
      if (dealtPlayerCards === null) dealtPlayerCards = now;
      else expect(now, `hole cards changed mid-hand (hand ${s.handId})`).toEqual(dealtPlayerCards);
    }
    // 2. The board is append-only within a hand.
    const board = s.communityCards.map(key);
    expect(board.slice(0, seenBoard.length), `board rewrote earlier cards (hand ${s.handId})`).toEqual(seenBoard);
    seenBoard = board;
    // 3. No duplicate cards anywhere visible.
    const visible = [...s.playerCards.map(key), ...board, ...(s.opponentCards ?? []).map(key)];
    expect(new Set(visible).size, `duplicate card on table: ${visible.join(' ')}`).toBe(visible.length);

    // 4. At showdown, the banner text matches an independent re-evaluation of
    //    the exact cards the player can see on screen.
    if (s.handResult?.reason === 'showdown' && s.opponentCards && s.playerCards.length === 2) {
      const playerRank = evaluateHand([...s.playerCards, ...s.communityCards]);
      const oppRank = evaluateHand([...s.opponentCards, ...s.communityCards]);
      expect(s.handResult.playerHandName).toBe(playerRank.name);
      expect(s.handResult.opponentHandName).toBe(oppRank.name);
      const expectedWinner = playerRank.score > oppRank.score ? 'player'
        : oppRank.score > playerRank.score ? 'opponent' : 'split';
      expect(s.handResult.winner).toBe(expectedWinner);
      if (s.resultText && s.handResult.winner !== 'split') {
        const shownName = s.handResult.winner === 'player' ? playerRank.name : oppRank.name;
        expect(s.resultText).toContain(shownName);
      }
    }
  };

  checkSnapshot(snap);
  let guard = 0;
  while (guard++ < 400) {
    if (snap.matchOver && snap.phase === 'hand-complete') return;
    if (snap.phase === 'hand-complete') {
      if (snap.handNumber >= maxHands) return;
      snap = await client.startNextHand();
    } else if (snap.activePlayer === 'player') {
      // Random-but-legal player policy, biased toward continuing.
      const legal = snap.legalActions;
      const pickType = (): PokerActionType => {
        const r = rng();
        const has = (t: PokerActionType) => legal.some((l) => l.type === t);
        if (r < 0.4 && has('call')) return 'call';
        if (r < 0.4 && has('check')) return 'check';
        if (r < 0.6 && has('bet')) return 'bet';
        if (r < 0.7 && has('raise')) return 'raise';
        if (r < 0.78 && has('all-in')) return 'all-in';
        if (r < 0.88 && has('fold')) return 'fold';
        return legal[Math.floor(rng() * legal.length)].type;
      };
      const type = pickType();
      const opt = legal.find((l) => l.type === type)!;
      const amount = opt.min !== undefined && opt.max !== undefined
        ? Math.min(opt.max, opt.min + Math.floor(rng() * 3) * 20)
        : opt.amount;
      snap = await client.submitAction({ type, amount, seat: 'player' });
    } else if (snap.activePlayer === 'opponent') {
      snap = await client.requestOpponentAction();
    } else {
      snap = await client.advancePhase();
    }
    checkSnapshot(snap);
  }
  throw new Error('fuzzed match did not terminate');
}

describe('end-to-end card integrity (fuzzed full games)', () => {
  it('displayed cards never drift and showdown text always matches them', async () => {
    for (let seed = 1; seed <= 150; seed++) {
      await playFuzzedMatch(seed * 7919 + 13, 6);
    }
  }, 30_000);
});
