import { useState } from 'react';
import type { ConversationController, MicMode } from '../state/useConversation';
import { NPC_VOICE_OPTIONS, type NpcVoice } from '../voice/cartesiaTts';
import type { VoiceDemo } from '../scenes';
import {
  ConnectionIcon, KeyboardIcon, MicIcon, MicMutedIcon, SpeakerIcon,
  SpeakerMutedIcon, SpeakingWavesIcon, ThinkingDotsIcon,
} from '../sprites/icons';
import './voicedock.css';

// Voice conversation controls. Talk only: nothing here references the poker
// client. The microphone state is always explicit and visible.

interface Props {
  convo: ConversationController;
  demo?: VoiceDemo;
}

const STATE_LABELS: Record<string, string> = {
  disconnected: 'Voice off',
  connecting: 'Connecting…',
  connected: 'Connected',
  listening: 'Listening',
  thinking: 'Thinking…',
  speaking: 'Speaking',
  interrupted: 'Interrupted',
  reconnecting: 'Reconnecting…',
  error: 'Voice error',
};

export default function VoiceDock({ convo, demo }: Props) {
  const [text, setText] = useState('');

  // Demo scenes override display state only — controls stay real.
  const enabled = demo ? demo.enabled : convo.voiceEnabled;
  // The MP3 can outlast the transcript stream — keep showing "Speaking"
  // until playback actually ends.
  const rawNpcState = demo?.npcState ?? convo.npcState;
  const npcState = convo.ttsSpeaking && (rawNpcState === 'connected' || rawNpcState === 'listening')
    ? 'speaking' : rawNpcState;
  const micMode = demo?.micMode ?? convo.micMode;
  const micActive = demo?.micActive ?? convo.micActive;
  const micMuted = demo?.micMuted ?? convo.micMuted;
  const npcAudioMuted = demo?.npcAudioMuted ?? convo.npcAudioMuted;
  const playerInterim = demo?.playerInterim ?? convo.playerInterim;
  const error = demo?.error !== undefined ? demo.error : convo.error;

  const connState = npcState === 'disconnected' ? 'off'
    : npcState === 'connecting' || npcState === 'reconnecting' ? 'connecting'
      : npcState === 'error' ? 'error' : 'connected';

  if (!enabled) {
    return (
      <div className="voice-dock voice-off">
        <button className="voice-enable-btn" onClick={convo.enableVoice} data-testid="voice-enable">
          <MicIcon size={14} /> Enable Table Talk
        </button>
        <span className="voice-off-note">Voice is optional — the game is fully playable without it.</span>
      </div>
    );
  }

  const micLabel = micMode === 'text-only'
    ? 'Text only'
    : micMuted ? 'Mic muted'
      : micActive ? 'Mic LIVE' : 'Mic off';

  return (
    <div className={`voice-dock state-${npcState}${micActive && !micMuted ? ' mic-live' : ''}`}>
      <div className="voice-status-row">
        <span className={`conn-dot conn-${connState}`} title={`Connection: ${connState}`}>
          <ConnectionIcon state={connState} size={14} />
        </span>
        <span className="voice-state-label" data-testid="voice-state">
          {STATE_LABELS[npcState] ?? npcState}
          {npcState === 'thinking' && <ThinkingDotsIcon size={12} />}
          {npcState === 'speaking' && <SpeakingWavesIcon size={12} />}
        </span>
        <span className={`mic-badge${micActive && !micMuted ? ' live' : ''}${micMuted ? ' muted' : ''}`} data-testid="mic-state">
          {micMode === 'text-only' ? <KeyboardIcon size={12} /> : micMuted || !micActive ? <MicMutedIcon size={12} /> : <MicIcon size={12} />}
          {micLabel}
        </span>
      </div>

      <div className="voice-controls-row">
        {micMode !== 'text-only' && (
          <button
            className={`vc-btn${micMuted ? ' engaged' : ''}`}
            onClick={() => convo.setMicMuted(!micMuted)}
            aria-pressed={micMuted}
            title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            data-testid="mic-mute"
          >
            {micMuted ? <MicMutedIcon size={13} /> : <MicIcon size={13} />}
            {micMuted ? 'Unmute' : 'Mute mic'}
          </button>
        )}
        {micMode === 'push-to-talk' && (
          <button
            className="vc-btn ptt-btn"
            onMouseDown={convo.pttDown}
            onMouseUp={convo.pttUp}
            onMouseLeave={convo.pttUp}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') convo.pttDown(); }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') convo.pttUp(); }}
            title="Hold to talk"
          >
            <MicIcon size={13} /> Hold to talk
          </button>
        )}
        <button
          className={`vc-btn${npcAudioMuted ? ' engaged' : ''}`}
          onClick={() => convo.setNpcAudioMuted(!npcAudioMuted)}
          aria-pressed={npcAudioMuted}
          title={npcAudioMuted ? 'Unmute opponent voice' : 'Mute opponent voice'}
          data-testid="npc-mute"
        >
          {npcAudioMuted ? <SpeakerMutedIcon size={13} /> : <SpeakerIcon size={13} />}
          {npcAudioMuted ? 'Voice off' : 'Voice on'}
        </button>
        <button
          className="vc-btn"
          onClick={convo.stopNpc}
          disabled={npcState !== 'speaking' && npcState !== 'thinking' && !demo}
          title="Stop / skip the current response"
          data-testid="stop-npc"
        >
          ■ Skip
        </button>
        <select
          className="vc-mode"
          value={convo.npcVoice}
          onChange={(e) => convo.setNpcVoice(e.target.value as NpcVoice)}
          aria-label="Opponent voice"
          title="Opponent voice"
          data-testid="npc-voice"
        >
          {NPC_VOICE_OPTIONS.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
        <select
          className="vc-mode"
          value={micMode}
          onChange={(e) => convo.setMicMode(e.target.value as MicMode)}
          aria-label="Microphone mode"
          data-testid="mic-mode"
        >
          <option value="open" disabled={!convo.dictationSupported}>Open mic</option>
          <option value="push-to-talk" disabled={!convo.dictationSupported}>Push to talk</option>
          <option value="text-only">Text only</option>
        </select>
        <button className="vc-btn vc-off" onClick={convo.disableVoice} title="Disable voice entirely" data-testid="voice-disable">
          ✕
        </button>
      </div>

      {playerInterim && (
        <div className="player-transcript" data-testid="player-transcript">
          <span className="pt-label">you:</span> {playerInterim}
          <span className="pt-caret" />
        </div>
      )}

      {(micMode === 'text-only' || !convo.dictationSupported || demo?.micMode === 'text-only') && (
        <form
          className="text-fallback"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) { convo.sendText(text.trim()); setText(''); }
          }}
        >
          <input
            className="tf-input"
            type="text"
            value={text}
            placeholder="Say something to your opponent…"
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            data-testid="text-input"
          />
          <button className="vc-btn" type="submit" disabled={!text.trim()} data-testid="text-send">Send</button>
        </form>
      )}

      {error && (
        <div className={`voice-error${error.recoverable ? '' : ' fatal'}`} role="alert" data-testid="voice-error">
          <span>{error.message}</span>
          <span className="ve-actions">
            {error.recoverable && error.code !== 'connection-lost' && (
              <button className="vc-btn" onClick={convo.retryMic}>Retry</button>
            )}
            <button className="vc-btn" onClick={convo.dismissError} aria-label="Dismiss error">✕</button>
          </span>
        </div>
      )}
    </div>
  );
}
