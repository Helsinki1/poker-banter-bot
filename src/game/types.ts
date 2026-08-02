// Core poker domain types. Pure data — no DOM, no React.

export type Suit = 'c' | 'd' | 'h' | 's';
/** 2..14, where 11=J, 12=Q, 13=K, 14=A */
export type Rank = number;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type OpponentId = 'dana' | 'lebron' | 'trump';

export type Seat = 'player' | 'opponent';

export type GamePhase =
  | 'opponent-selection'
  | 'entering-table'
  | 'voice-connecting'
  | 'introduction'
  | 'shuffling'
  | 'posting-blinds'
  | 'dealing-hole-cards'
  | 'preflop-player-action'
  | 'preflop-opponent-action'
  | 'dealing-flop'
  | 'flop-player-action'
  | 'flop-opponent-action'
  | 'dealing-turn'
  | 'turn-player-action'
  | 'turn-opponent-action'
  | 'dealing-river'
  | 'river-player-action'
  | 'river-opponent-action'
  | 'showdown'
  | 'fold-resolution'
  | 'pot-award'
  | 'hand-complete'
  | 'resetting-hand';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type PokerActionType = 'check' | 'call' | 'bet' | 'raise' | 'fold' | 'all-in';

export interface PokerAction {
  type: PokerActionType;
  /** For bet: total bet size. For raise: total amount raised TO. Chips, play-money only. */
  amount?: number;
  seat: Seat;
}

export interface LegalAction {
  type: PokerActionType;
  /** Present for call (amount to call) */
  amount?: number;
  /** Present for bet/raise: inclusive legal range of the total commit-to amount */
  min?: number;
  max?: number;
}

export type PokerAnimationCue =
  | 'shuffle'
  | 'deal-hole-cards'
  | 'deal-flop'
  | 'deal-turn'
  | 'deal-river'
  | 'burn'
  | 'chips-to-pot'
  | 'pot-to-player'
  | 'pot-to-opponent'
  | 'pot-split'
  | 'collect-cards'
  | 'reveal-showdown'
  | null;

export interface HandResult {
  winner: Seat | 'split';
  /** Human-readable, e.g. "Two Pair, Kings and Fours" */
  playerHandName?: string;
  opponentHandName?: string;
  /** The exact five cards each showdown hand was scored on — lets the UI
      prove the result by highlighting them on the table. */
  playerBestFive?: Card[];
  opponentBestFive?: Card[];
  reason: 'showdown' | 'fold';
  potWon: number;
}

export interface GameSnapshot {
  matchId: string;
  handId: string;
  handNumber: number;
  opponentId: OpponentId;
  phase: GamePhase;
  street: Street | null;
  playerCards: Card[];
  /** Present only at showdown (or when the opponent must reveal). */
  opponentCards?: Card[];
  communityCards: Card[];
  pot: number;
  playerStack: number;
  opponentStack: number;
  playerCommitted: number;
  opponentCommitted: number;
  amountToCall: number;
  minimumRaise?: number;
  maximumRaise?: number;
  activePlayer: Seat | null;
  /** Which seat posts the small blind / has the button this hand. */
  buttonSeat: Seat;
  legalActions: LegalAction[];
  previousAction?: PokerAction;
  /** Chronological public actions for the current hand. */
  actionLog: PokerAction[];
  winner?: Seat | 'split';
  resultText?: string;
  handResult?: HandResult;
  animationCue?: PokerAnimationCue;
  /** True when the PLAYER is out of chips — the opponent always re-buys. */
  matchOver: boolean;
  /** Times the opponent has re-bought after busting this match. */
  opponentRebuys: number;
  /** Set on the hand where the opponent just re-bought (the buy-in amount). */
  opponentRebuyAmount?: number;
}

export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;
export const STARTING_STACK = 2000;

export const RANK_NAMES: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const RANK_WORDS: Record<number, string> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens',
  8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};

export function cardToString(c: Card): string {
  return `${RANK_NAMES[c.rank]}${c.suit}`;
}
