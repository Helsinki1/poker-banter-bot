import { useState } from 'react';
import type { OpponentId } from '../game/types';
import { CHARACTERS } from '../characters/data';
import EinsteinSprite from '../sprites/EinsteinSprite';
import LebronSprite from '../sprites/LebronSprite';
import TrumpSprite from '../sprites/TrumpSprite';
import type { OpponentSpriteProps } from '../sprites/types';
import './picker.css';

const SPRITES: Record<OpponentId, (p: OpponentSpriteProps) => React.ReactElement> = {
  einstein: EinsteinSprite,
  lebron: LebronSprite,
  trump: TrumpSprite,
};

interface Props {
  initialSelected?: OpponentId;
  onStart: (id: OpponentId) => void;
}

export default function CharacterPicker({ initialSelected, onStart }: Props) {
  const [selected, setSelected] = useState<OpponentId | null>(initialSelected ?? null);

  return (
    <div className="picker">
      <header className="picker-head">
        <h1 className="picker-title">The Back Room</h1>
        <p className="picker-sub">Heads-up hold&rsquo;em, play-money only. Choose who sits across from you.</p>
      </header>

      <div className="picker-cards" role="radiogroup" aria-label="Choose your opponent">
        {CHARACTERS.map((ch) => {
          const Sprite = SPRITES[ch.id];
          const isSelected = selected === ch.id;
          return (
            <button
              key={ch.id}
              role="radio"
              aria-checked={isSelected}
              className={`char-card motif-${ch.id}${isSelected ? ' selected' : ''}`}
              style={{ '--accent': ch.accent } as React.CSSProperties}
              onClick={() => setSelected(ch.id)}
              data-testid={`pick-${ch.id}`}
            >
              <span className="char-frame">
                <Sprite
                  mood={isSelected ? 'amused' : 'idle'}
                  gaze={isSelected ? 'player' : 'away'}
                  variant="portrait"
                  size={168}
                />
              </span>
              <span className="char-name">{ch.name}</span>
              <span className="char-tagline">{ch.tagline}</span>
              <span className="char-style">{ch.pokerStyle}</span>
              <span className="char-difficulty" aria-label={`Difficulty: ${ch.difficultyLabel}`}>
                {Array.from({ length: 3 }, (_, i) => (
                  <span key={i} className={`pip${i < ch.difficulty ? ' lit' : ''}`} />
                ))}
                <span className="diff-label">{ch.difficultyLabel}</span>
              </span>
              {isSelected && <span className="char-intro">&ldquo;{ch.introLine}&rdquo;</span>}
            </button>
          );
        })}
      </div>

      <footer className="picker-foot">
        <button
          className="start-btn"
          disabled={!selected}
          onClick={() => selected && onStart(selected)}
          data-testid="start-match"
        >
          {selected ? 'Take Your Seat' : 'Choose an Opponent'}
        </button>
      </footer>
    </div>
  );
}
