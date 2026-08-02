// Small pixel-art UI icons, 16x16 grid, currentColor where sensible so
// surrounding CSS can tint them.

const OXBLOOD = '#6b1f24';

type IconProps = { size?: number };

function svgProps(size: number | undefined) {
  const s = size ?? 16;
  return {
    viewBox: '0 0 16 16',
    width: s,
    height: s,
    shapeRendering: 'crispEdges',
    'aria-hidden': true,
  } as const;
}

function MicShape() {
  return (
    <>
      {/* capsule */}
      <rect x={6} y={2} width={4} height={6} fill="currentColor" />
      {/* cradle */}
      <rect x={4} y={6} width={1} height={3} fill="currentColor" />
      <rect x={11} y={6} width={1} height={3} fill="currentColor" />
      <rect x={5} y={9} width={6} height={1} fill="currentColor" />
      {/* stem + base */}
      <rect x={7} y={10} width={2} height={2} fill="currentColor" />
      <rect x={5} y={12} width={6} height={1} fill="currentColor" />
    </>
  );
}

export function MicIcon({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <MicShape />
    </svg>
  );
}

export function MicMutedIcon({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <MicShape />
      <rect x={2} y={2} width={2} height={2} fill={OXBLOOD} />
      <rect x={4} y={4} width={2} height={2} fill={OXBLOOD} />
      <rect x={6} y={6} width={2} height={2} fill={OXBLOOD} />
      <rect x={8} y={8} width={2} height={2} fill={OXBLOOD} />
      <rect x={10} y={10} width={2} height={2} fill={OXBLOOD} />
      <rect x={12} y={12} width={2} height={2} fill={OXBLOOD} />
    </svg>
  );
}

function SpeakerShape() {
  return (
    <>
      <rect x={2} y={6} width={2} height={4} fill="currentColor" />
      <rect x={4} y={5} width={2} height={6} fill="currentColor" />
      <rect x={6} y={3} width={2} height={10} fill="currentColor" />
    </>
  );
}

export function SpeakerIcon({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <SpeakerShape />
      <rect x={9} y={6} width={1} height={4} fill="currentColor" />
      <rect x={11} y={4} width={1} height={2} fill="currentColor" />
      <rect x={12} y={6} width={1} height={4} fill="currentColor" />
      <rect x={11} y={10} width={1} height={2} fill="currentColor" />
    </svg>
  );
}

export function SpeakerMutedIcon({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <SpeakerShape />
      <rect x={9} y={5} width={2} height={2} fill={OXBLOOD} />
      <rect x={13} y={5} width={2} height={2} fill={OXBLOOD} />
      <rect x={11} y={7} width={2} height={2} fill={OXBLOOD} />
      <rect x={9} y={9} width={2} height={2} fill={OXBLOOD} />
      <rect x={13} y={9} width={2} height={2} fill={OXBLOOD} />
    </svg>
  );
}

type ConnState = 'off' | 'connecting' | 'connected' | 'error';

const CONN_FILLS: Record<ConnState, [string, string, string]> = {
  off: ['#555555', '#555555', '#555555'],
  connecting: ['#9c7c3c', '#9c7c3c', '#555555'],
  connected: ['#4a7c59', '#4a7c59', '#4a7c59'],
  error: ['#6b1f24', '#6b1f24', '#6b1f24'],
};

export function ConnectionIcon({ state, size }: { state: ConnState; size?: number }) {
  const fills = CONN_FILLS[state];
  return (
    <svg {...svgProps(size)} className="icon-conn" data-state={state}>
      <rect className="conn-bar conn-bar1" x={1} y={11} width={3} height={4} fill={fills[0]} />
      <rect className="conn-bar conn-bar2" x={6} y={7} width={3} height={8} fill={fills[1]} />
      <rect className="conn-bar conn-bar3" x={11} y={3} width={3} height={12} fill={fills[2]} />
    </svg>
  );
}

export function ThinkingDotsIcon({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect className="dot dot1" x={3} y={7} width={2} height={2} fill="currentColor" />
      <rect className="dot dot2" x={7} y={7} width={2} height={2} fill="currentColor" />
      <rect className="dot dot3" x={11} y={7} width={2} height={2} fill="currentColor" />
    </svg>
  );
}

export function SpeakingWavesIcon({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect className="bar bar1" x={3} y={5} width={2} height={6} fill="currentColor" />
      <rect className="bar bar2" x={7} y={3} width={2} height={10} fill="currentColor" />
      <rect className="bar bar3" x={11} y={5} width={2} height={6} fill="currentColor" />
    </svg>
  );
}

export function KeyboardIcon({ size }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      {/* frame */}
      <rect x={1} y={4} width={14} height={1} fill="currentColor" />
      <rect x={1} y={11} width={14} height={1} fill="currentColor" />
      <rect x={1} y={5} width={1} height={6} fill="currentColor" />
      <rect x={14} y={5} width={1} height={6} fill="currentColor" />
      {/* keys */}
      <rect x={3} y={6} width={1} height={1} fill="currentColor" />
      <rect x={5} y={6} width={1} height={1} fill="currentColor" />
      <rect x={7} y={6} width={1} height={1} fill="currentColor" />
      <rect x={9} y={6} width={1} height={1} fill="currentColor" />
      <rect x={11} y={6} width={1} height={1} fill="currentColor" />
      <rect x={3} y={8} width={1} height={1} fill="currentColor" />
      <rect x={12} y={8} width={1} height={1} fill="currentColor" />
      {/* space bar */}
      <rect x={5} y={9} width={6} height={1} fill="currentColor" />
    </svg>
  );
}
