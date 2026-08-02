import type { JSX } from 'react';
import type { OpponentSpriteProps } from './types';
import './einstein.css';

// Palette (flat, limited)
const SKIN = '#d9a066';
const SKIN_SH = '#b07a4a';
const HAIR = '#e8e6df';
const HAIR_SH = '#b9b7ae';
const JACKET = '#6d5a3f';
const JACKET_SH = '#4e402c';
const SHIRT = '#cfc4a2';
const SHIRT_SH = '#b9b7ae';
const CARD = '#6b1f24';
const PIP = '#e8d9b0';
const CHALK = '#dfe8ea';
const INK = '#1a1714';
const CHARCOAL = '#211d19';

type Px = readonly [x: number, y: number, w: number, h: number, fill: string];

function px(rects: readonly Px[]): JSX.Element[] {
  return rects.map(([x, y, w, h, fill], i) => (
    <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
  ));
}

const SHADOW: readonly Px[] = [[28, 14, 46, 82, '#17140f']];

const CHAIR: readonly Px[] = [
  [24, 36, 48, 2, INK],
  [24, 38, 48, 5, JACKET_SH],
  [24, 43, 6, 52, JACKET_SH],
  [66, 43, 6, 52, JACKET_SH],
  [24, 43, 1, 52, INK],
  [71, 43, 1, 52, INK],
];

const TORSO: readonly Px[] = [
  // ink silhouette
  [27, 50, 42, 44, INK],
  // neck
  [44, 45, 8, 7, SKIN],
  [44, 45, 8, 2, SKIN_SH],
  // tweed jacket
  [28, 52, 40, 10, JACKET],
  [30, 60, 36, 34, JACKET],
  [60, 56, 6, 38, JACKET_SH],
  [30, 90, 30, 4, JACKET_SH],
  // shirt + collar
  [42, 50, 12, 4, SHIRT],
  [43, 52, 10, 18, SHIRT],
  [51, 52, 2, 18, SHIRT_SH],
  // lapels
  [40, 52, 3, 20, JACKET_SH],
  [53, 52, 3, 20, JACKET_SH],
  [38, 52, 2, 4, JACKET_SH],
  [56, 52, 2, 4, JACKET_SH],
  // buttons
  [47, 74, 2, 2, INK],
  [47, 82, 2, 2, INK],
  // tweed flecks
  [34, 64, 1, 1, JACKET_SH],
  [37, 70, 1, 1, JACKET_SH],
  [33, 78, 1, 1, JACKET_SH],
  [58, 66, 1, 1, JACKET_SH],
  [56, 78, 1, 1, JACKET_SH],
  [36, 86, 1, 1, JACKET_SH],
];

const ARM_L: readonly Px[] = [
  [22, 52, 12, 26, INK],
  [24, 54, 8, 24, JACKET],
  [24, 54, 2, 24, JACKET_SH],
  [25, 66, 6, 8, SKIN_SH], // elbow patch
  [26, 78, 12, 8, JACKET],
  [26, 84, 12, 2, JACKET_SH],
  [34, 84, 5, 4, SHIRT], // cuff
];

const ARM_R: readonly Px[] = [
  [62, 52, 12, 26, INK],
  [64, 54, 8, 24, JACKET],
  [70, 54, 2, 24, JACKET_SH],
  [65, 66, 6, 8, SKIN_SH], // elbow patch
  [58, 78, 12, 8, JACKET],
  [58, 84, 12, 2, JACKET_SH],
  [57, 84, 5, 4, SHIRT], // cuff
];

const HAND_L: readonly Px[] = [
  [35, 86, 9, 7, SKIN],
  [35, 91, 9, 2, SKIN_SH],
  [43, 88, 2, 4, SKIN],
];

const HAND_R: readonly Px[] = [
  [52, 86, 9, 7, SKIN],
  [52, 91, 9, 2, SKIN_SH],
  [51, 88, 2, 4, SKIN],
];

const CARDS: readonly Px[] = [
  // card 1 (oxblood back, cream pips)
  [38, 75, 11, 16, INK],
  [39, 76, 9, 14, CARD],
  [40, 77, 7, 1, PIP],
  [40, 88, 7, 1, PIP],
  [40, 78, 1, 10, PIP],
  [46, 78, 1, 10, PIP],
  [42, 82, 3, 1, PIP],
  [43, 81, 1, 3, PIP],
  // card 2
  [47, 75, 11, 16, INK],
  [48, 76, 9, 14, CARD],
  [49, 77, 7, 1, PIP],
  [49, 88, 7, 1, PIP],
  [49, 78, 1, 10, PIP],
  [55, 78, 1, 10, PIP],
  [51, 82, 3, 1, PIP],
  [52, 81, 1, 3, PIP],
];

const TABLE: readonly Px[] = [
  [0, 94, 96, 2, INK],
  [0, 96, 96, 4, JACKET_SH],
  [0, 100, 96, 12, CHARCOAL],
];

const FACE: readonly Px[] = [
  // ink silhouette
  [32, 14, 32, 34, INK],
  [37, 43, 22, 5, INK],
  [28, 27, 6, 10, INK],
  [62, 27, 6, 10, INK],
  // skin
  [34, 18, 28, 26, SKIN],
  [38, 44, 20, 3, SKIN],
  [58, 20, 4, 24, SKIN_SH],
  [38, 46, 20, 1, SKIN_SH],
  [40, 21, 16, 1, SKIN_SH], // forehead crease
  // ears
  [30, 28, 4, 8, SKIN],
  [62, 28, 4, 8, SKIN],
  [31, 30, 2, 4, SKIN_SH],
  [63, 30, 2, 4, SKIN_SH],
  // nose
  [46, 28, 3, 6, SKIN_SH],
  [45, 33, 6, 2, SKIN_SH],
  [44, 34, 1, 1, INK],
  [51, 34, 1, 1, INK],
  // crow's feet + cheek
  [36, 29, 1, 2, SKIN_SH],
  [59, 29, 1, 2, SKIN_SH],
  [36, 34, 3, 1, SKIN_SH],
];

const HAIR_PX: readonly Px[] = [
  // ink halo
  [30, 6, 36, 12, INK],
  [20, 10, 12, 26, INK],
  [64, 10, 12, 26, INK],
  // main mass
  [32, 8, 32, 10, HAIR],
  // wild tufts
  [26, 6, 8, 6, HAIR],
  [38, 4, 8, 5, HAIR],
  [52, 4, 8, 5, HAIR],
  [62, 6, 8, 6, HAIR],
  [22, 12, 10, 8, HAIR],
  [64, 12, 10, 8, HAIR],
  [20, 18, 8, 8, HAIR],
  [68, 18, 8, 8, HAIR],
  [22, 26, 8, 6, HAIR],
  [66, 26, 8, 6, HAIR],
  [26, 32, 6, 4, HAIR],
  [64, 32, 6, 4, HAIR],
  [18, 14, 4, 4, HAIR],
  [74, 14, 4, 4, HAIR],
  [30, 2, 5, 4, HAIR],
  [61, 2, 5, 4, HAIR],
  [45, 1, 6, 4, HAIR],
  // shading
  [34, 16, 28, 2, HAIR_SH],
  [28, 10, 4, 2, HAIR_SH],
  [40, 8, 6, 2, HAIR_SH],
  [52, 8, 6, 2, HAIR_SH],
  [23, 18, 4, 4, HAIR_SH],
  [69, 18, 4, 4, HAIR_SH],
  [23, 30, 4, 2, HAIR_SH],
  [69, 30, 4, 2, HAIR_SH],
  [66, 14, 4, 2, HAIR_SH],
  [26, 34, 4, 2, HAIR_SH],
];

const BROW_L: readonly Px[] = [
  [37, 23, 8, 3, HAIR],
  [37, 25, 3, 1, HAIR_SH],
];

const BROW_R: readonly Px[] = [
  [51, 23, 8, 3, HAIR],
  [56, 25, 3, 1, HAIR_SH],
];

const EYE_WHITES: readonly Px[] = [
  [37, 26, 9, 7, INK],
  [50, 26, 9, 7, INK],
  [38, 27, 7, 5, CHALK],
  [51, 27, 7, 5, CHALK],
];

const PUPIL_L: readonly Px[] = [[41, 28, 2, 2, INK]];
const PUPIL_R: readonly Px[] = [[54, 28, 2, 2, INK]];

const EYELIDS: readonly Px[] = [
  [38, 27, 7, 5, SKIN],
  [51, 27, 7, 5, SKIN],
];

const MUSTACHE: readonly Px[] = [
  [38, 35, 20, 5, INK],
  [36, 37, 4, 5, INK],
  [56, 37, 4, 5, INK],
  [39, 36, 18, 3, HAIR],
  [37, 38, 6, 4, HAIR],
  [53, 38, 6, 4, HAIR],
  [43, 38, 10, 2, HAIR],
  [43, 39, 10, 1, HAIR_SH],
  [37, 40, 6, 2, HAIR_SH],
  [53, 40, 6, 2, HAIR_SH],
];

const MOUTH_0: readonly Px[] = [[45, 42, 6, 1, INK]];
const MOUTH_1: readonly Px[] = [
  [44, 42, 8, 2, INK],
  [45, 43, 6, 1, CARD],
];
const MOUTH_2: readonly Px[] = [
  [44, 42, 8, 3, INK],
  [45, 43, 6, 2, CARD],
];
const MOUTH_SMILE: readonly Px[] = [
  [43, 42, 10, 1, INK],
  [42, 41, 2, 2, INK],
  [52, 41, 2, 2, INK],
];

const FX_CHALK: readonly Px[] = [
  // pi
  [70, 8, 7, 1, CHALK],
  [71, 9, 1, 4, CHALK],
  [75, 9, 1, 4, CHALK],
  // sigma
  [72, 16, 5, 1, CHALK],
  [72, 17, 1, 1, CHALK],
  [73, 18, 1, 1, CHALK],
  [74, 19, 1, 1, CHALK],
  [73, 20, 1, 1, CHALK],
  [72, 21, 1, 1, CHALK],
  [72, 22, 5, 1, CHALK],
  // radical
  [17, 11, 1, 1, CHALK],
  [18, 12, 1, 1, CHALK],
  [19, 10, 1, 2, CHALK],
  [20, 8, 1, 2, CHALK],
  [21, 7, 5, 1, CHALK],
  // equals
  [18, 17, 5, 1, CHALK],
  [18, 19, 5, 1, CHALK],
];

const FX_SPARKS: readonly Px[] = [
  [27, 3, 1, 3, PIP],
  [26, 4, 3, 1, PIP],
  [69, 1, 1, 3, PIP],
  [68, 2, 3, 1, PIP],
  [77, 26, 1, 3, PIP],
  [76, 27, 3, 1, PIP],
  [20, 27, 1, 3, PIP],
  [19, 28, 3, 1, PIP],
];

const VIEWBOX = {
  seated: '0 0 96 112',
  portrait: '16 4 64 64',
} as const;

export default function EinsteinSprite(props: OpponentSpriteProps): JSX.Element {
  const { mood, variant, size, gaze } = props;
  const width = size ?? 220;
  const viewBox = VIEWBOX[variant];
  const [, , vw, vh] = viewBox.split(' ').map(Number);
  const height = Math.round(width * (vh / vw));

  return (
    <svg
      className="px-sprite px-einstein"
      viewBox={viewBox}
      width={width}
      height={height}
      shapeRendering="crispEdges"
      data-mood={mood}
      data-gaze={gaze ?? 'player'}
      aria-hidden="true"
    >
      <g className="ein-shadow" opacity={0.3}>
        {px(SHADOW)}
      </g>
      <g className="ein-chair">{px(CHAIR)}</g>
      <g className="ein-torso">{px(TORSO)}</g>
      <g className="ein-armL">{px(ARM_L)}</g>
      <g className="ein-armR">{px(ARM_R)}</g>
      <g className="ein-hands">
        <g className="ein-handL">{px(HAND_L)}</g>
        <g className="ein-handR">{px(HAND_R)}</g>
      </g>
      <g className="ein-cards">{px(CARDS)}</g>
      <g className="ein-table">{px(TABLE)}</g>
      <g className="ein-head">
        {px(FACE)}
        <g className="ein-hair">{px(HAIR_PX)}</g>
        <g className="ein-browL">{px(BROW_L)}</g>
        <g className="ein-browR">{px(BROW_R)}</g>
        <g className="ein-eyes">
          {px(EYE_WHITES)}
          <g className="ein-pupils">
            <g className="ein-pupilL">{px(PUPIL_L)}</g>
            <g className="ein-pupilR">{px(PUPIL_R)}</g>
          </g>
        </g>
        <g className="ein-eyelids">{px(EYELIDS)}</g>
        <g className="ein-mustache">{px(MUSTACHE)}</g>
        <g className="ein-mouth">
          <g className="ein-mouth-0">{px(MOUTH_0)}</g>
          <g className="ein-mouth-1">{px(MOUTH_1)}</g>
          <g className="ein-mouth-2">{px(MOUTH_2)}</g>
          <g className="ein-mouth-smile">{px(MOUTH_SMILE)}</g>
        </g>
      </g>
      <g className="ein-fx">
        <g className="ein-fx-chalk">{px(FX_CHALK)}</g>
        <g className="ein-fx-sparks">{px(FX_SPARKS)}</g>
      </g>
    </svg>
  );
}
