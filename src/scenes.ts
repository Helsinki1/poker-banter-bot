import type { Card, OpponentId, Suit } from './game/types';
import type { Scenario, ScenarioStep } from './state/useMatch';
import type { NpcConversationState, ConversationError } from './api/conversationClient';
import type { MicMode } from './state/useConversation';

// Development-only deterministic scenes for visual review (?scene=name).
// Available ONLY in dev builds — production ignores the query parameter.

const c = (rank: number, suit: Suit): Card => ({ rank, suit });

// Hand 1 deal order (button = opponent): player, opponent, player, opponent,
// burn, flop x3, burn, turn, burn, river.
const DECK_PLAYER_WINS: Card[] = [
  c(14, 's'), c(7, 'c'), c(14, 'h'), c(2, 'd'),
  c(9, 'd'), c(5, 's'), c(10, 'd'), c(3, 'c'),
  c(4, 'h'), c(12, 'd'), c(6, 'h'), c(8, 's'),
];
const DECK_OPPONENT_WINS: Card[] = [
  c(7, 'c'), c(14, 's'), c(2, 'd'), c(14, 'h'),
  c(9, 'd'), c(5, 's'), c(10, 'd'), c(3, 'c'),
  c(4, 'h'), c(12, 'd'), c(6, 'h'), c(8, 's'),
];
const DECK_SPLIT: Card[] = [
  c(2, 's'), c(2, 'd'), c(3, 's'), c(3, 'd'),
  c(9, 'd'), c(14, 'h'), c(13, 'h'), c(12, 'h'),
  c(4, 'h'), c(11, 'h'), c(6, 'h'), c(10, 'h'),
];
const DECK_SHOWY: Card[] = [
  c(13, 'h'), c(9, 's'), c(13, 'd'), c(9, 'c'),
  c(5, 'd'), c(13, 's'), c(8, 'h'), c(2, 'c'),
  c(4, 'h'), c(11, 'd'), c(6, 'h'), c(7, 's'),
];

const oppCall: ScenarioStep = { seat: 'opponent', type: 'call' };
const playerCheck: ScenarioStep = { seat: 'player', type: 'check' };
const oppCheck: ScenarioStep = { seat: 'opponent', type: 'check' };
const checkStreet: ScenarioStep[] = [playerCheck, oppCheck];
const CHECKDOWN: ScenarioStep[] = [oppCall, playerCheck, ...checkStreet, ...checkStreet, ...checkStreet];

export interface VoiceDemo {
  enabled: boolean;
  npcState?: NpcConversationState;
  micMode?: MicMode;
  micActive?: boolean;
  micMuted?: boolean;
  npcAudioMuted?: boolean;
  playerInterim?: string;
  subtitle?: { text: string; final: boolean } | null;
  error?: ConversationError | null;
  cancelled?: boolean;
}

export interface SceneConfig {
  view: 'picker' | 'room';
  pickerSelected?: OpponentId;
  opponentId?: OpponentId;
  scenario?: Scenario;
  /** Skip the intro beat and start dealing immediately. */
  autoBegin?: boolean;
  voiceDemo?: VoiceDemo;
}

const SEED = 1234;

function gameScene(opponentId: OpponentId, scenario: Omit<Scenario, 'seed'>, autoBegin = true): SceneConfig {
  return { view: 'room', opponentId, scenario: { seed: SEED, riggedDecks: [DECK_SHOWY], ...scenario }, autoBegin };
}

const FLOP_SCENE = gameScene('einstein', { script: [oppCall, playerCheck], freezeAt: 'flop-player-action' });

function voiceScene(demo: VoiceDemo): SceneConfig {
  return { ...FLOP_SCENE, voiceDemo: demo };
}

const EINSTEIN_LINE = 'The flop changes our little probability space, does it not?';

export const SCENES: Record<string, SceneConfig> = {
  // --- general -------------------------------------------------------------
  'picker': { view: 'picker' },
  'picker-einstein': { view: 'picker', pickerSelected: 'einstein' },
  'picker-lebron': { view: 'picker', pickerSelected: 'lebron' },
  'picker-negreanu': { view: 'picker', pickerSelected: 'negreanu' },
  'table-einstein': { view: 'room', opponentId: 'einstein', scenario: { seed: SEED }, autoBegin: false },
  'table-lebron': { view: 'room', opponentId: 'lebron', scenario: { seed: SEED }, autoBegin: false },
  'table-negreanu': { view: 'room', opponentId: 'negreanu', scenario: { seed: SEED }, autoBegin: false },
  'shuffling': gameScene('einstein', { freezeAt: 'shuffling' }),
  'holecards': gameScene('einstein', { freezeAt: 'preflop-opponent-action' }),
  'opponent-decision': gameScene('negreanu', { freezeAt: 'preflop-opponent-action' }),
  'player-decision': gameScene('einstein', { script: [oppCall], freezeAt: 'preflop-player-action' }),
  'flop': FLOP_SCENE,
  'flop-lebron': gameScene('lebron', { script: [oppCall, playerCheck], freezeAt: 'flop-player-action' }),
  'flop-negreanu': gameScene('negreanu', { script: [oppCall, playerCheck], freezeAt: 'flop-player-action' }),
  'turn': gameScene('einstein', { script: [oppCall, playerCheck, ...checkStreet], freezeAt: 'turn-player-action' }),
  'river': gameScene('einstein', { script: [oppCall, playerCheck, ...checkStreet, ...checkStreet], freezeAt: 'river-player-action' }),
  'showdown': gameScene('einstein', { script: CHECKDOWN, freezeAt: 'showdown', riggedDecks: [DECK_PLAYER_WINS] }),
  'player-win': gameScene('einstein', { script: CHECKDOWN, freezeAt: 'hand-complete', riggedDecks: [DECK_PLAYER_WINS] }),
  'player-loss': gameScene('lebron', { script: CHECKDOWN, freezeAt: 'hand-complete', riggedDecks: [DECK_OPPONENT_WINS] }),
  'split-pot': gameScene('negreanu', { script: CHECKDOWN, freezeAt: 'hand-complete', riggedDecks: [DECK_SPLIT] }),
  'fold-resolution': gameScene('einstein', {
    script: [oppCall, { seat: 'player', type: 'raise', amount: 60 }, { seat: 'opponent', type: 'fold' }],
    freezeAt: 'hand-complete',
  }),

  // --- conversation --------------------------------------------------------
  'voice-disabled': voiceScene({ enabled: false }),
  'voice-connecting': voiceScene({ enabled: true, npcState: 'connecting' }),
  'voice-connected': voiceScene({ enabled: true, npcState: 'connected' }),
  'mic-active': voiceScene({ enabled: true, npcState: 'listening', micActive: true }),
  'player-speaking': voiceScene({
    enabled: true, npcState: 'listening', micActive: true,
    playerInterim: 'I think you are bluffing…',
  }),
  'transcript-streaming': voiceScene({
    enabled: true, npcState: 'listening', micActive: true,
    playerInterim: 'that river card completely changes what your raise on the',
  }),
  'npc-listening': voiceScene({ enabled: true, npcState: 'listening', micActive: true }),
  'npc-thinking': voiceScene({ enabled: true, npcState: 'thinking', micActive: true }),
  'npc-begin-speak': voiceScene({
    enabled: true, npcState: 'speaking', micActive: true,
    subtitle: { text: 'Interesting.', final: false },
  }),
  'npc-speaking': voiceScene({
    enabled: true, npcState: 'speaking', micActive: true,
    subtitle: { text: EINSTEIN_LINE, final: false },
  }),
  'player-interrupting': voiceScene({
    enabled: true, npcState: 'interrupted', micActive: true,
    subtitle: { text: 'The odds of that river card were precisely—', final: true },
    playerInterim: 'hold on, hold on—',
  }),
  'response-cancelled': voiceScene({
    enabled: true, npcState: 'connected', micActive: true, cancelled: true,
    subtitle: { text: 'The odds of that river card were precisely—', final: true },
  }),
  'mic-muted': voiceScene({ enabled: true, npcState: 'connected', micMuted: true }),
  'npc-muted': voiceScene({
    enabled: true, npcState: 'speaking', micActive: true, npcAudioMuted: true,
    subtitle: { text: EINSTEIN_LINE, final: false },
  }),
  'connection-lost': voiceScene({
    enabled: true, npcState: 'reconnecting',
    error: { recoverable: true, message: 'Connection lost — reconnecting…', code: 'connection-lost' },
  }),
  'reconnecting': voiceScene({ enabled: true, npcState: 'reconnecting' }),
  'voice-error': voiceScene({
    enabled: true, npcState: 'connected',
    error: { recoverable: true, message: 'Speech recognition error. The game continues — try again or type instead.', code: 'transcription-failed' },
  }),
  'text-fallback': voiceScene({ enabled: true, npcState: 'connected', micMode: 'text-only' }),
};

export function activeScene(): { name: string; config: SceneConfig } | null {
  if (!import.meta.env.DEV) return null;
  const name = new URLSearchParams(window.location.search).get('scene');
  if (!name) return null;
  const config = SCENES[name];
  return config ? { name, config } : null;
}
