// DanaSprite — original pixel-art caricature drawn in the same hand-authored
// rect style as LebronSprite/TrumpSprite: 96x112 seated grid, flat palette,
// dark outlines, chunky pixels. Signature features kept from the reference:
// long straight dark hair with a middle part, big toothy smile, black
// long-sleeve top. All animation is CSS keyed off data-mood (see dana.css).

import type { JSX } from 'react';
import type { OpponentSpriteProps } from './types';
import './dana.css';

// Palette
const OUT = '#1a1714';
const SKIN = '#e2a482';
const SKIN_SH = '#c07f5f';
const SKIN_HI = '#f0c3a2';
const BLUSH = '#d98a7a';
const HAIR = '#2a1d18';
const HAIR_SHEEN = '#453027';
const TOP = '#1d1d22';
const TOP_SH = '#111114';
const TEETH = '#f2ece0';
const TEETH_SH = '#ddd3c2';
const EYE_WHITE = '#f4efe6';
const MOUTH_IN = '#5e2429';
const LIP = '#b05a55';
const CARD = '#6b1f24';
const CARD_SH = '#4a1519';
const TRIM = '#e8d9b0';
const CHIP_BLUE = '#274a68';
const HEART = '#e07a9a';
const TABLE = '#23272b';
const TABLE_HI = '#2f353a';
const CHAIR = '#2c3236';
const CHAIR_SH = '#202527';
const SHADOW = '#15181a';

type Px = readonly [x: number, y: number, w: number, h: number, fill: string];

function px(rects: readonly Px[]): JSX.Element[] {
  return rects.map(([x, y, w, h, fill], i) => (
    <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
  ));
}

const CHAIR_PX: readonly Px[] = [
  [25, 33, 46, 6, OUT],
  [26, 34, 44, 4, CHAIR],
  [26, 38, 5, 32, CHAIR_SH],
  [65, 38, 5, 32, CHAIR_SH],
];

// Torso: black long-sleeve top with a scoop neckline.
const TORSO: readonly Px[] = [
  [29, 45, 38, 53, OUT],
  [30, 46, 36, 51, TOP],
  [60, 46, 6, 51, TOP_SH],
  [30, 46, 2, 51, TOP_SH],
  // shoulder seams
  [30, 47, 8, 1, TOP_SH],
  [58, 47, 8, 1, TOP_SH],
  // scoop neckline showing skin
  [44, 46, 8, 1, SKIN],
  [45, 47, 6, 1, SKIN],
  // neck
  [43, 40, 10, 7, OUT],
  [44, 41, 8, 6, SKIN],
  [44, 41, 8, 1, SKIN_SH],
];

const ARM_L: readonly Px[] = [
  [22, 49, 10, 26, OUT],
  [23, 50, 8, 24, TOP],
  [23, 50, 2, 24, TOP_SH],
  [18, 73, 12, 17, OUT],
  [19, 74, 10, 15, TOP],
  [19, 86, 10, 3, TOP_SH],
];

const ARM_R: readonly Px[] = [
  [64, 49, 10, 26, OUT],
  [65, 50, 8, 24, TOP],
  [71, 50, 2, 24, TOP_SH],
  [66, 73, 12, 17, OUT],
  [67, 74, 10, 15, TOP],
  [67, 86, 10, 3, TOP_SH],
];

const HANDS: readonly Px[] = [
  [17, 89, 10, 8, OUT],
  [18, 90, 8, 6, SKIN],
  [18, 93, 8, 2, SKIN_SH],
  [21, 95, 1, 1, SKIN_SH],
  [69, 89, 10, 8, OUT],
  [70, 90, 8, 6, SKIN],
  [70, 93, 8, 2, SKIN_SH],
  [74, 95, 1, 1, SKIN_SH],
];

const TABLE_PX: readonly Px[] = [
  [0, 98, 96, 2, TABLE_HI],
  [0, 100, 96, 12, TABLE],
];

// Two face-down hole cards.
const CARDS: readonly Px[] = [
  [34, 92, 11, 15, OUT],
  [35, 93, 9, 13, TRIM],
  [36, 94, 7, 11, CARD],
  [37, 95, 2, 2, CARD_SH],
  [40, 98, 2, 2, CARD_SH],
  [37, 101, 2, 2, CARD_SH],
  [51, 92, 11, 15, OUT],
  [52, 93, 9, 13, TRIM],
  [53, 94, 7, 11, CARD],
  [54, 95, 2, 2, CARD_SH],
  [57, 98, 2, 2, CARD_SH],
  [54, 101, 2, 2, CARD_SH],
];

// A small chip stack she pushes when betting/raising.
const CHIPS: readonly Px[] = [
  [81, 96, 8, 2, CARD],
  [82, 96, 2, 1, TRIM],
  [81, 94, 8, 2, CHIP_BLUE],
  [85, 94, 2, 1, TRIM],
  [81, 92, 8, 2, CARD],
  [82, 92, 2, 1, TRIM],
];

// Face base + long middle-parted hair. Curtains frame the face and drape
// over the shoulders; the part reads as a dark notch in the crown sheen.
const FACE: readonly Px[] = [
  [36, 14, 24, 27, OUT],
  [37, 15, 22, 25, SKIN],
  [41, 40, 14, 1, SKIN], // rounded chin
  [38, 16, 8, 1, SKIN_HI],
  [37, 36, 2, 4, SKIN_SH], // jaw shading
  [57, 36, 2, 4, SKIN_SH],
  // nose: short bridge + soft base
  [48, 26, 1, 2, SKIN_SH],
  [46, 29, 4, 1, SKIN_SH],
  // cheeks
  [40, 28, 2, 1, BLUSH],
  [54, 28, 2, 1, BLUSH],
];

const HAIR_PX: readonly Px[] = [
  // crown
  [34, 5, 28, 10, OUT],
  [35, 6, 26, 9, HAIR],
  // middle part
  [47, 6, 1, 5, OUT],
  [39, 8, 7, 1, HAIR_SHEEN],
  [50, 8, 7, 1, HAIR_SHEEN],
  // hairline sweeping down from the part
  [37, 15, 6, 2, HAIR],
  [53, 15, 6, 2, HAIR],
  [37, 17, 3, 1, HAIR],
  [56, 17, 3, 1, HAIR],
  // long curtains framing the face
  [33, 8, 5, 36, HAIR],
  [58, 8, 5, 36, HAIR],
  [37, 18, 2, 22, HAIR],
  [57, 18, 2, 22, HAIR],
  // draping over the shoulders, tapering at the ends
  [32, 44, 7, 14, HAIR],
  [33, 58, 5, 3, HAIR],
  [57, 44, 7, 14, HAIR],
  [58, 58, 5, 3, HAIR],
  // sheen strands
  [34, 12, 1, 20, HAIR_SHEEN],
  [61, 12, 1, 20, HAIR_SHEEN],
  [35, 46, 1, 10, HAIR_SHEEN],
  [60, 46, 1, 10, HAIR_SHEEN],
];

// Relaxed flat brows sitting low over the eyes.
const BROW_L: readonly Px[] = [[40, 20, 5, 1, HAIR]];
const BROW_R: readonly Px[] = [[51, 20, 5, 1, HAIR]];

// Bright eyes with a lash line.
const EYES: readonly Px[] = [
  [40, 22, 5, 1, OUT],
  [51, 22, 5, 1, OUT],
  [40, 23, 5, 3, EYE_WHITE],
  [51, 23, 5, 3, EYE_WHITE],
  [40, 26, 5, 1, SKIN_SH],
  [51, 26, 5, 1, SKIN_SH],
];
const PUPILS: readonly Px[] = [
  [42, 24, 2, 2, OUT],
  [53, 24, 2, 2, OUT],
];

// Eyelids blink via CSS scaleY (hidden at scaleY(0) by default).
const EYELIDS: readonly Px[] = [
  [40, 22, 5, 5, SKIN],
  [51, 22, 5, 5, SKIN],
];

// Resting mouth: a warm toothy smile, curved up at the corners.
const MOUTH_REST: readonly Px[] = [
  [43, 31, 1, 1, OUT], // raised corners
  [52, 31, 1, 1, OUT],
  [44, 32, 8, 1, OUT], // upper lip line
  [44, 33, 8, 1, TEETH],
  [44, 34, 1, 1, OUT], // rounded bottom corners
  [51, 34, 1, 1, OUT],
  [45, 34, 6, 1, TEETH],
  [45, 35, 6, 1, OUT],
  [46, 36, 4, 1, LIP],
];

// Speaking frames cover the rest smile with skin, then draw an open mouth.
const MOUTH_PATCH: Px = [40, 30, 17, 8, SKIN];
const MOUTH_1: readonly Px[] = [
  MOUTH_PATCH,
  [44, 32, 8, 3, OUT],
  [45, 33, 6, 1, MOUTH_IN],
];
const MOUTH_2: readonly Px[] = [
  MOUTH_PATCH,
  [43, 31, 10, 6, OUT],
  [44, 32, 8, 1, TEETH],
  [44, 33, 8, 2, MOUTH_IN],
  [44, 35, 8, 1, LIP],
];

const FX_HEARTS: readonly Px[] = [
  [65, 7, 2, 2, HEART],
  [68, 7, 2, 2, HEART],
  [65, 9, 5, 2, HEART],
  [66, 11, 3, 1, HEART],
  [67, 12, 1, 1, HEART],
  [26, 24, 2, 2, HEART],
  [29, 24, 2, 2, HEART],
  [26, 26, 5, 2, HEART],
  [27, 28, 3, 1, HEART],
  [28, 29, 1, 1, HEART],
];

const FX_SPARKS: readonly Px[] = [
  [30, 8, 1, 3, TRIM],
  [29, 9, 3, 1, TRIM],
  [67, 16, 1, 3, TRIM],
  [66, 17, 3, 1, TRIM],
  [23, 36, 1, 3, TRIM],
  [22, 37, 3, 1, TRIM],
  [72, 30, 1, 3, TRIM],
  [71, 31, 3, 1, TRIM],
];

const VIEWBOX = {
  seated: '0 0 96 112',
  portrait: '16 4 64 64',
} as const;

export default function DanaSprite(props: OpponentSpriteProps): JSX.Element {
  const { mood, variant, size, gaze } = props;
  const width = size ?? 220;
  const viewBox = VIEWBOX[variant];
  const height =
    variant === 'portrait' ? width : Math.round((width * 112) / 96);

  return (
    <svg
      className="px-sprite px-dana"
      viewBox={viewBox}
      width={width}
      height={height}
      shapeRendering="crispEdges"
      data-mood={mood}
      data-gaze={gaze ?? 'player'}
      aria-hidden="true"
    >
      <g className="dana-shadow" opacity={0.3}>
        {px([[27, 44, 42, 54, SHADOW]])}
      </g>
      {variant === 'seated' && <g className="dana-chair">{px(CHAIR_PX)}</g>}
      <g className="dana-torso">
        {px(TORSO)}
        {px(ARM_L)}
        {px(ARM_R)}
        <g className="dana-head">
          {px(FACE)}
          {px(HAIR_PX)}
          <g className="dana-browL">{px(BROW_L)}</g>
          <g className="dana-browR">{px(BROW_R)}</g>
          {px(EYES)}
          {px(PUPILS)}
          <g className="dana-eyelids">{px(EYELIDS)}</g>
          <g className="dana-mouth">
            <g className="dana-mouth-0">{px(MOUTH_REST)}</g>
            <g className="dana-mouth-1">{px(MOUTH_1)}</g>
            <g className="dana-mouth-2">{px(MOUTH_2)}</g>
            <g className="dana-mouth-smile" />
          </g>
        </g>
      </g>
      <g className="dana-hands">{px(HANDS)}</g>
      <g className="dana-table">{px(TABLE_PX)}</g>
      <g className="dana-cards">{px(CARDS)}</g>
      <g className="dana-chips">{px(CHIPS)}</g>
      <g className="dana-fx">
        <g className="dana-fx-hearts">{px(FX_HEARTS)}</g>
        <g className="dana-fx-sparks">{px(FX_SPARKS)}</g>
      </g>
    </svg>
  );
}
