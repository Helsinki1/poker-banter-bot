import type { EngineState } from './engine';
import { legalActionsFor } from './engine';
import type { LegalAction, OpponentId, PokerAction } from './types';
import { BIG_BLIND } from './types';
import { createRng } from './deck';
import { evaluateHand, HAND_CATEGORY } from './evaluator';
import { getActivePokerPersona, type PokerPersona } from './personas';

// Persona-flavored stochastic opponent decisions. Every legal action gets an
// equity-aware weight, the active persona skews those weights (aggression,
// bluffing, shove appetite, hero-calls, noise), and one action is sampled
// from the distribution. Deterministic for a given engine state (seeded from
// rngState + action count) so demo scenes and tests are reproducible.
// Deliberately replaceable by a backend decision service later — same
// inputs, same PokerAction output.

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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Sample one key from a weight map (weights need not be normalized). */
function sample<T extends string>(weights: Record<T, number>, roll: number): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((acc, [, w]) => acc + Math.max(0, w), 0);
  if (total <= 0) return entries[0][0];
  let cursor = roll * total;
  for (const [key, w] of entries) {
    cursor -= Math.max(0, w);
    if (cursor <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** In-hand read of the player used by adaptive personas (Ivey-style). */
function playerRead(s: EngineState): { raises: number; passives: number } {
  let raises = 0;
  let passives = 0;
  for (const a of s.actionLog) {
    if (a.seat !== 'player') continue;
    if (a.type === 'bet' || a.type === 'raise' || a.type === 'all-in') raises++;
    else if (a.type === 'check' || a.type === 'call') passives++;
  }
  return { raises, passives };
}

export function decideOpponentAction(s: EngineState): PokerAction {
  const legal = legalActionsFor(s, 'opponent');
  if (legal.length === 0) throw new Error('AI asked to act out of turn');
  const p: PokerPersona = getActivePokerPersona();
  const rng = createRng((s.rngState ^ (s.actionLog.length * 7919) ^ s.handNumber * 104729) >>> 0);

  const pot = s.pot + s.playerCommitted + s.opponentCommitted;
  const toCall = Math.max(0, s.playerCommitted - s.opponentCommitted);

  const find = (t: PokerAction['type']) => legal.find((l) => l.type === t);
  const check = find('check');
  const call = find('call');
  const bet = find('bet');
  const raiseA = find('raise');
  const fold = find('fold');
  const allIn = find('all-in');

  // Perceived strength = real equity + persona noise (chaotic personas
  // misjudge more), nudged by adaptive reads on the player.
  const strength = handStrength(s);
  let perceived = clamp01(strength + (rng() - 0.5) * p.chaos * 0.5);
  let bluffMod = 1;
  let aggroMod = 1;
  if (p.adapt) {
    const read = playerRead(s);
    if (read.raises >= 2) {
      // Player is fighting back — respect it: fewer bluffs, tighter value.
      perceived = clamp01(perceived - 0.05);
      bluffMod = 0.55;
    } else if (read.passives >= 2 && read.raises === 0) {
      // Player is passive — ramp up the pressure mercilessly.
      aggroMod = 1.35;
      bluffMod = 1.4;
    }
  }
  const aggression = clamp01(p.aggression * aggroMod);
  const bluff = clamp01(p.bluff * bluffMod);

  // Shove appetite scales with how large the shove is relative to the pot:
  // short-stack jams are near-standard, huge overbet jams stay special.
  const shoveTo = allIn?.min ?? 0;
  const shoveOverPot = shoveTo / Math.max(pot, BIG_BLIND * 2);
  const shoveScale = shoveOverPot <= 3 ? 1.4 : shoveOverPot <= 6 ? 0.9 : 0.5;

  const sizeMul = () => 1 - p.sizingJitter / 2 + rng() * p.sizingJitter;

  if (toCall === 0) {
    const opener = bet ?? raiseA;
    let wCheck = 0.9 - perceived * 0.4;
    let wOpen = 0;
    let wShove = 0;
    if (opener) {
      if (perceived > 0.62) wOpen = 1.4 + aggression;
      else if (perceived > 0.42) wOpen = aggression * 1.1;
      else wOpen = bluff * 0.9;
    }
    if (allIn) {
      if (perceived >= p.shoveStrength) wShove = p.shove * 2.2 * shoveScale;
      else if (perceived > 0.5) wShove = p.shove * 0.55 * shoveScale;
      else wShove = p.shove * bluff * 0.45 * shoveScale; // fearless bluff-jam
    }
    if (perceived > 0.72) wCheck *= 0.3; // monsters rarely slow-play forever

    const pick = sample({ check: wCheck, open: wOpen, shove: wShove }, rng());
    if (pick === 'shove' && allIn) {
      return { type: 'all-in', amount: allIn.min, seat: 'opponent' };
    }
    if (pick === 'open' && opener) {
      const desired = Math.max(BIG_BLIND, pot * p.sizing * sizeMul());
      const target = opener.type === 'raise' ? s.playerCommitted + desired : desired;
      return { type: opener.type, amount: clampAmount(opener, target), seat: 'opponent' };
    }
    if (check) return { type: 'check', seat: 'opponent' };
  }

  // Facing chips. Compare perceived equity against the price.
  const potOdds = toCall / Math.max(1, pot + toCall);
  const edge = perceived - potOdds;
  // A shove leaves no raise behind (or calling puts a stack at risk).
  const facingShove = s.previousAction?.type === 'all-in' || (!raiseA && !allIn);

  let wFold = fold ? Math.max(0.08, -edge * 3.2) * (1.35 - p.sticky) : 0;
  let wCall = 0;
  if (call) {
    wCall = edge > 0
      ? 1 + edge * 3 + p.sticky * 0.5
      : Math.max(0.12, p.sticky * (1 + edge * 2));
  }
  let wRaise = 0;
  let wShove = 0;
  if (raiseA) {
    if (perceived > 0.68) wRaise = 1.1 + aggression;
    else if (perceived > 0.5) wRaise = aggression * 0.6;
    else wRaise = bluff * 0.35; // check-raise / re-bluff line
  }
  if (allIn) {
    if (perceived >= p.shoveStrength) wShove = p.shove * 2 * shoveScale;
    else if (perceived > 0.55) wShove = p.shove * 0.6 * shoveScale;
    else wShove = p.shove * bluff * 0.3 * shoveScale;
  }

  if (facingShove && call) {
    // Personas do NOT roll over to all-ins: hero-call floor keeps a real
    // calling range, scaled down only when the hand is truly hopeless.
    const floor = p.heroCall * (perceived > 0.3 ? 1.15 : 0.3);
    wCall = Math.max(wCall, floor);
    wFold *= 1 - p.heroCall * 0.55;
  }

  const pick = sample({ fold: wFold, call: wCall, raise: wRaise, shove: wShove }, rng());
  if (pick === 'shove' && allIn) {
    return { type: 'all-in', amount: allIn.min, seat: 'opponent' };
  }
  if (pick === 'raise' && raiseA) {
    const desired = s.playerCommitted + Math.max(s.lastRaiseSize, pot * p.sizing * sizeMul());
    return { type: 'raise', amount: clampAmount(raiseA, desired), seat: 'opponent' };
  }
  if (pick === 'call' && call) return { type: 'call', seat: 'opponent' };
  if (pick === 'fold' && fold) return { type: 'fold', seat: 'opponent' };
  if (call) return { type: 'call', seat: 'opponent' };
  if (check) return { type: 'check', seat: 'opponent' };
  // Fallback: some legal action always exists.
  const first = legal[0];
  return { type: first.type, amount: first.min, seat: 'opponent' };
}

/** Character-flavored think time in ms (bounded so hands never stall). */
export function thinkTimeMs(opponentId: OpponentId, rand: number): number {
  switch (opponentId) {
    case 'einstein': return 900 + rand * 1400; // deliberate
    case 'lebron': return 450 + rand * 650; // decisive
    case 'trump': return 500 + rand * 700; // decisive, impatient
  }
}
