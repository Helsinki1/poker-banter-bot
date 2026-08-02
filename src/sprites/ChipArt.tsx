// Original pixel-art poker chips at a slight 2.5D angle. The elliptical
// impression is built from stacked rect rows on integer coordinates.

import type { ReactElement } from 'react';

type Tier = 0 | 1 | 2 | 3;

const CHIP_TONES: Record<Tier, { top: string; side: string; stripe: string; inlay: string }> = {
  0: { top: '#e8d9b0', side: '#c9b98d', stripe: '#1a1714', inlay: '#d3bd8d' },
  1: { top: '#6b1f24', side: '#4c1418', stripe: '#e8d9b0', inlay: '#84292f' },
  2: { top: '#2e4d3a', side: '#20372a', stripe: '#e8d9b0', inlay: '#3d6249' },
  3: { top: '#9c7c3c', side: '#775d2b', stripe: '#1a1714', inlay: '#b4954f' },
};

// One chip drawn at the origin of a 24x16 cell, offset vertically by `dy`.
function chipRects(tier: Tier, dy: number, keyPrefix: string): ReactElement {
  const t = CHIP_TONES[tier];
  return (
    <g key={keyPrefix} transform={`translate(0 ${dy})`}>
      {/* side (bottom half of the rim, drawn first) */}
      <rect x={2} y={8} width={20} height={2} fill={t.side} />
      <rect x={2} y={10} width={20} height={2} fill={t.side} />
      <rect x={4} y={11} width={16} height={2} fill={t.side} />
      <rect x={7} y={12} width={10} height={2} fill={t.side} />
      {/* edge stripes: alternating pixel dashes on the rim */}
      <rect x={4} y={10} width={2} height={2} fill={t.stripe} />
      <rect x={11} y={10} width={2} height={2} fill={t.stripe} />
      <rect x={18} y={10} width={2} height={2} fill={t.stripe} />
      {/* top face ellipse */}
      <rect x={7} y={2} width={10} height={1} fill={t.top} />
      <rect x={4} y={3} width={16} height={1} fill={t.top} />
      <rect x={2} y={4} width={20} height={3} fill={t.top} />
      <rect x={4} y={7} width={16} height={1} fill={t.top} />
      <rect x={7} y={8} width={10} height={1} fill={t.top} />
      {/* top edge dashes */}
      <rect x={8} y={2} width={2} height={1} fill={t.stripe} />
      <rect x={14} y={2} width={2} height={1} fill={t.stripe} />
      {/* center inlay ring */}
      <rect x={9} y={4} width={6} height={3} fill={t.inlay} />
      <rect x={10} y={5} width={4} height={1} fill={t.top} />
    </g>
  );
}

export function Chip({ tier, size }: { tier: Tier; size?: number }) {
  const w = size ?? 24;
  return (
    <svg
      viewBox="0 0 24 16"
      width={w}
      height={(w * 16) / 24}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {chipRects(tier, 0, 'chip')}
    </svg>
  );
}

export function ChipStackArt({
  count,
  tier,
  size,
}: {
  count: number;
  tier: Tier;
  size?: number;
}) {
  const n = Math.min(Math.max(count, 0), 8);
  if (n === 0) return null;
  const w = size ?? 24;
  const vh = 16 + (n - 1) * 3;
  const chips: ReactElement[] = [];
  // Bottom chip first so higher chips paint over it.
  for (let i = 0; i < n; i++) {
    chips.push(chipRects(tier, (n - 1 - i) * 3, `st-${i}`));
  }
  return (
    <svg
      viewBox={`0 0 24 ${vh}`}
      width={w}
      height={(w * vh) / 24}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {chips}
    </svg>
  );
}

export function DealerButtonArt({ size }: { size?: number }) {
  const w = size ?? 20;
  const PARCH = '#e8d9b0';
  const PARCH_SH = '#c9b98d';
  const CHARCOAL = '#1a1714';
  return (
    <svg
      viewBox="0 0 16 12"
      width={w}
      height={(w * 12) / 16}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* side */}
      <rect x={2} y={6} width={12} height={3} fill={PARCH_SH} />
      <rect x={4} y={9} width={8} height={1} fill={PARCH_SH} />
      {/* top disc */}
      <rect x={5} y={1} width={6} height={1} fill={PARCH} />
      <rect x={3} y={2} width={10} height={1} fill={PARCH} />
      <rect x={2} y={3} width={12} height={3} fill={PARCH} />
      <rect x={3} y={6} width={10} height={1} fill={PARCH} />
      <rect x={5} y={7} width={6} height={1} fill={PARCH} />
      {/* blocky pixel D */}
      <rect x={6} y={2} width={2} height={5} fill={CHARCOAL} />
      <rect x={8} y={2} width={2} height={1} fill={CHARCOAL} />
      <rect x={8} y={6} width={2} height={1} fill={CHARCOAL} />
      <rect x={9} y={3} width={1} height={3} fill={CHARCOAL} />
    </svg>
  );
}
