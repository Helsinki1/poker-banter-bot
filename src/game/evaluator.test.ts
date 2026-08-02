import { describe, expect, it } from 'vitest';
import { evaluateHand, HAND_CATEGORY } from './evaluator';
import type { Card, Suit } from './types';

const c = (rank: number, suit: Suit): Card => ({ rank, suit });

describe('evaluateHand', () => {
  it('recognizes a royal flush', () => {
    const hand = evaluateHand([c(14, 's'), c(13, 's'), c(12, 's'), c(11, 's'), c(10, 's'), c(2, 'd'), c(3, 'h')]);
    expect(hand.category).toBe(HAND_CATEGORY.STRAIGHT_FLUSH);
    expect(hand.name).toBe('Royal Flush');
  });

  it('recognizes a straight flush and ranks it above quads', () => {
    const sf = evaluateHand([c(9, 'd'), c(8, 'd'), c(7, 'd'), c(6, 'd'), c(5, 'd')]);
    const quads = evaluateHand([c(14, 's'), c(14, 'h'), c(14, 'd'), c(14, 'c'), c(13, 's')]);
    expect(sf.category).toBe(HAND_CATEGORY.STRAIGHT_FLUSH);
    expect(sf.score).toBeGreaterThan(quads.score);
  });

  it('recognizes four of a kind with kicker tiebreak', () => {
    const a = evaluateHand([c(9, 's'), c(9, 'h'), c(9, 'd'), c(9, 'c'), c(14, 's'), c(2, 'd'), c(3, 'h')]);
    const b = evaluateHand([c(9, 's'), c(9, 'h'), c(9, 'd'), c(9, 'c'), c(13, 's'), c(2, 'd'), c(3, 'h')]);
    expect(a.category).toBe(HAND_CATEGORY.QUADS);
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('recognizes a full house from two trips in 7 cards', () => {
    // 999 + 888 in 7 cards should play 999-88.
    const hand = evaluateHand([c(9, 's'), c(9, 'h'), c(9, 'd'), c(8, 's'), c(8, 'h'), c(8, 'd'), c(2, 'c')]);
    expect(hand.category).toBe(HAND_CATEGORY.FULL_HOUSE);
    expect(hand.name).toContain('Nines over Eights');
  });

  it('recognizes a flush and picks the best five', () => {
    const hand = evaluateHand([c(14, 'h'), c(12, 'h'), c(9, 'h'), c(6, 'h'), c(2, 'h'), c(3, 'h'), c(13, 's')]);
    expect(hand.category).toBe(HAND_CATEGORY.FLUSH);
    expect(hand.name).toBe('Flush, A high');
  });

  it('recognizes a wheel (A-2-3-4-5) straight', () => {
    const hand = evaluateHand([c(14, 's'), c(2, 'd'), c(3, 'h'), c(4, 'c'), c(5, 's'), c(9, 'd'), c(13, 'h')]);
    expect(hand.category).toBe(HAND_CATEGORY.STRAIGHT);
    expect(hand.name).toBe('Straight, 5 high');
  });

  it('does not treat a wheel as the best straight when a higher one exists', () => {
    const hand = evaluateHand([c(14, 's'), c(2, 'd'), c(3, 'h'), c(4, 'c'), c(5, 's'), c(6, 'd'), c(7, 'h')]);
    expect(hand.name).toBe('Straight, 7 high');
  });

  it('recognizes trips, two pair, pair and high card ordering', () => {
    const trips = evaluateHand([c(7, 's'), c(7, 'h'), c(7, 'd'), c(2, 'c'), c(4, 's')]);
    const twoPair = evaluateHand([c(13, 's'), c(13, 'h'), c(4, 'd'), c(4, 'c'), c(9, 's')]);
    const pair = evaluateHand([c(14, 's'), c(14, 'h'), c(9, 'd'), c(5, 'c'), c(3, 's')]);
    const high = evaluateHand([c(14, 's'), c(12, 'h'), c(9, 'd'), c(5, 'c'), c(3, 's')]);
    expect(trips.category).toBe(HAND_CATEGORY.TRIPS);
    expect(twoPair.category).toBe(HAND_CATEGORY.TWO_PAIR);
    expect(pair.category).toBe(HAND_CATEGORY.PAIR);
    expect(high.category).toBe(HAND_CATEGORY.HIGH_CARD);
    expect(trips.score).toBeGreaterThan(twoPair.score);
    expect(twoPair.score).toBeGreaterThan(pair.score);
    expect(pair.score).toBeGreaterThan(high.score);
  });

  it('breaks two-pair ties by the kicker', () => {
    const a = evaluateHand([c(13, 's'), c(13, 'h'), c(4, 'd'), c(4, 'c'), c(14, 's')]);
    const b = evaluateHand([c(13, 'd'), c(13, 'c'), c(4, 'h'), c(4, 's'), c(9, 's')]);
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('scores identical hands equally across suits (split pots)', () => {
    const a = evaluateHand([c(14, 's'), c(13, 'h'), c(9, 'd'), c(5, 'c'), c(3, 's')]);
    const b = evaluateHand([c(14, 'd'), c(13, 'c'), c(9, 'h'), c(5, 's'), c(3, 'd')]);
    expect(a.score).toBe(b.score);
  });
});
