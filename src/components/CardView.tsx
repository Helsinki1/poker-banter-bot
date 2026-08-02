import type { Card } from '../game/types';
import { CardBack, CardFace } from '../sprites/CardArt';

// One playing card. Cards are dealt from the dealer's position (left) with a
// curved, eased, staggered flight and flip — driven purely by CSS classes.

interface Props {
  card?: Card; // undefined = face-down
  width?: number;
  /** Which deal flight to play when the card mounts. */
  deal?: 'player' | 'opponent' | 'board' | null;
  delayMs?: number;
  highlight?: boolean;
  dim?: boolean;
}

export default function CardView({ card, width = 52, deal = null, delayMs = 0, highlight, dim }: Props) {
  return (
    <div
      className={[
        'cardv',
        deal ? `deal-${deal}` : '',
        card ? 'face-up' : 'face-down',
        highlight ? 'card-highlight' : '',
        dim ? 'card-dim' : '',
      ].filter(Boolean).join(' ')}
      style={{ width, height: Math.round(width * 1.4), animationDelay: `${delayMs}ms` }}
    >
      <div className="cardv-inner" style={{ animationDelay: `${delayMs}ms` }}>
        <div className="cardv-back"><CardBack width={width} /></div>
        <div className="cardv-front">
          {card ? <CardFace rank={card.rank} suit={card.suit} width={width} /> : <CardBack width={width} />}
        </div>
      </div>
    </div>
  );
}
