// TrumpSprite — original pixel-art caricature: swooped gold hair, navy suit,
// white shirt, long red tie. Reuses the "neg" animation rig (class names +
// negreanu.css keyframes: breathing, blinks, darting pupils, mouth frames),
// so it stays in sync with the rest of the cast for free.

import type { JSX } from 'react';
import type { OpponentSpriteProps } from './types';
import './negreanu.css';

// Palette
const OUT = '#1a1714'; // outline
const SKIN = '#e0a06a';
const SKIN_SH = '#c17e45';
const HAIR = '#e8c35a';
const HAIR_SH = '#c9a13c';
const SUIT = '#1f2a44';
const SUIT_SH = '#151d31';
const SHIRT = '#efe6d0';
const SHIRT_SH = '#d6cbb2';
const TIE = '#a3242a';
const TIE_SH = '#7c181d';
const CARD = '#6b1f24';
const CARD_SH = '#4a1519';
const TRIM = '#e8d9b0';
const WHITE = '#efe6d0';
const SHADOW = '#15181a';
const TABLE = '#23272b';
const TABLE_HI = '#2f353a';
const CHAIR = '#2c3236';
const CHAIR_SH = '#202527';

export default function TrumpSprite(props: OpponentSpriteProps): JSX.Element {
  const { mood, variant, size, gaze } = props;
  const width = size ?? 220;
  const viewBox = variant === 'portrait' ? '16 4 64 64' : '0 0 96 112';
  const height =
    variant === 'portrait' ? width : Math.round((width * 112) / 96);

  return (
    <svg
      className="px-sprite px-negreanu"
      viewBox={viewBox}
      width={width}
      height={height}
      shapeRendering="crispEdges"
      data-mood={mood}
      data-gaze={gaze ?? 'player'}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ---------- shadow ---------- */}
      <g className="neg-shadow">
        <rect x={25} y={44} width={48} height={54} fill={SHADOW} />
      </g>

      {/* ---------- chair ---------- */}
      <g className="neg-chair">
        <rect x={25} y={33} width={46} height={6} fill={OUT} />
        <rect x={26} y={34} width={44} height={4} fill={CHAIR} />
        <rect x={26} y={38} width={5} height={32} fill={CHAIR_SH} />
        <rect x={65} y={38} width={5} height={32} fill={CHAIR_SH} />
      </g>

      {/* ---------- torso (suit + shirt + long red tie) ---------- */}
      <g className="neg-torso">
        <g className="neg-breather">
          <rect x={27} y={45} width={42} height={57} fill={OUT} />
          <rect x={28} y={46} width={40} height={55} fill={SUIT} />
          <rect x={58} y={46} width={10} height={55} fill={SUIT_SH} />
          {/* wide suit lapels */}
          <rect x={36} y={46} width={4} height={14} fill={SUIT_SH} />
          <rect x={56} y={46} width={4} height={14} fill={SUIT_SH} />
          {/* white shirt V */}
          <rect x={41} y={46} width={14} height={6} fill={SHIRT} />
          <rect x={43} y={52} width={10} height={4} fill={SHIRT} />
          <rect x={52} y={46} width={3} height={10} fill={SHIRT_SH} />
          {/* the long red tie */}
          <rect x={46} y={49} width={4} height={3} fill={TIE_SH} />
          <rect x={45} y={52} width={6} height={38} fill={TIE} />
          <rect x={49} y={52} width={2} height={38} fill={TIE_SH} />
          <rect x={46} y={90} width={4} height={4} fill={TIE} />
          <rect x={46} y={93} width={4} height={1} fill={TIE_SH} />
          {/* suit button */}
          <rect x={42} y={72} width={2} height={2} fill={HAIR_SH} />
          {/* shoulder pads */}
          <rect x={28} y={48} width={8} height={2} fill={SUIT_SH} />
          <rect x={60} y={48} width={8} height={2} fill={SUIT_SH} />
          {/* neck */}
          <rect x={43} y={39} width={10} height={8} fill={OUT} />
          <rect x={44} y={40} width={8} height={7} fill={SKIN} />
          <rect x={44} y={40} width={8} height={2} fill={SKIN_SH} />
        </g>
      </g>

      {/* ---------- arms ---------- */}
      <g className="neg-armL">
        <rect x={21} y={49} width={11} height={26} fill={OUT} />
        <rect x={22} y={50} width={9} height={24} fill={SUIT} />
        <rect x={22} y={50} width={2} height={24} fill={SUIT_SH} />
        <rect x={17} y={73} width={12} height={17} fill={OUT} />
        <rect x={18} y={74} width={10} height={15} fill={SUIT} />
        <rect x={18} y={86} width={10} height={3} fill={SHIRT} />
      </g>
      <g className="neg-armR">
        <rect x={64} y={49} width={11} height={26} fill={OUT} />
        <rect x={65} y={50} width={9} height={24} fill={SUIT} />
        <rect x={72} y={50} width={2} height={24} fill={SUIT_SH} />
        <rect x={67} y={73} width={12} height={17} fill={OUT} />
        <rect x={68} y={74} width={10} height={15} fill={SUIT} />
        <rect x={68} y={86} width={10} height={3} fill={SHIRT} />
      </g>

      {/* ---------- hands (small, famously) ---------- */}
      <g className="neg-hands">
        <g className="neg-handL">
          <rect x={17} y={89} width={10} height={8} fill={OUT} />
          <rect x={18} y={90} width={8} height={6} fill={SKIN} />
          <rect x={18} y={93} width={8} height={2} fill={SKIN_SH} />
          <rect x={21} y={95} width={1} height={1} fill={SKIN_SH} />
        </g>
        <g className="neg-handR">
          <rect x={69} y={89} width={10} height={8} fill={OUT} />
          <rect x={70} y={90} width={8} height={6} fill={SKIN} />
          <rect x={70} y={93} width={8} height={2} fill={SKIN_SH} />
          <rect x={74} y={95} width={1} height={1} fill={SKIN_SH} />
        </g>
      </g>

      {/* ---------- table edge ---------- */}
      <g className="neg-table">
        <rect x={0} y={98} width={96} height={14} fill={TABLE} />
        <rect x={0} y={98} width={96} height={2} fill={TABLE_HI} />
      </g>

      {/* ---------- two face-down cards ---------- */}
      <g className="neg-cards">
        <g className="neg-card1">
          <rect x={34} y={92} width={11} height={15} fill={OUT} />
          <rect x={35} y={93} width={9} height={13} fill={TRIM} />
          <rect x={36} y={94} width={7} height={11} fill={CARD} />
          <rect x={37} y={95} width={2} height={2} fill={CARD_SH} />
          <rect x={40} y={98} width={2} height={2} fill={CARD_SH} />
          <rect x={37} y={101} width={2} height={2} fill={CARD_SH} />
        </g>
        <g className="neg-card2">
          <rect x={51} y={92} width={11} height={15} fill={OUT} />
          <rect x={52} y={93} width={9} height={13} fill={TRIM} />
          <rect x={53} y={94} width={7} height={11} fill={CARD} />
          <rect x={54} y={95} width={2} height={2} fill={CARD_SH} />
          <rect x={57} y={98} width={2} height={2} fill={CARD_SH} />
          <rect x={54} y={101} width={2} height={2} fill={CARD_SH} />
        </g>
      </g>

      {/* ---------- head ---------- */}
      <g className="neg-head">
        <g className="neg-headin">
          {/* face base — a little fuller in the jaw */}
          <rect x={35} y={13} width={26} height={29} fill={OUT} />
          <rect x={36} y={14} width={24} height={26} fill={SKIN} />
          <rect x={36} y={14} width={24} height={1} fill={SKIN_SH} />
          <rect x={40} y={40} width={16} height={1} fill={SKIN} />
          <rect x={36} y={38} width={3} height={2} fill={OUT} />
          <rect x={57} y={38} width={3} height={2} fill={OUT} />
          {/* jowls */}
          <rect x={37} y={33} width={2} height={4} fill={SKIN_SH} />
          <rect x={57} y={33} width={2} height={4} fill={SKIN_SH} />
          {/* ears */}
          <rect x={33} y={24} width={4} height={7} fill={OUT} />
          <rect x={34} y={25} width={3} height={5} fill={SKIN} />
          <rect x={35} y={27} width={1} height={2} fill={SKIN_SH} />
          <rect x={59} y={24} width={4} height={7} fill={OUT} />
          <rect x={59} y={25} width={3} height={5} fill={SKIN} />
          <rect x={60} y={27} width={1} height={2} fill={SKIN_SH} />
          {/* squint lines + cheeks */}
          <rect x={41} y={28} width={1} height={1} fill={SKIN_SH} />
          <rect x={54} y={28} width={1} height={1} fill={SKIN_SH} />
          <rect x={39} y={30} width={2} height={2} fill={SKIN_SH} />
          <rect x={55} y={30} width={2} height={2} fill={SKIN_SH} />
          {/* nose */}
          <rect x={47} y={25} width={2} height={5} fill={SKIN_SH} />
          <rect x={46} y={30} width={4} height={1} fill={SKIN_SH} />

          {/* the swoop — tall combed-over golden crown, no cap */}
          <g className="neg-cap">
            <rect x={34} y={5} width={28} height={10} fill={OUT} />
            <rect x={35} y={6} width={26} height={9} fill={HAIR} />
            {/* swoop sweep lines */}
            <rect x={36} y={7} width={20} height={1} fill={HAIR_SH} />
            <rect x={38} y={10} width={18} height={1} fill={HAIR_SH} />
            {/* front wave curling up over the forehead */}
            <rect x={56} y={4} width={6} height={4} fill={OUT} />
            <rect x={57} y={5} width={5} height={3} fill={HAIR} />
            <rect x={58} y={5} width={3} height={1} fill={HAIR_SH} />
            {/* back of the swoop */}
            <rect x={33} y={8} width={3} height={6} fill={OUT} />
            <rect x={34} y={9} width={2} height={4} fill={HAIR_SH} />
          </g>

          {/* side hair sweeping over the ears */}
          <g className="neg-hair">
            <rect x={36} y={14} width={24} height={2} fill={HAIR} />
            <rect x={36} y={16} width={2} height={9} fill={HAIR} />
            <rect x={58} y={16} width={2} height={9} fill={HAIR} />
            <rect x={36} y={22} width={2} height={3} fill={HAIR_SH} />
            <rect x={58} y={22} width={2} height={3} fill={HAIR_SH} />
          </g>

          {/* no goatee — clean jaw */}
          <g className="neg-goatee" />

          {/* heavy low brows */}
          <g className="neg-browL">
            <rect x={39} y={20} width={7} height={2} fill={HAIR_SH} />
            <rect x={45} y={21} width={1} height={1} fill={HAIR_SH} />
          </g>
          <g className="neg-browR">
            <rect x={50} y={20} width={7} height={2} fill={HAIR_SH} />
            <rect x={50} y={21} width={1} height={1} fill={HAIR_SH} />
          </g>

          {/* squinting eyes + darting pupils */}
          <g className="neg-eyes">
            <rect x={40} y={22} width={6} height={1} fill={OUT} />
            <rect x={50} y={22} width={6} height={1} fill={OUT} />
            <rect x={40} y={23} width={6} height={3} fill={WHITE} />
            <rect x={50} y={23} width={6} height={3} fill={WHITE} />
            <rect x={40} y={26} width={6} height={1} fill={SKIN_SH} />
            <rect x={50} y={26} width={6} height={1} fill={SKIN_SH} />
            <g className="neg-pupils">
              <rect x={42} y={24} width={2} height={2} fill={OUT} />
              <rect x={52} y={24} width={2} height={2} fill={OUT} />
            </g>
          </g>

          {/* eyelids (blink) */}
          <g className="neg-eyelids">
            <rect x={40} y={22} width={6} height={5} fill={SKIN} />
            <rect x={50} y={22} width={6} height={5} fill={SKIN} />
          </g>

          {/* mouth frames — trademark pucker on idle */}
          <g className="neg-mouth">
            <g className="neg-mouth-idle">
              <rect x={45} y={34} width={5} height={1} fill={OUT} />
              <rect x={44} y={33} width={1} height={1} fill={SKIN_SH} />
              <rect x={50} y={33} width={1} height={1} fill={SKIN_SH} />
            </g>
            <g className="neg-mouth-0">
              <rect x={44} y={34} width={8} height={1} fill={OUT} />
            </g>
            <g className="neg-mouth-1">
              <rect x={45} y={33} width={6} height={2} fill={OUT} />
              <rect x={45} y={35} width={6} height={1} fill={SKIN_SH} />
            </g>
            <g className="neg-mouth-2">
              <rect x={44} y={33} width={8} height={3} fill={OUT} />
              <rect x={46} y={35} width={4} height={1} fill={CARD} />
            </g>
            <g className="neg-mouth-smile">
              <rect x={43} y={33} width={10} height={3} fill={OUT} />
              <rect x={44} y={33} width={8} height={1} fill={WHITE} />
              <rect x={42} y={32} width={1} height={1} fill={OUT} />
              <rect x={53} y={32} width={1} height={1} fill={OUT} />
            </g>
            <g className="neg-mouth-frown">
              <rect x={45} y={33} width={6} height={1} fill={OUT} />
              <rect x={44} y={34} width={1} height={1} fill={OUT} />
              <rect x={51} y={34} width={1} height={1} fill={OUT} />
            </g>
          </g>
        </g>
      </g>

      {/* ---------- fx: glint / thinking motes / sparkles ---------- */}
      <g className="neg-fx">
        <g className="neg-fx-think">
          <rect x={64} y={9} width={2} height={2} fill={TRIM} />
          <rect x={67} y={6} width={2} height={2} fill={TRIM} />
          <rect x={69} y={10} width={1} height={2} fill={TRIM} />
          <rect x={68} y={14} width={1} height={1} fill={TRIM} />
        </g>
        <g className="neg-fx-spark">
          <rect x={29} y={10} width={2} height={2} fill={HAIR} />
          <rect x={64} y={8} width={2} height={2} fill={WHITE} />
          <rect x={26} y={24} width={1} height={1} fill={WHITE} />
          <rect x={68} y={26} width={2} height={2} fill={HAIR} />
        </g>
        <g className="neg-fx-glint">
          <rect x={45} y={23} width={1} height={1} fill={TRIM} />
        </g>
      </g>
    </svg>
  );
}
