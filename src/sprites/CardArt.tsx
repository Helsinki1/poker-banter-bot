// Original pixel-art playing cards. All geometry is <rect>s on integer
// coordinates; rank glyphs and suit pips are drawn from small pixel grids.

import type { ReactElement } from 'react';

const PARCH = '#e8d9b0';
const CHARCOAL = '#1a1714';
const OXBLOOD = '#6b1f24';
const BRASS = '#9c7c3c';

type Suit = 'c' | 'd' | 'h' | 's';

// Blocky pixel rank glyphs on a 3x5 grid (Q is 4 wide, 10 is 5 wide).
// Rank 2..14 where 11=J, 12=Q, 13=K, 14=A.
const GLYPH_A: readonly string[] = ['.#.', '#.#', '###', '#.#', '#.#'];

const RANK_GLYPHS: Record<number, readonly string[]> = {
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '..#', '..#', '..#'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  10: ['#.###', '#.#.#', '#.#.#', '#.#.#', '#.###'],
  11: ['..#', '..#', '..#', '#.#', '###'],
  12: ['####', '#..#', '#..#', '####', '...#'],
  13: ['#.#', '#.#', '##.', '#.#', '#.#'],
  14: GLYPH_A,
};

// Chunky suit pips on a 7x7 grid.
const SUIT_GRIDS: Record<Suit, readonly string[]> = {
  h: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
  d: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
  s: ['...#...', '..###..', '.#####.', '#######', '#######', '...#...', '..###..'],
  c: ['..###..', '..###..', '#######', '#######', '##.#.##', '...#...', '..###..'],
};

function gridRects(
  rows: readonly string[],
  ox: number,
  oy: number,
  s: number,
  fill: string,
  keyPrefix: string,
): ReactElement[] {
  const out: ReactElement[] = [];
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      if (row[rx] === '#') {
        out.push(
          <rect
            key={`${keyPrefix}-${rx}-${ry}`}
            x={ox + rx * s}
            y={oy + ry * s}
            width={s}
            height={s}
            fill={fill}
          />,
        );
      }
    }
  });
  return out;
}

export function CardFace({
  rank,
  suit,
  width,
}: {
  rank: number;
  suit: Suit;
  width?: number;
}) {
  const w = width ?? 44;
  const color = suit === 'h' || suit === 'd' ? OXBLOOD : CHARCOAL;
  const glyph = RANK_GLYPHS[rank] ?? GLYPH_A;
  const pip = SUIT_GRIDS[suit];
  // Single UPRIGHT corner index only. The traditional second, 180°-rotated
  // index is a misread trap in pixel art (a rotated 6 is exactly a 9, a
  // rotated Q is unreadable), and these cards are never viewed upside down.
  const glyphCols = glyph[0].length;
  return (
    <svg
      viewBox="0 0 40 56"
      width={w}
      height={(w * 56) / 40}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x={0} y={0} width={40} height={56} fill={CHARCOAL} />
      <rect x={1} y={1} width={38} height={54} fill={PARCH} />
      {/* big rank glyph, top-left */}
      {gridRects(glyph, 3, 3, 3, color, 'rk')}
      {/* suit pip beside the rank so rank+suit read as one unit */}
      {gridRects(pip, Math.min(31, 5 + glyphCols * 3), 6, 1, color, 'sp')}
      {/* large centre pip, lower half */}
      {gridRects(pip, 9, 26, 3, color, 'ctr')}
    </svg>
  );
}

export function CardBack({ width }: { width?: number }) {
  const w = width ?? 44;
  const lattice: ReactElement[] = [];
  for (let y = 6; y <= 49; y += 3) {
    for (let x = 6; x <= 33; x += 3) {
      if ((x + y) % 6 === 0) {
        lattice.push(
          <rect key={`lt-${x}-${y}`} x={x} y={y} width={1} height={1} fill={PARCH} />,
        );
      }
    }
  }
  return (
    <svg
      viewBox="0 0 40 56"
      width={w}
      height={(w * 56) / 40}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x={0} y={0} width={40} height={56} fill={CHARCOAL} />
      <rect x={1} y={1} width={38} height={54} fill={OXBLOOD} />
      {/* parchment inner frame */}
      <rect x={3} y={3} width={34} height={1} fill={PARCH} />
      <rect x={3} y={52} width={34} height={1} fill={PARCH} />
      <rect x={3} y={3} width={1} height={50} fill={PARCH} />
      <rect x={36} y={3} width={1} height={50} fill={PARCH} />
      {/* diamond lattice */}
      {lattice}
      {/* brass corner accents */}
      <rect x={4} y={4} width={2} height={2} fill={BRASS} />
      <rect x={34} y={4} width={2} height={2} fill={BRASS} />
      <rect x={4} y={50} width={2} height={2} fill={BRASS} />
      <rect x={34} y={50} width={2} height={2} fill={BRASS} />
    </svg>
  );
}
