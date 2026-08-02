import { useEffect, useMemo, useRef, useState } from 'react';
import type { OpponentId } from '../game/types';
import { CHARACTER_MAP } from '../characters/data';
import type { MatchController } from '../state/useMatch';
import type { ConversationController } from '../state/useConversation';
import type { VoiceDemo } from '../scenes';
import EinsteinSprite from '../sprites/EinsteinSprite';
import LebronSprite from '../sprites/LebronSprite';
import NegreanuSprite from '../sprites/NegreanuSprite';
import DealerSprite from '../sprites/DealerSprite';
import { ChipStackArt, DealerButtonArt } from '../sprites/ChipArt';
import type { OpponentSpriteProps, SpriteMood } from '../sprites/types';
import CardView from './CardView';
import ActionBar from './ActionBar';
import VoiceDock from './VoiceDock';
import './room.css';

const SPRITES: Record<OpponentId, (p: OpponentSpriteProps) => React.ReactElement> = {
  einstein: EinsteinSprite,
  lebron: LebronSprite,
  negreanu: NegreanuSprite,
};

interface Props {
  opponentId: OpponentId;
  match: MatchController;
  convo: ConversationController;
  voiceDemo?: VoiceDemo;
  onLeave: () => void;
}

function chipTierFor(total: number): 0 | 1 | 2 | 3 {
  if (total >= 1000) return 3;
  if (total >= 400) return 2;
  if (total >= 100) return 1;
  return 0;
}

export default function PokerRoom({ opponentId, match, convo, voiceDemo, onLeave }: Props) {
  const ch = CHARACTER_MAP[opponentId];
  const Sprite = SPRITES[opponentId];
  const snap = match.snapshot;
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, []);

  const npcState = voiceDemo?.npcState ?? convo.npcState;
  const subtitle = voiceDemo?.subtitle !== undefined ? voiceDemo.subtitle : convo.subtitle;
  const speaking = npcState === 'speaking' || convo.ttsSpeaking;

  // --- opponent mood: poker events outrank conversation, which outranks idle
  const mood: SpriteMood = useMemo(() => {
    if (snap?.handResult && (snap.phase === 'pot-award' || snap.phase === 'hand-complete' || snap.phase === 'showdown' || snap.phase === 'fold-resolution')) {
      if (snap.handResult.winner === 'opponent') {
        return snap.handResult.potWon >= 400 ? 'celebrating' : 'winning';
      }
      if (snap.handResult.winner === 'player') return 'losing';
      return 'amused';
    }
    if (match.reaction) return match.reaction;
    if (speaking) return 'speaking';
    if (npcState === 'thinking') return 'thinking';
    if (snap?.activePlayer === 'opponent') return 'thinking';
    if (npcState === 'listening' && (convo.playerInterim || voiceDemo?.playerInterim)) return 'listening';
    if (npcState === 'interrupted') return 'surprised';
    if (snap?.previousAction?.seat === 'player' &&
      (snap.previousAction.type === 'raise' || snap.previousAction.type === 'all-in')) {
      return 'suspicious';
    }
    return 'idle';
  }, [snap, match.reaction, speaking, npcState, convo.playerInterim, voiceDemo]);

  const gaze: OpponentSpriteProps['gaze'] =
    speaking || npcState === 'listening' ? 'player'
      : snap && (snap.phase.startsWith('dealing') || snap.animationCue?.startsWith('deal')) ? 'board'
        : snap?.activePlayer === 'opponent' ? 'board' : 'player';

  // Track cards to know which are newly dealt (for flight animations).
  const prevBoardCount = useRef(0);
  const boardNew = snap ? snap.communityCards.length - prevBoardCount.current : 0;
  useEffect(() => {
    prevBoardCount.current = snap?.communityCards.length ?? 0;
  }, [snap?.communityCards.length]);

  const phase = snap?.phase ?? 'introduction';
  const showIntro = phase === 'introduction';
  const handDone = phase === 'hand-complete';
  const potAward = phase === 'pot-award';
  const winner = snap?.handResult?.winner;

  return (
    <div className={`room${entered ? ' entered' : ''}`} data-phase={phase}>
      <div className="room-walls" />

      {/* 2.5D table surface */}
      <div className="stage">
        <div className="table3d">
          <div className="felt" />
          <div className="felt-wear" />
          <div className="rail" />
        </div>
        <div className="table-glow" />
      </div>

      {/* Opponent */}
      <div className={`opponent-area${speaking ? ' is-speaking' : ''}`}>
        <Sprite mood={mood} gaze={gaze} variant="seated" size={236} />
        <div className="seat-plaque opponent-plaque">
          <span className="plaque-name">{ch.name}</span>
          <span className="plaque-stack" data-testid="opponent-stack">{snap?.opponentStack ?? 0}</span>
          {snap?.buttonSeat === 'opponent' && <span className="dealer-btn-marker"><DealerButtonArt size={22} /></span>}
        </div>
        {snap && snap.opponentCommitted > 0 && (
          <div className={`committed committed-opponent${snap.animationCue === 'chips-to-pot' ? ' to-pot' : ''}`}>
            <ChipStackArt count={Math.max(1, Math.ceil(snap.opponentCommitted / 40))} tier={chipTierFor(snap.opponentCommitted)} size={38} />
            <span className="committed-amt">{snap.opponentCommitted}</span>
          </div>
        )}
        {/* Opponent hole cards revealed on the felt at showdown (the sprite
            holds its own face-down cards during the hand). */}
        {snap?.opponentCards && snap.opponentCards.length === 2 && phase !== 'resetting-hand' && (
          <div className="opp-cards">
            <CardView card={snap.opponentCards[0]} width={44} deal="opponent" delayMs={100} />
            <CardView card={snap.opponentCards[1]} width={44} deal="opponent" delayMs={280} />
          </div>
        )}
      </div>

      {/* Subtitles near (not on) the opponent */}
      {subtitle && subtitle.text && (
        <div
          className={`subtitles${subtitle.final ? ' final' : ' streaming'}${npcState === 'interrupted' || voiceDemo?.cancelled ? ' cancelled' : ''}`}
          data-testid="subtitles"
          aria-live="polite"
        >
          <span className="sub-name">{ch.name}</span>
          <span className="sub-text">
            {subtitle.text}
            {!subtitle.final && <span className="sub-caret" />}
            {(npcState === 'interrupted' || voiceDemo?.cancelled) && <span className="sub-cancelled"> — interrupted</span>}
          </span>
        </div>
      )}

      {/* Dealer on the left */}
      <div className="dealer-area">
        <DealerSprite mood={match.dealerMood} size={168} />
        <span className="dealer-plaque">Dealer</span>
      </div>

      {/* Street / turn plaque */}
      <div className="hud-plaque" data-testid="hud">
        <span className="hud-street">{snap?.street ? snap.street.toUpperCase() : 'TABLE'}</span>
        <span className="hud-hand">Hand {snap?.handNumber ?? 0}</span>
        <span className="hud-turn">
          {snap?.activePlayer === 'player' ? '◆ your move'
            : snap?.activePlayer === 'opponent' ? `◇ ${ch.name.toLowerCase()}` : '· · ·'}
        </span>
      </div>

      <button className="leave-btn" onClick={onLeave} title="Leave the table" data-testid="leave">
        ⟵ Leave
      </button>

      {/* Board + pot */}
      {!showIntro && (
      <div className="board-area">
        <div className="pot-display">
          {snap && snap.pot > 0 && (
            <div className={`pot-chips${potAward && winner ? ` award-${winner}` : ''}`}>
              <ChipStackArt count={Math.min(8, Math.max(2, Math.ceil(snap.pot / 150)))} tier={chipTierFor(snap.pot)} size={40} />
            </div>
          )}
          <span className="pot-label" data-testid="pot">POT&ensp;{snap?.pot ?? 0}</span>
        </div>
        <div className="community" data-testid="community">
          {Array.from({ length: 5 }, (_, i) => {
            const card = snap?.communityCards[i];
            const isNew = card && i >= (snap?.communityCards.length ?? 0) - Math.max(0, boardNew);
            return (
              <div key={i} className="board-slot">
                {card
                  ? <CardView card={card} width={56} deal={isNew ? 'board' : null} delayMs={isNew ? (i - (snap!.communityCards.length - boardNew)) * 220 : 0} />
                  : <div className="slot-ghost" />}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Player area */}
      <div className="player-area">
        {snap && snap.playerCommitted > 0 && (
          <div className={`committed committed-player${snap.animationCue === 'chips-to-pot' ? ' to-pot' : ''}`}>
            <ChipStackArt count={Math.max(1, Math.ceil(snap.playerCommitted / 40))} tier={chipTierFor(snap.playerCommitted)} size={38} />
            <span className="committed-amt">{snap.playerCommitted}</span>
          </div>
        )}
        <div className="player-cards" data-testid="player-cards">
          {snap?.playerCards.map((card, i) => (
            <CardView key={`${snap.handId}-${i}`} card={card} width={74} deal="player" delayMs={i * 240} />
          ))}
        </div>
        <div className="seat-plaque player-plaque">
          <span className="plaque-name">You</span>
          <span className="plaque-stack" data-testid="player-stack">{snap?.playerStack ?? 0}</span>
          {snap?.buttonSeat === 'player' && <span className="dealer-btn-marker"><DealerButtonArt size={22} /></span>}
        </div>
      </div>

      {/* Result banner */}
      {(handDone || potAward || phase === 'showdown' || phase === 'fold-resolution') && snap?.resultText && (
        <div className={`result-banner${winner === 'player' ? ' won' : winner === 'opponent' ? ' lost' : ' split'}`} data-testid="result">
          <span className="result-text">{snap.resultText}</span>
          {snap.handResult?.reason === 'showdown' && snap.handResult.playerHandName && (
            <span className="result-detail">
              You: {snap.handResult.playerHandName} · {ch.name}: {snap.handResult.opponentHandName}
            </span>
          )}
          {handDone && !snap.matchOver && (
            <button className="next-hand-btn" onClick={match.nextHand} data-testid="next-hand">
              Next Hand ⟶
            </button>
          )}
          {handDone && snap.matchOver && (
            <div className="match-over">
              <span>{snap.playerStack === 0 ? `${ch.name} has all the chips.` : 'You cleaned them out.'}</span>
              <button className="next-hand-btn" onClick={match.rematch} data-testid="rematch">Rematch</button>
            </div>
          )}
        </div>
      )}

      {/* Intro overlay */}
      {showIntro && (
        <div className="intro-overlay" data-testid="intro">
          <div className="intro-card">
            <span className="intro-name">{ch.name}</span>
            <span className="intro-line">&ldquo;{ch.introLine}&rdquo;</span>
            <button className="next-hand-btn" onClick={match.begin} data-testid="deal-me-in">
              Shuffle Up &amp; Deal
            </button>
          </div>
        </div>
      )}

      {/* Voice dock (bottom-left) and actions (bottom-right) */}
      <div className="voice-area">
        <VoiceDock convo={convo} demo={voiceDemo} />
      </div>
      <div className="action-area">
        {snap && <ActionBar snapshot={snap} onAction={(t, a) => void match.submitPlayerAction(t, a)} />}
      </div>

      <div className="vignette" />
    </div>
  );
}
