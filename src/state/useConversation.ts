import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameSnapshot, OpponentId } from '../game/types';
import type { ConversationError, NpcConversationState } from '../api/conversationClient';
import { toPublicSnapshot } from '../api/conversationClient';
import { MockRealtimeConversationClient } from '../api/mockConversationClient';
import { DictationAdapter, isDictationSupported, type DictationStatus } from '../voice/dictation';
import { TtsPlayer } from '../voice/ttsPlayer';

// Conversation-side coordinator. Owns the realtime client, the browser
// dictation adapter and NPC audio playback. Receives ONLY public game
// snapshots. Has no reference to the poker client — architecturally unable
// to submit poker actions.

export type MicMode = 'open' | 'push-to-talk' | 'text-only';

export interface ConversationController {
  voiceEnabled: boolean;
  npcState: NpcConversationState;
  micMode: MicMode;
  micActive: boolean;
  micMuted: boolean;
  npcAudioMuted: boolean;
  dictationStatus: DictationStatus;
  dictationSupported: boolean;
  playerInterim: string;
  playerFinal: string;
  subtitle: { text: string; final: boolean } | null;
  error: ConversationError | null;
  ttsSpeaking: boolean;
  enableVoice: () => void;
  disableVoice: () => void;
  setMicMode: (mode: MicMode) => void;
  setMicMuted: (muted: boolean) => void;
  setNpcAudioMuted: (muted: boolean) => void;
  pttDown: () => void;
  pttUp: () => void;
  stopNpc: () => void;
  sendText: (text: string) => void;
  retryMic: () => void;
  dismissError: () => void;
  /** Dev-only: simulate a recoverable connection drop. */
  simulateDrop: () => void;
}

export function useConversation(
  opponentId: OpponentId | null,
  snapshot: GameSnapshot | null,
): ConversationController {
  const clientRef = useRef<MockRealtimeConversationClient | null>(null);
  const dictationRef = useRef<DictationAdapter | null>(null);
  const ttsRef = useRef<TtsPlayer | null>(null);

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [npcState, setNpcState] = useState<NpcConversationState>('disconnected');
  const [micMode, setMicModeState] = useState<MicMode>(isDictationSupported() ? 'open' : 'text-only');
  const [micActive, setMicActive] = useState(false);
  const [micMuted, setMicMutedState] = useState(false);
  const [npcAudioMuted, setNpcAudioMutedState] = useState(false);
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>(
    isDictationSupported() ? 'idle' : 'unsupported',
  );
  const [playerInterim, setPlayerInterim] = useState('');
  const [playerFinal, setPlayerFinal] = useState('');
  const [subtitle, setSubtitle] = useState<{ text: string; final: boolean } | null>(null);
  const [error, setError] = useState<ConversationError | null>(null);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const interimClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dictationSupported = useMemo(() => isDictationSupported(), []);

  // TTS player (stable across renders).
  if (!ttsRef.current) {
    ttsRef.current = new TtsPlayer({
      onSpeakingChange: setTtsSpeaking,
      onAudioUnavailable: () => {
        setError({ recoverable: true, message: 'Audio is unavailable — showing subtitles only.', code: 'audio-failed' });
      },
    });
  }

  // Connect / disconnect the conversation session.
  useEffect(() => {
    if (!voiceEnabled || !opponentId) return;
    const client = new MockRealtimeConversationClient({ seed: Date.now() & 0xffff });
    clientRef.current = client;
    const subs = [
      client.onNpcStateChange(setNpcState),
      client.onNpcTranscript((e) => setSubtitle({ text: e.text, final: e.final })),
      client.onPlayerTranscript((e) => {
        if (e.final) {
          setPlayerFinal(e.text);
          setPlayerInterim('');
        } else {
          setPlayerInterim(e.text);
        }
      }),
      client.onNpcAudio((e) => ttsRef.current?.handle(e)),
      client.onError(setError),
    ];
    void client.connect({
      opponentId,
      snapshot: snapshot ? toPublicSnapshot(snapshot) : null,
    });
    return () => {
      for (const un of subs) un();
      void client.disconnect();
      ttsRef.current?.stop();
      clientRef.current = null;
      setNpcState('disconnected');
    };
    // Reconnect only when voice toggles or the opponent changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled, opponentId]);

  // Keep the NPC's public game context fresh; stale responses get cancelled inside the client.
  useEffect(() => {
    if (snapshot && clientRef.current) {
      clientRef.current.updateGameContext(toPublicSnapshot(snapshot));
    }
  }, [snapshot]);

  // Dictation adapter lifecycle.
  const stopDictation = useCallback(() => {
    dictationRef.current?.stop();
    dictationRef.current = null;
    setMicActive(false);
    clientRef.current?.setMicrophoneEnabled(false);
  }, []);

  const startDictation = useCallback(() => {
    if (!dictationSupported) {
      setDictationStatus('unsupported');
      return;
    }
    if (dictationRef.current) return;
    const adapter = new DictationAdapter({
      onStatus: (s) => {
        setDictationStatus(s);
        setMicActive(s === 'listening' || s === 'starting');
        if (s === 'permission-denied') setMicActive(false);
      },
      onInterim: (text) => {
        // Barge-in: the player starting to speak interrupts the NPC.
        if (clientRef.current && (npcStateRef.current === 'speaking' || ttsRef.current?.isMuted() === false)) {
          if (npcStateRef.current === 'speaking') {
            clientRef.current.interruptNpc();
            ttsRef.current?.stop();
          }
        }
        setPlayerInterim(text);
        if (interimClearRef.current) clearTimeout(interimClearRef.current);
        interimClearRef.current = setTimeout(() => setPlayerInterim(''), 4000);
      },
      onFinal: (text) => {
        clientRef.current?.sendPlayerUtterance(text);
        setPlayerInterim('');
      },
      onError: (message, recoverable) => {
        setError({ recoverable, message, code: 'transcription-failed' });
      },
    });
    dictationRef.current = adapter;
    adapter.start();
    clientRef.current?.setMicrophoneEnabled(true);
  }, [dictationSupported]);

  const npcStateRef = useRef(npcState);
  npcStateRef.current = npcState;

  // Open-mic mode: dictation runs while voice is on and mic not muted.
  useEffect(() => {
    if (voiceEnabled && micMode === 'open' && !micMuted) startDictation();
    else if (micMode !== 'push-to-talk') stopDictation();
    return () => { /* handled by disable */ };
  }, [voiceEnabled, micMode, micMuted, startDictation, stopDictation]);

  useEffect(() => () => {
    dictationRef.current?.destroy();
    ttsRef.current?.stop();
  }, []);

  const enableVoice = useCallback(() => setVoiceEnabled(true), []);
  const disableVoice = useCallback(() => {
    stopDictation();
    setVoiceEnabled(false);
    setSubtitle(null);
    setPlayerInterim('');
    setError(null);
  }, [stopDictation]);

  const setMicMode = useCallback((mode: MicMode) => {
    stopDictation();
    setMicModeState(mode);
  }, [stopDictation]);

  const setMicMuted = useCallback((muted: boolean) => {
    setMicMutedState(muted);
    if (muted) stopDictation();
  }, [stopDictation]);

  const setNpcAudioMuted = useCallback((muted: boolean) => {
    setNpcAudioMutedState(muted);
    ttsRef.current?.setMuted(muted);
    clientRef.current?.setNpcAudioEnabled(!muted);
  }, []);

  const pttDown = useCallback(() => {
    if (micMode === 'push-to-talk' && !micMuted) startDictation();
  }, [micMode, micMuted, startDictation]);

  const pttUp = useCallback(() => {
    if (micMode === 'push-to-talk') stopDictation();
  }, [micMode, stopDictation]);

  const stopNpc = useCallback(() => {
    clientRef.current?.cancelCurrentResponse();
    ttsRef.current?.stop();
  }, []);

  const sendText = useCallback((text: string) => {
    clientRef.current?.sendPlayerUtterance(text);
    setPlayerFinal(text);
  }, []);

  const retryMic = useCallback(() => {
    setError(null);
    stopDictation();
    if (micMode === 'open' && !micMuted) startDictation();
  }, [micMode, micMuted, startDictation, stopDictation]);

  const dismissError = useCallback(() => setError(null), []);

  const simulateDrop = useCallback(() => clientRef.current?.simulateConnectionDrop(), []);

  return {
    voiceEnabled,
    npcState,
    micMode,
    micActive,
    micMuted,
    npcAudioMuted,
    dictationStatus,
    dictationSupported,
    playerInterim,
    playerFinal,
    subtitle,
    error,
    ttsSpeaking,
    enableVoice,
    disableVoice,
    setMicMode,
    setMicMuted,
    setNpcAudioMuted,
    pttDown,
    pttUp,
    stopNpc,
    sendText,
    retryMic,
    dismissError,
    simulateDrop,
  };
}
