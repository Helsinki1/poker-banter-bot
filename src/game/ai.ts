import type { EngineState } from './engine';
import { legalActionsFor } from './engine';
import type { LegalAction, OpponentId, PokerAction } from './types';
import { BIG_BLIND } from './types';
import { createRng } from './deck';
import { evaluateHand, HAND_CATEGORY } from './evaluator';

// Lightweight, character-flavored opponent decisions.
// Deterministic for a given engine state (seeded from rngState + action count)
// so demo scenes and tests are reproducible. Deliberately replaceable by a
// backend decision service later — same inputs, same PokerAction output.

interface Personality {
  /** 0..1 — how often to prefer aggressive lines with medium hands. */
  aggression: number;
  /** 0..1 — how often to bluff with weak hands. */
  bluff: number;
  /** Typical bet sizing as a fraction of pot. */
  sizing: number;
  /** 0..1 — willingness to call with marginal hands. */
  sticky: number;
}

const PERSONALITIES: Record<OpponentId, Personality> = {
  einstein: { aggression: 0.42, bluff: 0.14, sizing: 0.55, sticky: 0.5 },
  lebron: { aggression: 0.68, bluff: 0.22, sizing: 0.85, sticky: 0.45 },
  negreanu: { aggression: 0.5, bluff: 0.3, sizing: 0.4, sticky: 0.65 },
};

/** Rough 0..1 strength of the opponent's hand at the current street. */
export function handStrength(s: EngineState): number {
  const hole = s.opponentCards;
  if (hole.length < 2) return 0.3;
  if (s.communityCards.length === 0) {
    // Preflop heuristic: pairs strong, high cards decent, suited/connected bonus.
    const [a, b] = hole;
    const hi = Math.max(a.rank, b.rank);
    const lo = Math.min(a.rank, b.rank);
    let v = (hi + lo) / 28 * 0.55;
    if (a.rank === b.rank) v = 0.5 + (a.rank / 14) * 0.45;
    else {
      if (a.suit === b.suit) v += 0.06;
      if (hi - lo === 1) v += 0.05;
      if (hi === 14) v += 0.08;
    }
    return Math.min(1, v);
  }
  const rank = evaluateHand([...hole, ...s.communityCards]);
  const boardOnly = s.communityCards.length >= 5
    ? evaluateHand(s.communityCards)
    : null;
  // Category-based strength, discounted when the board alone plays.
  let v = 0.18 + rank.category * 0.105;
  if (rank.category === HAND_CATEGORY.PAIR) {
    // Distinguish top pair from weak pair by whether a hole card participates.
    const holeRanks = new Set(hole.map((c) => c.rank));
    const boardRanks = s.communityCards.map((c) => c.rank);
    const pairUsesHole = boardRanks.some((r) => holeRanks.has(r)) || hole[0].rank === hole[1].rank;
    if (!pairUsesHole) v -= 0.12;
  }
  if (boardOnly && boardOnly.score === rank.score) v = 0.35; // playing the board
  return Math.max(0.05, Math.min(1, v));
}

function clampAmount(l: LegalAction, desired: number): number {
  return Math.max(l.min ?? desired, Math.min(l.max ?? desired, Math.round(desired)));
}

export function decideOpponentAction(s: EngineState): PokerAction {
  const legal = legalActionsFor(s, 'opponent');
  if (legal.length === 0) throw new Error('AI asked to act out of turn');
  const p = PERSONALITIES[s.opponentId];
  const rng = createRng((s.rngState ^ (s.actionLog.length * 7919) ^ s.handNumber * 104729) >>> 0);
  const roll = rng();
  const strength = handStrength(s);
  const pot = s.pot + s.playerCommitted + s.opponentCommitted;
  const toCall = Math.max(0, s.playerCommitted - s.opponentCommitted);

  const find = (t: PokerAction['type']) => legal.find((l) => l.type === t);
  const check = find('check');
  const call = find('call');
  const bet = find('bet');
  const raiseA = find('raise');
  const fold = find('fold');

  // Negreanu adapts: if the player has been raising a lot this hand, tighten up slightly.
  let adjStrength = strength;
  if (s.opponentId === 'negreanu') {
    const playerAggro = s.actionLog.filter((a) => a.seat === 'player' && (a.type === 'raise' || a.type === 'bet')).length;
    adjStrength = Math.min(1, strength + (playerAggro >= 2 ? -0.06 : 0.04));
  }
  // LeBron keeps pressure after aggression: more likely to fire again.
  const aggroBoost = s.opponentId === 'lebron' &&
    s.actionLog.some((a) => a.seat === 'opponent' && (a.type === 'raise' || a.type === 'bet')) ? 0.12 : 0;

  const wantAggro = adjStrength > 0.62 ||
    (adjStrength > 0.42 && roll < p.aggression + aggroBoost) ||
    (adjStrength <= 0.42 && roll < p.bluff);

  if (toCall === 0) {
    const opener = bet ?? raiseA;
    if (wantAggro && opener) {
      const sizeJitter = 0.75 + rng() * 0.5;
      const desired = Math.max(BIG_BLIND, pot * p.sizing * sizeJitter) + (opener.type === 'raise' ? toCall : 0);
      const target = opener.type === 'raise' ? s.playerCommitted + desired : desired;
      return { type: opener.type, amount: clampAmount(opener, target), seat: 'opponent' };
    }
    if (check) return { type: 'check', seat: 'opponent' };
  }

  // Facing a bet.
  const potOdds = toCall / Math.max(1, pot + toCall);
  const callable = adjStrength + (p.sticky - 0.5) * 0.25 > potOdds + 0.12;

  if (wantAggro && raiseA && adjStrength > 0.55) {
    const desired = s.playerCommitted + Math.max(s.lastRaiseSize, pot * p.sizing);
    return { type: 'raise', amount: clampAmount(raiseA, desired), seat: 'opponent' };
  }
  if (call && (callable || roll < p.sticky * 0.4)) {
    return { type: 'call', seat: 'opponent' };
  }
  if (check) return { type: 'check', seat: 'opponent' };
  if (fold) return { type: 'fold', seat: 'opponent' };
  // Fallback: some legal action always exists.
  const first = legal[0];
  return { type: first.type, amount: first.min, seat: 'opponent' };
}

/** Character-flavored think time in ms (bounded so hands never stall). */
export function thinkTimeMs(opponentId: OpponentId, rand: number): number {
  switch (opponentId) {
    case 'einstein': return 900 + rand * 1400; // deliberate
    case 'lebron': return 450 + rand * 650; // decisive
    case 'negreanu': return 600 + rand * 900;
  }
}
