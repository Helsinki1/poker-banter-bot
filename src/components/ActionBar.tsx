import { useEffect, useMemo, useState } from 'react';
import type { GameSnapshot, LegalAction, PokerActionType } from '../game/types';
import './actionbar.css';

// The ONLY way the player acts on the poker game. Every control maps 1:1 to
// a legal action from the authoritative snapshot; illegal actions are never
// rendered enabled. Speech has no pathway here.

interface Props {
  snapshot: GameSnapshot;
  onAction: (type: PokerActionType, amount?: number) => void;
  disabled?: boolean;
}

type SizingMode = { verb: 'bet' | 'raise'; min: number; max: number } | null;

export default function ActionBar({ snapshot, onAction, disabled }: Props) {
  const isMyTurn = snapshot.activePlayer === 'player' && !disabled;
  const legal = useMemo(() => {
    const map = new Map<PokerActionType, LegalAction>();
    if (snapshot.activePlayer === 'player') {
      for (const l of snapshot.legalActions) map.set(l.type, l);
    }
    return map;
  }, [snapshot]);

  const [sizing, setSizing] = useState<SizingMode>(null);
  const [amount, setAmount] = useState(0);

  // Reset the sizing panel whenever the decision context changes.
  useEffect(() => {
    setSizing(null);
  }, [snapshot.handId, snapshot.phase, snapshot.pot]);

  const openSizing = (verb: 'bet' | 'raise') => {
    const l = legal.get(verb);
    if (!l || l.min === undefined || l.max === undefined) return;
    setSizing({ verb, min: l.min, max: l.max });
    setAmount(l.min);
  };

  const clamp = (v: number) => sizing ? Math.max(sizing.min, Math.min(sizing.max, Math.round(v))) : v;

  const presets = useMemo(() => {
    if (!sizing) return [];
    const pot = snapshot.pot;
    const base = sizing.verb === 'raise' ? snapshot.opponentCommitted : 0;
    const mk = (label: string, target: number) => ({ label, value: clamp(base + target) });
    return [
      { label: 'Min', value: sizing.min },
      mk('⅓ Pot', Math.round(pot / 3)),
      mk('½ Pot', Math.round(pot / 2)),
      mk('¾ Pot', Math.round((pot * 3) / 4)),
      mk('Pot', pot),
      { label: 'All-in', value: sizing.max },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizing, snapshot.pot, snapshot.opponentCommitted]);

  const call = legal.get('call');
  const allIn = legal.get('all-in');

  return (
    <div className={`action-bar${isMyTurn ? ' my-turn' : ''}`} aria-label="Poker actions">
      {!sizing && (
        <div className="action-row">
          <button
            className="act-btn act-fold"
            disabled={!isMyTurn || !legal.has('fold')}
            onClick={() => onAction('fold')}
            data-testid="act-fold"
          >
            Fold
          </button>
          <button
            className="act-btn act-check"
            disabled={!isMyTurn || !legal.has('check')}
            onClick={() => onAction('check')}
            data-testid="act-check"
          >
            Check
          </button>
          <button
            className="act-btn act-call"
            disabled={!isMyTurn || !call}
            onClick={() => onAction('call')}
            data-testid="act-call"
          >
            {call ? `Call ${call.amount}` : 'Call'}
          </button>
          <button
            className="act-btn act-bet"
            disabled={!isMyTurn || !legal.has('bet')}
            onClick={() => openSizing('bet')}
            data-testid="act-bet"
          >
            Bet
          </button>
          <button
            className="act-btn act-raise"
            disabled={!isMyTurn || !legal.has('raise')}
            onClick={() => openSizing('raise')}
            data-testid="act-raise"
          >
            Raise
          </button>
          <button
            className="act-btn act-allin"
            disabled={!isMyTurn || !allIn}
            onClick={() => onAction('all-in')}
            data-testid="act-allin"
          >
            All-in{allIn ? ` ${allIn.max}` : ''}
          </button>
        </div>
      )}

      {sizing && (
        <div className="sizing-panel" data-testid="sizing-panel">
          <div className="sizing-head">
            <span className="sizing-verb">{sizing.verb === 'bet' ? 'Bet' : 'Raise to'}</span>
            <span className="sizing-amount" data-testid="sizing-amount">{amount}</span>
            <span className="sizing-range">min {sizing.min} · max {sizing.max}</span>
          </div>
          <input
            type="range"
            className="sizing-slider"
            min={sizing.min}
            max={sizing.max}
            step={1}
            value={amount}
            onChange={(e) => setAmount(clamp(Number(e.target.value)))}
            aria-label={`${sizing.verb} amount`}
            data-testid="sizing-slider"
          />
          <div className="sizing-presets">
            {presets.map((p) => (
              <button
                key={p.label}
                className={`preset-btn${amount === p.value ? ' active' : ''}`}
                onClick={() => setAmount(clamp(p.value))}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="sizing-confirm-row">
            <input
              type="number"
              className="sizing-input"
              min={sizing.min}
              max={sizing.max}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              onBlur={() => setAmount(clamp(amount))}
              aria-label={`${sizing.verb} amount (chips)`}
              data-testid="sizing-input"
            />
            <button
              className="act-btn act-confirm"
              disabled={!isMyTurn || amount < sizing.min || amount > sizing.max}
              onClick={() => { onAction(sizing.verb, clamp(amount)); setSizing(null); }}
              data-testid="sizing-confirm"
            >
              Confirm {sizing.verb === 'bet' ? 'Bet' : 'Raise'} {clamp(amount)}
            </button>
            <button className="act-btn act-cancel" onClick={() => setSizing(null)} data-testid="sizing-cancel">
              Back
            </button>
          </div>
        </div>
      )}

      <div className="action-status" aria-live="polite">
        {snapshot.activePlayer === 'player'
          ? (snapshot.amountToCall > 0 ? `${snapshot.amountToCall} to call` : 'Your decision')
          : snapshot.activePlayer === 'opponent'
            ? 'Opponent is deciding…'
            : ' '}
      </div>
    </div>
  );
}
