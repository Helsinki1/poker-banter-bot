// Original pixel-art dealer character. Three-quarter view from the player's
// left: slicked dark hair, charcoal vest over oxblood shirt, white gloves.
// All animation is CSS-driven off data-mood (see dealer.css).

import type { DealerSpriteProps } from './types';
import './dealer.css';

// Palette (2-3 tones per material)
const VEST = '#2a251f';
const VEST_D = '#1a1714';
const VEST_HI = '#3a332b';
const SHIRT = '#6b1f24';
const SHIRT_HI = '#84292f';
const SKIN = '#e8d9b0';
const SKIN_SH = '#d3bd8d';
const HAIR = '#1a1714';
const HAIR_HI = '#3b2416';
const GLOVE = '#f4efe2';
const GLOVE_SH = '#d8d2c2';
const BRASS = '#9c7c3c';
const OX = '#6b1f24';
const OX_D = '#4c1418';
const OX_HI = '#84292f';
const PARCH = '#e8d9b0';
const RIM = '#f2c26b';
const SHADOW = '#100e0b';

export default function DealerSprite(props: DealerSpriteProps) {
  const size = props.size ?? 170;
  return (
    <svg
      className="px-sprite px-dealer"
      data-mood={props.mood}
      viewBox="0 0 96 120"
      width={size}
      height={(size * 120) / 96}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <g className="dlr-shadow">
        <rect x={18} y={102} width={60} height={5} fill={SHADOW} />
        <rect x={24} y={107} width={48} height={4} fill={SHADOW} />
      </g>

      <g className="dlr-torso">
        {/* vest body */}
        <rect x={26} y={50} width={44} height={8} fill={VEST} />
        <rect x={28} y={58} width={40} height={26} fill={VEST} />
        <rect x={30} y={84} width={36} height={16} fill={VEST} />
        <rect x={30} y={96} width={36} height={4} fill={VEST_D} />
        {/* warm rim light on the near (left) side */}
        <rect x={28} y={52} width={4} height={30} fill={VEST_HI} />
        <rect x={26} y={50} width={2} height={10} fill={RIM} />
        {/* far-side shade */}
        <rect x={64} y={58} width={4} height={26} fill={VEST_D} />
        {/* oxblood shirt in the vest V */}
        <rect x={42} y={50} width={12} height={8} fill={SHIRT} />
        <rect x={44} y={58} width={8} height={6} fill={SHIRT} />
        <rect x={46} y={64} width={4} height={4} fill={SHIRT_HI} />
        {/* lapels */}
        <rect x={40} y={50} width={2} height={16} fill={VEST_D} />
        <rect x={54} y={50} width={2} height={16} fill={VEST_D} />
        {/* brass collar pin + buttons */}
        <rect x={47} y={52} width={2} height={2} fill={BRASS} />
        <rect x={47} y={70} width={2} height={2} fill={BRASS} />
        <rect x={47} y={76} width={2} height={2} fill={BRASS} />
        <rect x={47} y={82} width={2} height={2} fill={BRASS} />
        {/* neck */}
        <rect x={43} y={42} width={10} height={8} fill={SKIN} />
        <rect x={43} y={42} width={10} height={2} fill={SKIN_SH} />
      </g>

      <g className="dlr-armL">
        <rect x={20} y={52} width={8} height={12} fill={SHIRT} />
        <rect x={20} y={62} width={4} height={2} fill={SHIRT_HI} />
        <rect x={18} y={62} width={8} height={16} fill={SHIRT} />
        <rect x={20} y={78} width={10} height={8} fill={SHIRT} />
        <rect x={28} y={84} width={12} height={8} fill={SHIRT} />
        <rect x={36} y={86} width={4} height={8} fill={SHIRT_HI} />
      </g>

      <g className="dlr-armR">
        <rect x={68} y={52} width={8} height={12} fill={SHIRT} />
        <rect x={72} y={62} width={4} height={2} fill={SHIRT_HI} />
        <rect x={70} y={62} width={8} height={16} fill={SHIRT} />
        <rect x={66} y={78} width={10} height={8} fill={SHIRT} />
        <rect x={56} y={84} width={12} height={8} fill={SHIRT} />
        <rect x={56} y={86} width={4} height={8} fill={SHIRT_HI} />
      </g>

      <g className="dlr-glovesL">
        <rect x={38} y={92} width={8} height={6} fill={GLOVE} />
        <rect x={40} y={98} width={6} height={4} fill={GLOVE} />
        <rect x={38} y={96} width={8} height={2} fill={GLOVE_SH} />
        <rect x={44} y={92} width={2} height={6} fill={GLOVE_SH} />
      </g>

      <g className="dlr-glovesR">
        <rect x={50} y={92} width={8} height={6} fill={GLOVE} />
        <rect x={50} y={98} width={6} height={4} fill={GLOVE} />
        <rect x={50} y={96} width={8} height={2} fill={GLOVE_SH} />
        <rect x={50} y={92} width={2} height={6} fill={GLOVE_SH} />
      </g>

      <g className="dlr-head">
        <rect x={34} y={18} width={22} height={24} fill={SKIN} />
        <rect x={38} y={42} width={14} height={2} fill={SKIN} />
        {/* far-side shade (three-quarter turn) */}
        <rect x={52} y={20} width={4} height={20} fill={SKIN_SH} />
        {/* ear on the far side */}
        <rect x={56} y={26} width={3} height={8} fill={SKIN} />
        <rect x={57} y={28} width={2} height={4} fill={SKIN_SH} />
        {/* nose + cheek */}
        <rect x={40} y={30} width={2} height={6} fill={SKIN_SH} />
        <rect x={40} y={36} width={3} height={2} fill={SKIN_SH} />
        <rect x={37} y={34} width={2} height={2} fill={SKIN_SH} />
        {/* warm rim light on the near edge of the face */}
        <rect x={34} y={22} width={2} height={14} fill={RIM} />
      </g>

      <g className="dlr-hair">
        <rect x={32} y={10} width={26} height={10} fill={HAIR} />
        <rect x={32} y={18} width={4} height={12} fill={HAIR} />
        <rect x={54} y={18} width={4} height={10} fill={HAIR} />
        <rect x={44} y={20} width={8} height={2} fill={HAIR} />
        {/* slicked shine */}
        <rect x={36} y={12} width={16} height={2} fill={HAIR_HI} />
        <rect x={34} y={14} width={2} height={4} fill={HAIR_HI} />
        {/* sideburns */}
        <rect x={34} y={28} width={2} height={4} fill={HAIR} />
        <rect x={56} y={24} width={2} height={4} fill={HAIR} />
        {/* small tied-back tail with brass band */}
        <rect x={58} y={16} width={3} height={10} fill={HAIR} />
        <rect x={58} y={22} width={3} height={2} fill={BRASS} />
      </g>

      <g className="dlr-eyes">
        <rect x={37} y={26} width={6} height={2} fill={HAIR} />
        <rect x={47} y={26} width={6} height={2} fill={HAIR} />
        <rect x={38} y={29} width={5} height={2} fill={VEST_D} />
        <rect x={48} y={29} width={5} height={2} fill={VEST_D} />
      </g>

      <g className="dlr-mouth">
        <rect x={43} y={38} width={6} height={2} fill={OX} />
        <rect x={48} y={37} width={2} height={2} fill={OX} />
      </g>

      <g className="dlr-deck">
        <g className="dlr-deck-a">
          <rect x={39} y={102} width={9} height={3} fill={OX_HI} />
          <rect x={39} y={105} width={9} height={4} fill={OX} />
          <rect x={39} y={109} width={9} height={2} fill={OX_D} />
          <rect x={42} y={106} width={2} height={2} fill={PARCH} />
        </g>
        <g className="dlr-deck-b">
          <rect x={48} y={102} width={9} height={3} fill={OX_HI} />
          <rect x={48} y={105} width={9} height={4} fill={OX} />
          <rect x={48} y={109} width={9} height={2} fill={OX_D} />
          <rect x={52} y={106} width={2} height={2} fill={PARCH} />
        </g>
      </g>
    </svg>
  );
}
