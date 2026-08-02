// Poker-personality layer. Each persona is a set of tendencies applied on
// top of the same equity-aware core in ai.ts — the classic player-typing
// axes (VPIP/PFR-style looseness, aggression factor, bluff frequency,
// stickiness) plus explicit shove/hero-call appetites. Personas change HOW
// the opponent plays, never WHAT it can see or submit.
//
// The active persona follows the voice the user picked in the Voice Dock
// (wired one-way from App.tsx). Nothing in the conversation layer can reach
// the poker engine through this — it is a flavor knob, not an action path.

export type PersonaId = 'normal' | 'lebron' | 'trump';

export interface PokerPersona {
  id: PersonaId;
  label: string;
  /** 0..1 — how often to take the aggressive line with playable hands. */
  aggression: number;
  /** 0..1 — bluff frequency with weak hands. */
  bluff: number;
  /** Typical bet sizing as a fraction of pot. */
  sizing: number;
  /** Extra random spread applied to sizing (0 = always the same size). */
  sizingJitter: number;
  /** 0..1 — willingness to continue with marginal hands facing bets. */
  sticky: number;
  /** 0..1 — base appetite for open-shoving / raise-shoving. */
  shove: number;
  /** Hand strength above which shoving becomes a standard value line. */
  shoveStrength: number;
  /** 0..1 — willingness to call all-ins light (never folds every shove). */
  heroCall: number;
  /** 0..1 — decision noise. High = erratic/silly, low = disciplined. */
  chaos: number;
  /** Ivey-style: read the player's in-hand tendencies and adjust. */
  adapt: boolean;
}

export const POKER_PERSONAS: Record<PersonaId, PokerPersona> = {
  // Solid TAG baseline: disciplined, value-heavy, still shoves its monsters.
  normal: {
    id: 'normal', label: 'Solid',
    aggression: 0.52, bluff: 0.18, sizing: 0.6, sizingJitter: 0.25,
    sticky: 0.5, shove: 0.2, shoveStrength: 0.78, heroCall: 0.35,
    chaos: 0.1, adapt: false,
  },
  // Phil Ivey mold: relentless calculated pressure, adapts to the player,
  // low noise, comfortable getting stacks in with an edge.
  lebron: {
    id: 'lebron', label: 'Ivey-like',
    aggression: 0.72, bluff: 0.27, sizing: 0.78, sizingJitter: 0.3,
    sticky: 0.55, shove: 0.3, shoveStrength: 0.72, heroCall: 0.48,
    chaos: 0.06, adapt: true,
  },
  // Bold LAG/maniac lean: big sizing, frequent shoves, never backs down
  // from an all-in without a fight.
  trump: {
    id: 'trump', label: 'Bold',
    aggression: 0.85, bluff: 0.36, sizing: 1.0, sizingJitter: 0.5,
    sticky: 0.68, shove: 0.48, shoveStrength: 0.6, heroCall: 0.7,
    chaos: 0.18, adapt: false,
  },
};

function initialPersona(): PersonaId {
  try {
    const saved = localStorage.getItem('npc-voice');
    if (saved === 'normal' || saved === 'lebron' || saved === 'trump') return saved;
  } catch { /* SSR / private mode */ }
  return 'normal';
}

let activePersonaId: PersonaId = initialPersona();

/** One-way flavor wiring from the UI's voice choice; see module comment. */
export function setActivePokerPersona(id: PersonaId): void {
  activePersonaId = id;
}

export function getActivePokerPersona(): PokerPersona {
  return POKER_PERSONAS[activePersonaId];
}
