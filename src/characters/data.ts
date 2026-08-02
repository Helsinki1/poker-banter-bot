import type { OpponentId } from '../game/types';

export interface CharacterInfo {
  id: OpponentId;
  name: string;
  tagline: string;
  pokerStyle: string;
  difficulty: 1 | 2 | 3;
  difficultyLabel: string;
  motif: string;
  introLine: string;
  accent: string; // CSS accent color for frames/motifs
}

export const CHARACTERS: CharacterInfo[] = [
  {
    id: 'einstein',
    name: 'The Professor',
    tagline: 'Treats every bet as a hypothesis begging to be tested.',
    pokerStyle: 'Balanced & deliberate — varied sizing, few wild swings.',
    difficulty: 2,
    difficultyLabel: 'Calculating',
    motif: 'chalk equations',
    introLine: 'Ah — a new experiment. Do sit down.',
    accent: '#8fb6c9',
  },
  {
    id: 'lebron',
    name: 'The King of Courts',
    tagline: 'Plays every pot like the fourth quarter.',
    pokerStyle: 'Assertive & pressure-oriented — big raises, keeps momentum.',
    difficulty: 3,
    difficultyLabel: 'Relentless',
    motif: 'gold stripe',
    introLine: "Pull up a seat. I play to win — let's go.",
    accent: '#c9a55a',
  },
  {
    id: 'negreanu',
    name: 'The Kid Reader',
    tagline: 'Talks the whole time. Reads you the whole time.',
    pokerStyle: 'Reactive & probing — small bets, adapts to your patterns.',
    difficulty: 3,
    difficultyLabel: 'Perceptive',
    motif: 'darting eyes',
    introLine: "Heyyy, a live one! Let's chat — and play, I guess.",
    accent: '#b3707a',
  },
];

export const CHARACTER_MAP: Record<OpponentId, CharacterInfo> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
) as Record<OpponentId, CharacterInfo>;
