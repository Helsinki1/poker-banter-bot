// LebronSprite — original pixel-art homage to a tall, imposing basketball-great
// poker opponent. Pure presentational SVG; all animation is CSS keyed off
// data-mood / data-gaze (see lebron.css). No game logic lives here.

import type { JSX } from 'react';
import './lebron.css';
import type { OpponentSpriteProps } from './types';

const SEATED_VIEWBOX = '0 0 96 112';
const PORTRAIT_VIEWBOX = '16 4 64 64';

// Palette
const SKIN = '#7a4a2b';
const SKIN_SHADE = '#5c3620';
const SKIN_HI = '#94603a';
const HAIR = '#17130f';
const HAIR_SHEEN = '#2b241c';
const HOODIE = '#23262b';
const HOODIE_SHADE = '#16181c';
const GOLD = '#9c7c3c';
const CARD_BACK = '#6b1f24';
const CARD_TRIM = '#e8d9b0';
const OUTLINE = '#1a1714';

export default function LebronSprite(props: OpponentSpriteProps): JSX.Element {
  const { mood, variant, size = 220, gaze = 'player' } = props;
  const width = size;
  const height =
    variant === 'seated' ? Math.round((size * 112) / 96) : size;

  return (
    <svg
      className="px-sprite px-lebron"
      viewBox={variant === 'seated' ? SEATED_VIEWBOX : PORTRAIT_VIEWBOX}
      width={width}
      height={height}
      shapeRendering="crispEdges"
      data-mood={mood}
      data-gaze={gaze}
      aria-hidden="true"
    >
      {/* ---------- drop shadow ---------- */}
      <g className="leb-shadow">
        <rect x={61} y={12} width={2} height={24} fill={HOODIE_SHADE} />
        <rect x={80} y={50} width={2} height={36} fill={HOODIE_SHADE} />
        <rect x={20} y={86} width={58} height={2} fill={OUTLINE} />
      </g>

      {/* ---------- chair (high back, reads wide) ---------- */}
      <g className="leb-chair">
        <rect x={14} y={34} width={68} height={6} fill={HOODIE} />
        <rect x={14} y={38} width={68} height={2} fill={HOODIE_SHADE} />
        <rect x={14} y={40} width={4} height={48} fill={HOODIE_SHADE} />
        <rect x={78} y={40} width={4} height={48} fill={HOODIE_SHADE} />
      </g>

      {/* ---------- torso: widest shoulders of the cast ---------- */}
      <g className="leb-torso">
        <rect x={43} y={36} width={10} height={8} fill={SKIN} />
        <rect x={43} y={40} width={10} height={3} fill={SKIN_SHADE} />
        <rect x={18} y={44} width={60} height={10} fill={HOODIE} />
        <rect x={18} y={44} width={60} height={1} fill={OUTLINE} />
        <rect x={24} y={54} width={48} height={28} fill={HOODIE} />
        <rect x={24} y={54} width={2} height={28} fill={HOODIE_SHADE} />
        <rect x={66} y={54} width={6} height={28} fill={HOODIE_SHADE} />
        <rect x={26} y={54} width={40} height={2} fill={HOODIE_SHADE} />
        <rect x={40} y={42} width={16} height={4} fill={HOODIE_SHADE} />
        <rect x={34} y={46} width={28} height={3} fill={HOODIE_SHADE} />
        <rect x={47} y={56} width={2} height={26} fill={HOODIE_SHADE} />
        {/* single muted gold accent stripe (unbranded warm-up top) */}
        <rect x={24} y={60} width={48} height={2} fill={GOLD} />
      </g>

      {/* ---------- left arm (screen-left) ---------- */}
      <g className="leb-armL">
        <rect x={16} y={50} width={10} height={22} fill={HOODIE} />
        <rect x={16} y={50} width={2} height={22} fill={HOODIE_SHADE} />
        <rect x={16} y={60} width={10} height={2} fill={GOLD} />
        <rect x={18} y={72} width={10} height={10} fill={HOODIE} />
        <rect x={18} y={72} width={2} height={10} fill={HOODIE_SHADE} />
        <rect x={18} y={82} width={10} height={4} fill={HOODIE_SHADE} />
      </g>

      {/* ---------- right arm (screen-right, acts on chips) ---------- */}
      <g className="leb-armR">
        <rect x={70} y={50} width={10} height={22} fill={HOODIE} />
        <rect x={78} y={50} width={2} height={22} fill={HOODIE_SHADE} />
        <rect x={70} y={60} width={10} height={2} fill={GOLD} />
        <rect x={68} y={72} width={10} height={10} fill={HOODIE} />
        <rect x={76} y={72} width={2} height={10} fill={HOODIE_SHADE} />
        <rect x={68} y={82} width={10} height={4} fill={HOODIE_SHADE} />
      </g>

      {/* ---------- table edge ---------- */}
      <g className="leb-table">
        <rect x={0} y={88} width={96} height={1} fill={OUTLINE} />
        <rect x={0} y={89} width={96} height={3} fill={HOODIE} />
        <rect x={0} y={92} width={96} height={20} fill={HOODIE_SHADE} />
      </g>

      {/* ---------- hands + chip stack ---------- */}
      <g className="leb-hands">
        <g className="leb-handL">
          <rect x={28} y={84} width={9} height={6} fill={SKIN} />
          <rect x={28} y={88} width={9} height={2} fill={SKIN_SHADE} />
          <rect x={31} y={84} width={1} height={2} fill={SKIN_SHADE} />
          <rect x={34} y={84} width={1} height={2} fill={SKIN_SHADE} />
        </g>
        <g className="leb-handR">
          <rect x={59} y={84} width={9} height={6} fill={SKIN} />
          <rect x={59} y={88} width={9} height={2} fill={SKIN_SHADE} />
          <rect x={61} y={84} width={1} height={2} fill={SKIN_SHADE} />
          <rect x={64} y={84} width={1} height={2} fill={SKIN_SHADE} />
        </g>
        <g className="leb-chips">
          <rect x={70} y={86} width={8} height={2} fill={GOLD} />
          <rect x={70} y={84} width={8} height={2} fill={CARD_BACK} />
          <rect x={70} y={82} width={8} height={2} fill={GOLD} />
          <rect x={72} y={82} width={1} height={2} fill={CARD_TRIM} />
          <rect x={75} y={84} width={1} height={2} fill={CARD_TRIM} />
        </g>
      </g>

      {/* ---------- two face-down hole cards ---------- */}
      <g className="leb-cards">
        <rect x={38} y={77} width={9} height={13} fill={OUTLINE} />
        <rect x={39} y={78} width={7} height={11} fill={CARD_TRIM} />
        <rect x={40} y={79} width={5} height={9} fill={CARD_BACK} />
        <rect x={42} y={81} width={1} height={5} fill={CARD_TRIM} />
        <rect x={41} y={83} width={3} height={1} fill={CARD_TRIM} />
        <rect x={48} y={78} width={9} height={13} fill={OUTLINE} />
        <rect x={49} y={79} width={7} height={11} fill={CARD_TRIM} />
        <rect x={50} y={80} width={5} height={9} fill={CARD_BACK} />
        <rect x={52} y={82} width={1} height={5} fill={CARD_TRIM} />
        <rect x={51} y={84} width={3} height={1} fill={CARD_TRIM} />
      </g>

      {/* ---------- head (facial groups nested so head motion composes) ---------- */}
      <g className="leb-head">
        {/* face base + strong jaw */}
        <rect x={36} y={14} width={24} height={20} fill={SKIN} />
        <rect x={38} y={34} width={20} height={4} fill={SKIN} />
        <rect x={38} y={15} width={9} height={2} fill={SKIN_HI} />
        <rect x={39} y={25} width={3} height={2} fill={SKIN_HI} />
        <rect x={57} y={16} width={3} height={10} fill={SKIN_SHADE} />
        <rect x={40} y={21} width={6} height={1} fill={SKIN_SHADE} />
        <rect x={51} y={21} width={6} height={1} fill={SKIN_SHADE} />
        <rect x={51} y={25} width={4} height={1} fill={SKIN_SHADE} />
        {/* ears */}
        <rect x={34} y={22} width={2} height={6} fill={SKIN} />
        <rect x={34} y={24} width={1} height={2} fill={SKIN_SHADE} />
        <rect x={60} y={22} width={2} height={6} fill={SKIN} />
        <rect x={61} y={24} width={1} height={2} fill={SKIN_SHADE} />
        {/* nose */}
        <rect x={47} y={23} width={2} height={4} fill={SKIN_HI} />
        <rect x={46} y={27} width={4} height={2} fill={SKIN_SHADE} />

        {/* closely cropped hair */}
        <g className="leb-hair">
          <rect x={36} y={8} width={24} height={6} fill={HAIR} />
          <rect x={36} y={14} width={2} height={5} fill={HAIR} />
          <rect x={58} y={14} width={2} height={5} fill={HAIR} />
          <rect x={40} y={9} width={7} height={1} fill={HAIR_SHEEN} />
          <rect x={50} y={11} width={4} height={1} fill={HAIR_SHEEN} />
        </g>

        {/* full black beard framing the jaw */}
        <g className="leb-beard">
          <rect x={36} y={26} width={3} height={8} fill={HAIR} />
          <rect x={57} y={26} width={3} height={8} fill={HAIR} />
          <rect x={41} y={28} width={14} height={2} fill={HAIR} />
          <rect x={39} y={30} width={3} height={4} fill={HAIR} />
          <rect x={54} y={30} width={3} height={4} fill={HAIR} />
          <rect x={37} y={33} width={22} height={5} fill={HAIR} />
          <rect x={40} y={38} width={16} height={2} fill={HAIR} />
          <rect x={43} y={28} width={4} height={1} fill={HAIR_SHEEN} />
          <rect x={42} y={35} width={5} height={1} fill={HAIR_SHEEN} />
          <rect x={50} y={36} width={4} height={1} fill={HAIR_SHEEN} />
        </g>

        {/* brows */}
        <g className="leb-browL">
          <rect x={39} y={19} width={7} height={2} fill={HAIR} />
        </g>
        <g className="leb-browR">
          <rect x={50} y={19} width={7} height={2} fill={HAIR} />
        </g>

        {/* calm focused eyes; pupils shift with data-gaze */}
        <g className="leb-eyes">
          <rect x={40} y={22} width={5} height={3} fill={CARD_TRIM} />
          <rect x={51} y={22} width={5} height={3} fill={CARD_TRIM} />
          <rect className="leb-eye-wide" x={40} y={21} width={5} height={1} fill={CARD_TRIM} />
          <rect className="leb-eye-wide" x={51} y={21} width={5} height={1} fill={CARD_TRIM} />
          <g className="leb-pupils">
            <rect x={42} y={22} width={2} height={2} fill={HAIR} />
            <rect x={53} y={22} width={2} height={2} fill={HAIR} />
          </g>
        </g>

        {/* eyelids: full lids blink; half lids for suspicious narrowing */}
        <g className="leb-eyelids">
          <rect className="leb-lid" x={40} y={22} width={5} height={3} fill={SKIN_SHADE} />
          <rect className="leb-lid" x={51} y={22} width={5} height={3} fill={SKIN_SHADE} />
          <rect className="leb-lid-half" x={40} y={22} width={5} height={1} fill={SKIN_SHADE} />
          <rect className="leb-lid-half" x={51} y={22} width={5} height={1} fill={SKIN_SHADE} />
          <rect className="leb-lid-half" x={40} y={24} width={5} height={1} fill={SKIN_SHADE} />
          <rect className="leb-lid-half" x={51} y={24} width={5} height={1} fill={SKIN_SHADE} />
        </g>

        {/* mouth frames inside beard opening */}
        <g className="leb-mouth">
          <g className="leb-mouth-0">
            <rect x={44} y={31} width={8} height={1} fill={OUTLINE} />
          </g>
          <g className="leb-mouth-1">
            <rect x={45} y={30} width={6} height={2} fill={OUTLINE} />
            <rect x={46} y={31} width={4} height={1} fill={SKIN_SHADE} />
          </g>
          <g className="leb-mouth-2">
            <rect x={44} y={30} width={8} height={3} fill={OUTLINE} />
            <rect x={45} y={32} width={6} height={1} fill={CARD_BACK} />
          </g>
          <g className="leb-mouth-smile">
            <rect x={44} y={30} width={8} height={1} fill={OUTLINE} />
            <rect x={43} y={29} width={1} height={1} fill={OUTLINE} />
            <rect x={52} y={29} width={1} height={1} fill={OUTLINE} />
            <rect x={45} y={31} width={6} height={1} fill={CARD_TRIM} />
          </g>
          <rect className="leb-smirk" x={52} y={30} width={1} height={1} fill={OUTLINE} />
        </g>
      </g>

      {/* ---------- fx: emphasis pixels for winning / celebrating ---------- */}
      <g className="leb-fx">
        <rect x={30} y={10} width={2} height={2} fill={GOLD} />
        <rect x={64} y={7} width={2} height={2} fill={GOLD} />
        <rect x={27} y={20} width={2} height={2} fill={GOLD} />
        <rect x={67} y={18} width={2} height={2} fill={GOLD} />
        <rect x={48} y={4} width={2} height={2} fill={GOLD} />
        <rect x={33} y={6} width={1} height={1} fill={CARD_TRIM} />
        <rect x={62} y={12} width={1} height={1} fill={CARD_TRIM} />
      </g>
    </svg>
  );
}
