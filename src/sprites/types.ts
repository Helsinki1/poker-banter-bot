// Shared contract for all pixel-art character sprites.
// Sprites are layered SVG components using shape-rendering="crispEdges"
// on a fixed pixel grid. Animation is driven entirely by the `mood` prop —
// sprites must never own game logic.

export type SpriteMood =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'checking'
  | 'calling'
  | 'betting'
  | 'raising'
  | 'folding'
  | 'winning'
  | 'losing'
  | 'celebrating'
  | 'suspicious'
  | 'amused'
  | 'surprised'
  | 'frustrated'
  | 'confident';

export interface OpponentSpriteProps {
  mood: SpriteMood;
  /** 'seated' = full upper body behind the table; 'portrait' = head/shoulders for picker cards */
  variant: 'seated' | 'portrait';
  /** CSS pixel width the sprite will render at (SVG scales via viewBox) */
  size?: number;
  /** Where the character's eyes look */
  gaze?: 'player' | 'board' | 'away';
}

export type DealerMood =
  | 'idle'
  | 'shuffling'
  | 'cutting'
  | 'dealing'
  | 'burning'
  | 'pulling-chips'
  | 'pushing-pot'
  | 'collecting'
  | 'resetting';

export interface DealerSpriteProps {
  mood: DealerMood;
  size?: number;
}
