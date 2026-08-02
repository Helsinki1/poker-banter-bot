import type { OpponentId } from '../game/types';

export interface CharacterInfo {
  id: OpponentId;
  name: string;
  /** Short label for compact spots like the leaderboard's opponent column. */
  shortName: string;
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
    id: 'dana',
    name: 'Dana Schafer Smith',
    shortName: 'Dana',
    tagline: 'The warmest smile at the table — right up until she calls you down.',
    pokerStyle: 'Patient & honest — friendly chat, sensible bets, no theatrics.',
    difficulty: 1,
    difficultyLabel: 'Welcoming',
    motif: 'floating hearts',
    introLine: "Hi! Come sit — I saved you the good seat.",
    accent: '#6fc2b4',
  },
  {
    id: 'lebron',
    name: 'The King of Courts',
    shortName: 'Lebron',
    tagline: 'Plays every pot like the fourth quarter.',
    pokerStyle: 'Assertive & pressure-oriented — big raises, keeps momentum.',
    difficulty: 3,
    difficultyLabel: 'Relentless',
    motif: 'gold stripe',
    introLine: "Pull up a seat. I play to win — let's go.",
    accent: '#c9a55a',
  },
  {
    id: 'trump',
    name: 'The Dealmaker',
    shortName: 'Trump',
    tagline: 'Every pot is a deal — and he never loses a deal. Just ask him.',
    pokerStyle: 'Bold & bombastic — huge bets, huge bluffs, never backs down.',
    difficulty: 3,
    difficultyLabel: 'Relentless bravado',
    motif: 'gold trim',
    introLine: 'Sit down. This is going to be a tremendous game — for me.',
    accent: '#c9963c',
  },
];

export const CHARACTER_MAP: Record<OpponentId, CharacterInfo> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
) as Record<OpponentId, CharacterInfo>;
