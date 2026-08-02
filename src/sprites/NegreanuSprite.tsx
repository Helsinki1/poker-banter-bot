// NegreanuSprite — original pixel-art homage to a chatty, people-reading poker pro.
// Fictional likeness: plain unbranded cap, no logos or patches.
// All animation is CSS-driven via data-mood / data-gaze (see negreanu.css).

import type { JSX } from 'react';
import type { OpponentSpriteProps } from './types';
import './negreanu.css';

// Palette
const OUT = '#1a1714'; // outline
const SKIN = '#c98e5f';
const SKIN_SH = '#a06b42';
const HAIR = '#2b241c';
const GREY = '#8d857a';
const CAP = '#6b1f24';
const CAP_SH = '#4a1519';
const JKT = '#33393b';
const JKT_SH = '#202527';
const TEE = '#cfc4a2';
const TEE_SH = '#b5aa88';
const CARD = '#6b1f24';
const CARD_SH = '#4a1519';
const TRIM = '#e8d9b0';
const WHITE = '#efe6d0';
const SHADOW = '#15181a';
const TABLE = '#23272b';
const TABLE_HI = '#2f353a';
const CHAIR = '#2c3236';
const CHAIR_SH = '#202527';

export default function NegreanuSprite(props: OpponentSpriteProps): JSX.Element {
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

      {/* ---------- torso (breather = always-on breathing) ---------- */}
      <g className="neg-torso">
        <g className="neg-breather">
          <rect x={27} y={45} width={42} height={57} fill={OUT} />
          <rect x={28} y={46} width={40} height={55} fill={JKT} />
          <rect x={58} y={46} width={10} height={55} fill={JKT_SH} />
          {/* collar of zip-up */}
          <rect x={38} y={46} width={8} height={4} fill={JKT_SH} />
          <rect x={50} y={46} width={8} height={4} fill={JKT_SH} />
          {/* plain tee in the open zip V */}
          <rect x={44} y={47} width={8} height={10} fill={TEE} />
          <rect x={50} y={47} width={2} height={10} fill={TEE_SH} />
          {/* zipper */}
          <rect x={47} y={57} width={2} height={44} fill={JKT_SH} />
          <rect x={47} y={57} width={2} height={2} fill={GREY} />
          {/* shoulder seams */}
          <rect x={29} y={52} width={5} height={1} fill={JKT_SH} />
          <rect x={62} y={52} width={5} height={1} fill={JKT_SH} />
          {/* neck (lives with torso so the head slides over it) */}
          <rect x={43} y={39} width={10} height={8} fill={OUT} />
          <rect x={44} y={40} width={8} height={7} fill={SKIN} />
          <rect x={44} y={40} width={8} height={2} fill={SKIN_SH} />
        </g>
      </g>

      {/* ---------- arms ---------- */}
      <g className="neg-armL">
        <rect x={21} y={49} width={11} height={26} fill={OUT} />
        <rect x={22} y={50} width={9} height={24} fill={JKT} />
        <rect x={22} y={50} width={2} height={24} fill={JKT_SH} />
        <rect x={17} y={73} width={12} height={17} fill={OUT} />
        <rect x={18} y={74} width={10} height={15} fill={JKT} />
        <rect x={18} y={86} width={10} height={3} fill={JKT_SH} />
      </g>
      <g className="neg-armR">
        <rect x={64} y={49} width={11} height={26} fill={OUT} />
        <rect x={65} y={50} width={9} height={24} fill={JKT} />
        <rect x={72} y={50} width={2} height={24} fill={JKT_SH} />
        <rect x={67} y={73} width={12} height={17} fill={OUT} />
        <rect x={68} y={74} width={10} height={15} fill={JKT} />
        <rect x={68} y={86} width={10} height={3} fill={JKT_SH} />
      </g>

      {/* ---------- hands ---------- */}
      <g className="neg-hands">
        <g className="neg-handL">
          <rect x={16} y={88} width={12} height={9} fill={OUT} />
          <rect x={17} y={89} width={10} height={7} fill={SKIN} />
          <rect x={17} y={93} width={10} height={2} fill={SKIN_SH} />
          <rect x={20} y={95} width={1} height={1} fill={SKIN_SH} />
          <rect x={23} y={95} width={1} height={1} fill={SKIN_SH} />
        </g>
        <g className="neg-handR">
          <rect x={68} y={88} width={12} height={9} fill={OUT} />
          <rect x={69} y={89} width={10} height={7} fill={SKIN} />
          <rect x={69} y={93} width={10} height={2} fill={SKIN_SH} />
          <rect x={72} y={95} width={1} height={1} fill={SKIN_SH} />
          <rect x={75} y={95} width={1} height={1} fill={SKIN_SH} />
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

      {/* ---------- head (headin = always-on breathing) ---------- */}
      <g className="neg-head">
        <g className="neg-headin">
          {/* face base */}
          <rect x={35} y={13} width={26} height={29} fill={OUT} />
          <rect x={36} y={14} width={24} height={26} fill={SKIN} />
          <rect x={36} y={14} width={24} height={1} fill={SKIN_SH} />
          <rect x={40} y={40} width={16} height={1} fill={SKIN} />
          <rect x={36} y={38} width={3} height={2} fill={OUT} />
          <rect x={57} y={38} width={3} height={2} fill={OUT} />
          {/* ears */}
          <rect x={33} y={24} width={4} height={7} fill={OUT} />
          <rect x={34} y={25} width={3} height={5} fill={SKIN} />
          <rect x={35} y={27} width={1} height={2} fill={SKIN_SH} />
          <rect x={59} y={24} width={4} height={7} fill={OUT} />
          <rect x={59} y={25} width={3} height={5} fill={SKIN} />
          <rect x={60} y={27} width={1} height={2} fill={SKIN_SH} />
          {/* cheeks + smile lines (expressive face) */}
          <rect x={37} y={29} width={2} height={4} fill={SKIN_SH} />
          <rect x={57} y={29} width={2} height={4} fill={SKIN_SH} />
          <rect x={41} y={31} width={1} height={2} fill={SKIN_SH} />
          <rect x={54} y={31} width={1} height={2} fill={SKIN_SH} />
          {/* nose */}
          <rect x={47} y={25} width={2} height={5} fill={SKIN_SH} />
          <rect x={46} y={30} width={4} height={1} fill={SKIN_SH} />
          {/* jaw stubble */}
          <rect x={38} y={34} width={2} height={3} fill={SKIN_SH} />
          <rect x={56} y={34} width={2} height={3} fill={SKIN_SH} />

          {/* cap — plain oxblood, pushed back, brim tipped up */}
          <g className="neg-cap">
            <rect x={35} y={4} width={26} height={8} fill={OUT} />
            <rect x={36} y={5} width={24} height={6} fill={CAP} />
            <rect x={54} y={5} width={6} height={6} fill={CAP_SH} />
            <rect x={36} y={11} width={24} height={1} fill={CAP_SH} />
            <rect x={47} y={5} width={2} height={1} fill={CAP_SH} />
            <rect x={30} y={5} width={7} height={5} fill={OUT} />
            <rect x={31} y={6} width={6} height={2} fill={CAP} />
            <rect x={31} y={8} width={6} height={1} fill={CAP_SH} />
          </g>

          {/* hair — fringe under pushed-back cap, grey at temples */}
          <g className="neg-hair">
            <rect x={36} y={12} width={24} height={3} fill={HAIR} />
            <rect x={38} y={15} width={3} height={1} fill={HAIR} />
            <rect x={45} y={15} width={4} height={1} fill={HAIR} />
            <rect x={53} y={15} width={3} height={1} fill={HAIR} />
            <rect x={36} y={15} width={2} height={12} fill={HAIR} />
            <rect x={58} y={15} width={2} height={12} fill={HAIR} />
            <rect x={36} y={22} width={2} height={3} fill={GREY} />
            <rect x={58} y={22} width={2} height={3} fill={GREY} />
            <rect x={41} y={13} width={2} height={1} fill={GREY} />
            <rect x={52} y={13} width={2} height={1} fill={GREY} />
          </g>

          {/* trimmed dark goatee with a grey fleck */}
          <g className="neg-goatee">
            <rect x={43} y={32} width={10} height={2} fill={HAIR} />
            <rect x={42} y={33} width={2} height={4} fill={HAIR} />
            <rect x={52} y={33} width={2} height={4} fill={HAIR} />
            <rect x={42} y={37} width={12} height={4} fill={HAIR} />
            <rect x={47} y={39} width={2} height={1} fill={GREY} />
          </g>

          {/* brows — biggest range of the cast */}
          <g className="neg-browL">
            <rect x={39} y={20} width={7} height={2} fill={HAIR} />
            <rect x={45} y={21} width={1} height={1} fill={HAIR} />
          </g>
          <g className="neg-browR">
            <rect x={50} y={20} width={7} height={2} fill={HAIR} />
            <rect x={50} y={21} width={1} height={1} fill={HAIR} />
          </g>

          {/* eyes + darting pupils */}
          <g className="neg-eyes">
            <rect x={40} y={22} width={6} height={1} fill={OUT} />
            <rect x={50} y={22} width={6} height={1} fill={OUT} />
            <rect x={40} y={23} width={6} height={4} fill={WHITE} />
            <rect x={50} y={23} width={6} height={4} fill={WHITE} />
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

          {/* mouth frames */}
          <g className="neg-mouth">
            <g className="neg-mouth-idle">
              <rect x={44} y={34} width={7} height={1} fill={OUT} />
              <rect x={51} y={33} width={1} height={1} fill={OUT} />
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

      {/* ---------- fx: read-glint / thinking motes / sparkles ---------- */}
      <g className="neg-fx">
        <g className="neg-fx-think">
          <rect x={64} y={9} width={2} height={2} fill={TRIM} />
          <rect x={67} y={6} width={2} height={2} fill={TRIM} />
          <rect x={69} y={10} width={1} height={2} fill={TRIM} />
          <rect x={68} y={14} width={1} height={1} fill={TRIM} />
        </g>
        <g className="neg-fx-spark">
          <rect x={29} y={10} width={2} height={2} fill={TRIM} />
          <rect x={64} y={8} width={2} height={2} fill={WHITE} />
          <rect x={26} y={24} width={1} height={1} fill={WHITE} />
          <rect x={68} y={26} width={2} height={2} fill={TRIM} />
        </g>
        <g className="neg-fx-glint">
          <rect x={45} y={23} width={1} height={1} fill={TRIM} />
        </g>
      </g>
    </svg>
  );
}
