import type { GameSnapshot, OpponentId, PokerAction, Street } from '../game/types';

// Realtime conversation boundary. This layer is for TALK ONLY.
// It deliberately exposes NO method that could submit, focus, click, or
// modify a poker action — that separation is architectural, not prompt-based.

export type NpcConversationState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'reconnecting'
  | 'error';

export interface VoiceProfile {
  /** speechSynthesis tuning — an original synthetic voice, not an imitation. */
  pitch: number;
  rate: number;
  /** Preferred substring match against available system voice names. */
  voiceHint: string[];
}

/**
 * Game context visible to the NPC. Built by `toPublicSnapshot` which strips
 * all hidden information (player hole cards, undealt deck, unrevealed
 * opponent cards) — the NPC can never see what it should not know.
 */
export interface PublicGameSnapshot {
  matchId: string;
  handId: string;
  handNumber: number;
  opponentId: OpponentId;
  phase: string;
  street: Street | null;
  communityCards: string[];
  pot: number;
  playerStack: number;
  opponentStack: number;
  playerCommitted: number;
  opponentCommitted: number;
  amountToCall: number;
  activePlayer: 'player' | 'opponent' | null;
  legalPlayerActions: string[];
  previousAction?: PokerAction;
  actionLog: PokerAction[];
  winner?: 'player' | 'opponent' | 'split';
  resultText?: string;
  playerIsDeciding: boolean;
}

export function toPublicSnapshot(s: GameSnapshot): PublicGameSnapshot {
  return {
    matchId: s.matchId,
    handId: s.handId,
    handNumber: s.handNumber,
    opponentId: s.opponentId,
    phase: s.phase,
    street: s.street,
    communityCards: s.communityCards.map((c) => `${c.rank}${c.suit}`),
    pot: s.pot,
    playerStack: s.playerStack,
    opponentStack: s.opponentStack,
    playerCommitted: s.playerCommitted,
    opponentCommitted: s.opponentCommitted,
    amountToCall: s.amountToCall,
    activePlayer: s.activePlayer,
    legalPlayerActions: s.activePlayer === 'player' ? s.legalActions.map((l) => l.type) : [],
    previousAction: s.previousAction,
    actionLog: s.actionLog,
    winner: s.winner,
    resultText: s.resultText,
    playerIsDeciding: s.activePlayer === 'player',
  };
}

export interface ConversationContext {
  opponentId: OpponentId;
  snapshot: PublicGameSnapshot | null;
}

export interface TranscriptEvent {
  /** Cumulative text for the current utterance/response. */
  text: string;
  final: boolean;
  responseId?: string;
}

/**
 * Streamed NPC audio. A production backend streams PCM chunks; the local mock
 * streams TTS directives that the audio player synthesizes locally. Both flow
 * through the same event so the UI is provider-agnostic.
 */
export type AudioStreamEvent =
  | { kind: 'tts'; responseId: string; text: string; voice: VoiceProfile; last: boolean }
  | { kind: 'pcm'; responseId: string; chunk: ArrayBuffer; last: boolean };

export interface ConversationError {
  recoverable: boolean;
  message: string;
  code: 'connection-lost' | 'audio-failed' | 'transcription-failed' | 'generation-failed' | 'unknown';
}

export type Unsubscribe = () => void;

export interface RealtimeConversationClient {
  connect(context: ConversationContext): Promise<void>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): void;
  setNpcAudioEnabled(enabled: boolean): void;
  /** Push fresh public game state; materially outdated pending responses are cancelled. */
  updateGameContext(snapshot: PublicGameSnapshot): void;
  /** Feed one completed player utterance (from dictation or the text fallback). */
  sendPlayerUtterance(text: string): void;
  interruptNpc(): void;
  cancelCurrentResponse(): void;
  onPlayerTranscript(callback: (event: TranscriptEvent) => void): Unsubscribe;
  onNpcTranscript(callback: (event: TranscriptEvent) => void): Unsubscribe;
  onNpcAudio(callback: (event: AudioStreamEvent) => void): Unsubscribe;
  onNpcStateChange(callback: (state: NpcConversationState) => void): Unsubscribe;
  onError(callback: (error: ConversationError) => void): Unsubscribe;
}
