import type { Card } from './types';
import { RANK_NAMES, RANK_WORDS } from './types';

// Focused 5-of-7 hand evaluator. Scores are directly comparable numbers:
// category (0..8) packed above five 4-bit tiebreaker ranks.

export const HAND_CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

export interface HandRank {
  score: number;
  category: number;
  name: string;
  /** The exact five cards this rank was computed from. */
  cards: Card[];
}

function pack(category: number, ranks: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) {
    score = score * 16 + (ranks[i] ?? 0);
  }
  return score;
}

/** Returns the high card of a straight formed by `ranks` (desc, unique), or 0. */
function straightHigh(ranks: number[]): number {
  const set = new Set(ranks);
  // Ace can play low.
  if (set.has(14)) set.add(1);
  const sorted = [...set].sort((a, b) => b - a);
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] - 1) {
      run++;
      if (run >= 5) return sorted[i] + 4;
    } else {
      run = 1;
    }
  }
  return 0;
}

function score5(cards: Card[]): { score: number; category: number; detail: number[] } {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const sHigh = straightHigh(ranks);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Sort by count desc then rank desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (isFlush && sHigh) {
    return { score: pack(HAND_CATEGORY.STRAIGHT_FLUSH, [sHigh]), category: HAND_CATEGORY.STRAIGHT_FLUSH, detail: [sHigh] };
  }
  if (groups[0][1] === 4) {
    const detail = [groups[0][0], groups[1][0]];
    return { score: pack(HAND_CATEGORY.QUADS, detail), category: HAND_CATEGORY.QUADS, detail };
  }
  if (groups[0][1] === 3 && groups[1][1] >= 2) {
    const detail = [groups[0][0], groups[1][0]];
    return { score: pack(HAND_CATEGORY.FULL_HOUSE, detail), category: HAND_CATEGORY.FULL_HOUSE, detail };
  }
  if (isFlush) {
    return { score: pack(HAND_CATEGORY.FLUSH, ranks), category: HAND_CATEGORY.FLUSH, detail: ranks };
  }
  if (sHigh) {
    return { score: pack(HAND_CATEGORY.STRAIGHT, [sHigh]), category: HAND_CATEGORY.STRAIGHT, detail: [sHigh] };
  }
  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map((g) => g[0]);
    const detail = [groups[0][0], ...kickers];
    return { score: pack(HAND_CATEGORY.TRIPS, detail), category: HAND_CATEGORY.TRIPS, detail };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const detail = [groups[0][0], groups[1][0], groups[2][0]];
    return { score: pack(HAND_CATEGORY.TWO_PAIR, detail), category: HAND_CATEGORY.TWO_PAIR, detail };
  }
  if (groups[0][1] === 2) {
    const detail = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
    return { score: pack(HAND_CATEGORY.PAIR, detail), category: HAND_CATEGORY.PAIR, detail };
  }
  return { score: pack(HAND_CATEGORY.HIGH_CARD, ranks), category: HAND_CATEGORY.HIGH_CARD, detail: ranks };
}

function nameFor(category: number, detail: number[]): string {
  switch (category) {
    case HAND_CATEGORY.STRAIGHT_FLUSH:
      return detail[0] === 14 ? 'Royal Flush' : `Straight Flush, ${RANK_NAMES[detail[0]]} high`;
    case HAND_CATEGORY.QUADS:
      return `Four of a Kind, ${RANK_WORDS[detail[0]]}`;
    case HAND_CATEGORY.FULL_HOUSE:
      return `Full House, ${RANK_WORDS[detail[0]]} over ${RANK_WORDS[detail[1]]}`;
    case HAND_CATEGORY.FLUSH:
      return `Flush, ${RANK_NAMES[detail[0]]} high`;
    case HAND_CATEGORY.STRAIGHT:
      return `Straight, ${RANK_NAMES[detail[0]]} high`;
    case HAND_CATEGORY.TRIPS:
      return `Three of a Kind, ${RANK_WORDS[detail[0]]}`;
    case HAND_CATEGORY.TWO_PAIR:
      return `Two Pair, ${RANK_WORDS[detail[0]]} and ${RANK_WORDS[detail[1]]}`;
    case HAND_CATEGORY.PAIR:
      return `Pair of ${RANK_WORDS[detail[0]]}`;
    default:
      return `${RANK_NAMES[detail[0]]} high`;
  }
}

/** Evaluate the best 5-card hand from 5, 6 or 7 cards. */
export function evaluateHand(cards: Card[]): HandRank {
  if (cards.length < 5) throw new Error(`evaluateHand needs at least 5 cards, got ${cards.length}`);
  let best: { score: number; category: number; detail: number[]; cards: Card[] } | null = null;
  const n = cards.length;
  const combo: Card[] = [];
  // Enumerate all 5-card subsets.
  const pick = (start: number) => {
    if (combo.length === 5) {
      const s = score5(combo);
      if (!best || s.score > best.score) best = { ...s, cards: [...combo] };
      return;
    }
    for (let i = start; i <= n - (5 - combo.length); i++) {
      combo.push(cards[i]);
      pick(i + 1);
      combo.pop();
    }
  };
  pick(0);
  const b = best as unknown as { score: number; category: number; detail: number[]; cards: Card[] };
  return { score: b.score, category: b.category, name: nameFor(b.category, b.detail), cards: b.cards };
}
