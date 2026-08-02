import type {
  Card, GamePhase, GameSnapshot, HandResult, LegalAction, OpponentId,
  PokerAction, PokerAnimationCue, Seat, Street,
} from './types';
import { BIG_BLIND, SMALL_BLIND, STARTING_STACK } from './types';
import { createRng, shuffledDeck } from './deck';
import { evaluateHand } from './evaluator';

// Authoritative heads-up no-limit hold'em state machine.
// Pure transitions: every mutation returns a new EngineState.
// Non-action phases advance via `advancePhase`; action phases require `applyAction`.

export interface EngineState {
  matchId: string;
  handId: string;
  handNumber: number;
  opponentId: OpponentId;
  phase: GamePhase;
  street: Street | null;
  deck: Card[];
  playerCards: Card[];
  opponentCards: Card[];
  communityCards: Card[];
  /** Chips collected from completed betting rounds. */
  pot: number;
  playerStack: number;
  opponentStack: number;
  /** Committed to the CURRENT betting round. */
  playerCommitted: number;
  opponentCommitted: number;
  buttonSeat: Seat;
  toAct: Seat | null;
  /** Size of the last bet/raise increment on this street (min-raise basis). */
  lastRaiseSize: number;
  actedThisStreet: Seat[];
  actionLog: PokerAction[];
  previousAction?: PokerAction;
  handResult?: HandResult;
  animationCue: PokerAnimationCue;
  matchOver: boolean;
  rngState: number;
}

const other = (seat: Seat): Seat => (seat === 'player' ? 'opponent' : 'player');

function stackOf(s: EngineState, seat: Seat): number {
  return seat === 'player' ? s.playerStack : s.opponentStack;
}
function committedOf(s: EngineState, seat: Seat): number {
  return seat === 'player' ? s.playerCommitted : s.opponentCommitted;
}

let rngCounter = 0;

export function createMatch(opponentId: OpponentId, seed?: number): EngineState {
  const actualSeed = seed ?? ((Date.now() ^ (rngCounter++ * 2654435761)) >>> 0);
  return {
    matchId: `match-${actualSeed.toString(36)}`,
    handId: '',
    handNumber: 0,
    opponentId,
    phase: 'introduction',
    street: null,
    deck: [],
    playerCards: [],
    opponentCards: [],
    communityCards: [],
    pot: 0,
    playerStack: STARTING_STACK,
    opponentStack: STARTING_STACK,
    playerCommitted: 0,
    opponentCommitted: 0,
    buttonSeat: 'opponent',
    toAct: null,
    lastRaiseSize: BIG_BLIND,
    actedThisStreet: [],
    actionLog: [],
    animationCue: null,
    matchOver: false,
    rngState: actualSeed,
  };
}

/** Begin a new hand: rotate the button and enter the shuffle phase. */
export function startHand(s: EngineState): EngineState {
  if (s.matchOver) return s;
  const rng = createRng(s.rngState);
  // Burn one value so consecutive hands differ deterministically.
  const nextSeed = Math.floor(rng() * 0xffffffff) >>> 0;
  const handNumber = s.handNumber + 1;
  return {
    ...s,
    phase: 'shuffling',
    street: null,
    deck: shuffledDeck(createRng(nextSeed)),
    playerCards: [],
    opponentCards: [],
    communityCards: [],
    pot: 0,
    playerCommitted: 0,
    opponentCommitted: 0,
    buttonSeat: handNumber === 1 ? s.buttonSeat : other(s.buttonSeat),
    toAct: null,
    lastRaiseSize: BIG_BLIND,
    actedThisStreet: [],
    actionLog: [],
    previousAction: undefined,
    handResult: undefined,
    handNumber,
    handId: `hand-${handNumber}`,
    animationCue: 'shuffle',
    rngState: nextSeed,
  };
}

function bothAllInOrSettled(s: EngineState): boolean {
  return (s.playerStack === 0 || s.opponentStack === 0) && s.playerCommitted === s.opponentCommitted;
}

function streetForPhase(phase: GamePhase): Street | null {
  if (phase.startsWith('preflop')) return 'preflop';
  if (phase.startsWith('flop') || phase === 'dealing-flop') return 'flop';
  if (phase.startsWith('turn') || phase === 'dealing-turn') return 'turn';
  if (phase.startsWith('river') || phase === 'dealing-river') return 'river';
  return null;
}

function actionPhaseFor(street: Street, seat: Seat): GamePhase {
  return `${street}-${seat}-action` as GamePhase;
}

/** Enter the action phase for `street`, or auto-run to the next deal if everyone is all-in. */
function enterActionOrRunout(s: EngineState, street: Street): EngineState {
  if (bothAllInOrSettled(s)) {
    // No more betting possible — runout continues via advancePhase.
    return { ...s, street, toAct: null, phase: nextDealPhase(street) ?? 'showdown', animationCue: null };
  }
  const first = street === 'preflop' ? s.buttonSeat : other(s.buttonSeat);
  return { ...s, street, toAct: first, phase: actionPhaseFor(street, first), animationCue: null };
}

function nextDealPhase(street: Street): GamePhase | null {
  switch (street) {
    case 'preflop': return 'dealing-flop';
    case 'flop': return 'dealing-turn';
    case 'turn': return 'dealing-river';
    case 'river': return null;
  }
}

/** Advance through automatic (non-action) phases one step at a time so the UI can animate. */
export function advancePhase(s: EngineState): EngineState {
  switch (s.phase) {
    case 'introduction':
      return startHand(s);
    case 'shuffling':
      return { ...s, phase: 'posting-blinds', animationCue: null };
    case 'posting-blinds': {
      // Button posts SB, other posts BB (heads-up).
      const sbSeat = s.buttonSeat;
      const bbSeat = other(sbSeat);
      const sb = Math.min(SMALL_BLIND, stackOf(s, sbSeat));
      const bb = Math.min(BIG_BLIND, stackOf(s, bbSeat));
      const next = { ...s };
      if (sbSeat === 'player') { next.playerStack -= sb; next.playerCommitted = sb; }
      else { next.opponentStack -= sb; next.opponentCommitted = sb; }
      if (bbSeat === 'player') { next.playerStack -= bb; next.playerCommitted = bb; }
      else { next.opponentStack -= bb; next.opponentCommitted = bb; }
      next.lastRaiseSize = BIG_BLIND;
      next.phase = 'dealing-hole-cards';
      next.animationCue = 'deal-hole-cards';
      return next;
    }
    case 'dealing-hole-cards': {
      const deck = [...s.deck];
      // Deal one at a time starting with the non-button seat (as live dealing would).
      const firstSeat = other(s.buttonSeat);
      const hands: Record<Seat, Card[]> = { player: [], opponent: [] };
      for (let i = 0; i < 4; i++) {
        const seat = i % 2 === 0 ? firstSeat : other(firstSeat);
        hands[seat].push(deck.shift() as Card);
      }
      const dealt = { ...s, deck, playerCards: hands.player, opponentCards: hands.opponent };
      return enterActionOrRunout(dealt, 'preflop');
    }
    case 'dealing-flop': {
      const deck = [...s.deck];
      deck.shift(); // burn
      const flop = [deck.shift() as Card, deck.shift() as Card, deck.shift() as Card];
      const dealt = { ...s, deck, communityCards: flop, animationCue: 'deal-flop' as PokerAnimationCue };
      return enterActionOrRunout(dealt, 'flop');
    }
    case 'dealing-turn': {
      const deck = [...s.deck];
      deck.shift();
      const turn = deck.shift() as Card;
      const dealt = { ...s, deck, communityCards: [...s.communityCards, turn], animationCue: 'deal-turn' as PokerAnimationCue };
      return enterActionOrRunout(dealt, 'turn');
    }
    case 'dealing-river': {
      const deck = [...s.deck];
      deck.shift();
      const river = deck.shift() as Card;
      const dealt = { ...s, deck, communityCards: [...s.communityCards, river], animationCue: 'deal-river' as PokerAnimationCue };
      return enterActionOrRunout(dealt, 'river');
    }
    case 'showdown':
      return resolveShowdown(s);
    case 'fold-resolution':
      return { ...s, phase: 'pot-award', animationCue: potCueFor(s.handResult) };
    case 'pot-award':
      return awardPot(s);
    case 'hand-complete':
      return { ...s, phase: 'resetting-hand', animationCue: 'collect-cards' };
    case 'resetting-hand':
      return startHand(s);
    default:
      return s; // action phases do not auto-advance
  }
}

function potCueFor(result?: HandResult): PokerAnimationCue {
  if (!result) return null;
  if (result.winner === 'split') return 'pot-split';
  return result.winner === 'player' ? 'pot-to-player' : 'pot-to-opponent';
}

function resolveShowdown(s: EngineState): EngineState {
  const playerRank = evaluateHand([...s.playerCards, ...s.communityCards]);
  const opponentRank = evaluateHand([...s.opponentCards, ...s.communityCards]);
  const potTotal = s.pot + s.playerCommitted + s.opponentCommitted;
  let winner: Seat | 'split';
  if (playerRank.score > opponentRank.score) winner = 'player';
  else if (opponentRank.score > playerRank.score) winner = 'opponent';
  else winner = 'split';
  const result: HandResult = {
    winner,
    playerHandName: playerRank.name,
    opponentHandName: opponentRank.name,
    playerBestFive: playerRank.cards,
    opponentBestFive: opponentRank.cards,
    reason: 'showdown',
    potWon: potTotal,
  };
  return { ...s, handResult: result, phase: 'pot-award', animationCue: potCueFor(result) };
}

function awardPot(s: EngineState): EngineState {
  const result = s.handResult;
  if (!result) return { ...s, phase: 'hand-complete', animationCue: null };
  const potTotal = s.pot + s.playerCommitted + s.opponentCommitted;
  let playerStack = s.playerStack;
  let opponentStack = s.opponentStack;
  if (result.winner === 'player') playerStack += potTotal;
  else if (result.winner === 'opponent') opponentStack += potTotal;
  else {
    const half = Math.floor(potTotal / 2);
    playerStack += potTotal - half; // odd chip to the player, deterministically
    opponentStack += half;
  }
  const matchOver = playerStack === 0 || opponentStack === 0;
  return {
    ...s,
    playerStack,
    opponentStack,
    pot: 0,
    playerCommitted: 0,
    opponentCommitted: 0,
    phase: 'hand-complete',
    animationCue: null,
    matchOver,
  };
}

/** Legal actions for `seat`, empty unless it is that seat's turn in an action phase. */
export function legalActionsFor(s: EngineState, seat: Seat): LegalAction[] {
  if (s.toAct !== seat) return [];
  const stack = stackOf(s, seat);
  const mine = committedOf(s, seat);
  const theirs = committedOf(s, other(seat));
  const toCall = Math.max(0, theirs - mine);
  const actions: LegalAction[] = [];

  if (toCall === 0) {
    actions.push({ type: 'check' });
    if (stack > 0) {
      const maxTo = mine + stack;
      if (theirs === 0 && mine === 0) {
        // No chips in front this street: opening bet.
        const minTo = Math.min(BIG_BLIND, maxTo);
        actions.push({ type: 'bet', min: minTo, max: maxTo });
      } else {
        // e.g. BB with option preflop: raise over the limp.
        const minTo = Math.min(theirs + s.lastRaiseSize, maxTo);
        if (maxTo > theirs) actions.push({ type: 'raise', min: minTo, max: maxTo });
      }
      actions.push({ type: 'all-in', min: maxTo, max: maxTo });
    }
  } else {
    actions.push({ type: 'fold' });
    actions.push({ type: 'call', amount: Math.min(toCall, stack) });
    const maxTo = mine + stack;
    if (maxTo > theirs && stackOf(s, other(seat)) > 0) {
      const minTo = Math.min(theirs + s.lastRaiseSize, maxTo);
      actions.push({ type: 'raise', min: minTo, max: maxTo });
      actions.push({ type: 'all-in', min: maxTo, max: maxTo });
    }
  }
  return actions;
}

export function isActionLegal(s: EngineState, action: PokerAction): boolean {
  const legal = legalActionsFor(s, action.seat);
  const match = legal.find((l) => l.type === action.type);
  if (!match) return false;
  if (action.type === 'bet' || action.type === 'raise') {
    const amt = action.amount ?? -1;
    return amt >= (match.min ?? 0) && amt <= (match.max ?? 0);
  }
  return true;
}

/** Apply a poker action. Throws on illegal actions — the UI must prevent them. */
export function applyAction(s: EngineState, action: PokerAction): EngineState {
  if (!isActionLegal(s, action)) {
    throw new Error(`Illegal action ${action.type} by ${action.seat} in phase ${s.phase}`);
  }
  const seat = action.seat;
  const next: EngineState = { ...s, previousAction: action, actionLog: [...s.actionLog, action] };
  const mine = committedOf(s, seat);
  const theirs = committedOf(s, other(seat));
  const stack = stackOf(s, seat);

  const commitTo = (target: number) => {
    const add = Math.min(target - mine, stack);
    if (seat === 'player') { next.playerStack -= add; next.playerCommitted = mine + add; }
    else { next.opponentStack -= add; next.opponentCommitted = mine + add; }
  };

  switch (action.type) {
    case 'fold': {
      const winner = other(seat);
      const matched = Math.min(mine, theirs);
      const potTotal = s.pot + 2 * matched;
      next.handResult = { winner, reason: 'fold', potWon: potTotal };
      // Return the winner's uncalled excess and normalize commitments so
      // pot-award pays exactly potTotal.
      const excess = Math.max(0, theirs - mine);
      if (excess > 0) {
        if (winner === 'player') next.playerStack += excess;
        else next.opponentStack += excess;
      }
      next.playerCommitted = matched;
      next.opponentCommitted = matched;
      next.phase = 'fold-resolution';
      next.toAct = null;
      next.animationCue = null;
      return next;
    }
    case 'check': {
      next.actedThisStreet = [...s.actedThisStreet, seat];
      return afterVoluntaryAction(next, seat, false);
    }
    case 'call': {
      commitTo(theirs);
      next.actedThisStreet = [...s.actedThisStreet, seat];
      next.animationCue = 'chips-to-pot';
      return afterVoluntaryAction(next, seat, false);
    }
    case 'bet': {
      const target = action.amount as number;
      commitTo(target);
      next.lastRaiseSize = target - theirs;
      next.actedThisStreet = [...s.actedThisStreet, seat];
      next.animationCue = 'chips-to-pot';
      return afterVoluntaryAction(next, seat, true);
    }
    case 'raise': {
      const target = action.amount as number;
      commitTo(target);
      const actualTo = committedOf(next, seat);
      next.lastRaiseSize = Math.max(actualTo - theirs, s.lastRaiseSize);
      next.actedThisStreet = [...s.actedThisStreet, seat];
      next.animationCue = 'chips-to-pot';
      return afterVoluntaryAction(next, seat, true);
    }
    case 'all-in': {
      const target = mine + stack;
      const isAggressive = target > theirs;
      commitTo(target);
      if (isAggressive) next.lastRaiseSize = Math.max(committedOf(next, seat) - theirs, s.lastRaiseSize);
      next.actedThisStreet = [...s.actedThisStreet, seat];
      next.animationCue = 'chips-to-pot';
      return afterVoluntaryAction(next, seat, isAggressive);
    }
  }
}

/** Decide whether the betting round continues, completes, or passes to the other seat. */
function afterVoluntaryAction(s: EngineState, seat: Seat, wasAggressive: boolean): EngineState {
  const opp = other(seat);
  const mine = committedOf(s, seat);
  const theirs = committedOf(s, opp);
  const oppStack = stackOf(s, opp);
  const oppActed = s.actedThisStreet.includes(opp);

  if (wasAggressive) {
    if (oppStack === 0) {
      // Opponent already all-in for less — refund the uncalled excess and settle.
      const excess = mine - theirs;
      const settled = { ...s };
      if (excess > 0) {
        if (seat === 'player') { settled.playerStack += excess; settled.playerCommitted = theirs; }
        else { settled.opponentStack += excess; settled.opponentCommitted = theirs; }
      }
      return completeStreet(settled);
    }
    return { ...s, toAct: opp, phase: actionPhaseFor(s.street as Street, opp) };
  }

  const settled = mine === theirs;
  if (settled && oppActed) return completeStreet(s);
  if (settled && !oppActed && oppStack === 0) return completeStreet(s);
  if (settled && !oppActed) {
    // e.g. SB limps preflop; BB still has the option.
    return { ...s, toAct: opp, phase: actionPhaseFor(s.street as Street, opp) };
  }
  // Not settled + non-aggressive: a short all-in call. Refund the other
  // seat's uncalled excess and settle the street.
  const excess = theirs - mine;
  const refunded = { ...s };
  if (opp === 'player') { refunded.playerStack += excess; refunded.playerCommitted = mine; }
  else { refunded.opponentStack += excess; refunded.opponentCommitted = mine; }
  return completeStreet(refunded);
}

/** Sweep street commitments into the pot and move to the next street or showdown. */
function completeStreet(s: EngineState): EngineState {
  const pot = s.pot + s.playerCommitted + s.opponentCommitted;
  const cleared: EngineState = {
    ...s,
    pot,
    playerCommitted: 0,
    opponentCommitted: 0,
    actedThisStreet: [],
    lastRaiseSize: BIG_BLIND,
    toAct: null,
  };
  const street = s.street as Street;
  const dealNext = nextDealPhase(street);
  if (!dealNext) {
    return { ...cleared, phase: 'showdown', animationCue: 'reveal-showdown' };
  }
  return { ...cleared, phase: dealNext, animationCue: null };
}

const ACTION_PHASES: GamePhase[] = [
  'preflop-player-action', 'preflop-opponent-action',
  'flop-player-action', 'flop-opponent-action',
  'turn-player-action', 'turn-opponent-action',
  'river-player-action', 'river-opponent-action',
];

export function isActionPhase(phase: GamePhase): boolean {
  return ACTION_PHASES.includes(phase);
}

export function snapshot(s: EngineState): GameSnapshot {
  const showOpponentCards = s.phase === 'showdown' ||
    (s.handResult?.reason === 'showdown' && (s.phase === 'pot-award' || s.phase === 'hand-complete'));
  const legal = s.toAct ? legalActionsFor(s, s.toAct) : [];
  const raise = legal.find((l) => l.type === 'raise' || l.type === 'bet');
  const call = legal.find((l) => l.type === 'call');
  let resultText: string | undefined;
  if (s.handResult) {
    const r = s.handResult;
    if (r.reason === 'fold') {
      resultText = r.winner === 'player' ? 'Opponent folds — you take the pot.' : 'You fold — opponent takes the pot.';
    } else if (r.winner === 'split') {
      resultText = `Split pot — both show ${r.playerHandName}.`;
    } else {
      const w = r.winner === 'player' ? 'You win' : 'Opponent wins';
      const hand = r.winner === 'player' ? r.playerHandName : r.opponentHandName;
      resultText = `${w} with ${hand}.`;
    }
  }
  return {
    matchId: s.matchId,
    handId: s.handId,
    handNumber: s.handNumber,
    opponentId: s.opponentId,
    phase: s.phase,
    street: streetForPhase(s.phase) ?? s.street,
    playerCards: s.playerCards,
    opponentCards: showOpponentCards ? s.opponentCards : undefined,
    communityCards: s.communityCards,
    pot: s.pot + s.playerCommitted + s.opponentCommitted,
    playerStack: s.playerStack,
    opponentStack: s.opponentStack,
    playerCommitted: s.playerCommitted,
    opponentCommitted: s.opponentCommitted,
    amountToCall: call?.amount ?? 0,
    minimumRaise: raise?.min,
    maximumRaise: raise?.max,
    activePlayer: s.toAct,
    buttonSeat: s.buttonSeat,
    legalActions: legal,
    previousAction: s.previousAction,
    actionLog: s.actionLog,
    winner: s.handResult?.winner,
    resultText,
    handResult: s.handResult,
    animationCue: s.animationCue,
    matchOver: s.matchOver,
  };
}
