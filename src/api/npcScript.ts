import type { OpponentId } from '../game/types';
import type { PublicGameSnapshot, VoiceProfile } from './conversationClient';

// Character dialogue generation for the local mock conversation backend.
// Fictional personalities inspired by public figures — the NPC never claims
// to be the real person and never uses attributed quotations.

export const VOICE_PROFILES: Record<OpponentId, VoiceProfile> = {
  einstein: { pitch: 1.25, rate: 0.92, voiceHint: ['Daniel', 'Fred', 'Google UK English Male'] },
  lebron: { pitch: 0.75, rate: 1.0, voiceHint: ['Aaron', 'Alex', 'Google US English'] },
  negreanu: { pitch: 1.05, rate: 1.12, voiceHint: ['Samantha', 'Tom', 'Google US English'] },
};

export interface HandSummary {
  handNumber: number;
  winner: 'player' | 'opponent' | 'split';
  potWon: number;
  reason: 'showdown' | 'fold';
  headline: string;
}

/** Bounded conversational memory — never an unbounded transcript. */
export interface ConversationMemory {
  /** Last N verbatim dialogue turns. */
  turns: { speaker: 'player' | 'npc'; text: string }[];
  /** Compact summaries of completed hands. */
  handSummaries: HandSummary[];
  playerAggressiveActions: number;
  playerPassiveActions: number;
  biggestPotSeen: number;
  playerTauntCount: number;
}

export const MAX_TURNS = 10;
export const MAX_HAND_SUMMARIES = 6;

export function emptyMemory(): ConversationMemory {
  return {
    turns: [],
    handSummaries: [],
    playerAggressiveActions: 0,
    playerPassiveActions: 0,
    biggestPotSeen: 0,
    playerTauntCount: 0,
  };
}

export function rememberTurn(m: ConversationMemory, speaker: 'player' | 'npc', text: string): void {
  m.turns.push({ speaker, text });
  while (m.turns.length > MAX_TURNS) m.turns.shift();
}

export function rememberHand(m: ConversationMemory, summary: HandSummary): void {
  m.handSummaries.push(summary);
  while (m.handSummaries.length > MAX_HAND_SUMMARIES) m.handSummaries.shift();
}

export type NpcTrigger =
  | { kind: 'greeting' }
  | { kind: 'player-utterance'; text: string }
  | { kind: 'street-dealt'; street: string }
  | { kind: 'player-action'; action: string; amount?: number }
  | { kind: 'hand-result'; winner: 'player' | 'opponent' | 'split'; resultText: string }
  | { kind: 'your-turn' }
  | { kind: 'fallback' };

type Lines = string[];
const pick = (lines: Lines, rng: () => number): string => lines[Math.floor(rng() * lines.length)] ?? lines[0];

interface CharacterScript {
  greeting: Lines;
  streetComment: (street: string, snap: PublicGameSnapshot) => Lines;
  playerAggro: Lines;
  playerPassive: Lines;
  playerFolded: Lines;
  win: Lines;
  loss: Lines;
  split: Lines;
  yourTurn: Lines;
  bluffAccusation: Lines;
  compliment: Lines;
  luckTalk: Lines;
  whatDoIHave: Lines;
  actionWords: Lines; // reaction when the player SAYS "fold/call/raise/check" — talk only, never an action
  potQuestion: (snap: PublicGameSnapshot) => Lines;
  turnQuestion: (snap: PublicGameSnapshot) => Lines;
  lastHand: (m: ConversationMemory) => Lines;
  generic: Lines;
  fallback: Lines;
}

const SCRIPTS: Record<OpponentId, CharacterScript> = {
  einstein: {
    greeting: [
      'Ah, a new experiment begins. Please, sit — the cards are simply probability made visible.',
      'Welcome. Every hand is a hypothesis; let us see which of us tests theirs better.',
    ],
    streetComment: (street, snap) => [
      `The ${street} changes our little probability space, does it not?`,
      `Interesting. With ${snap.communityCards.length} cards showing, the uncertainty narrows.`,
      `Each card is new evidence. I do enjoy evidence.`,
    ],
    playerAggro: [
      'A bold wager. Bold hypotheses are how we learn — usually at some cost.',
      'Aggression as a variable. I shall have to account for it.',
      'You bet like someone testing whether I am paying attention. I am.',
    ],
    playerPassive: [
      'Caution. Sensible, though caution reveals information too.',
      'A quiet move. Quiet data is still data.',
    ],
    playerFolded: [
      'A retreat can be the most rational move on the table.',
      'You preserved your chips. Preservation is underrated.',
    ],
    win: [
      'The hypothesis held! Forgive my smile — confirmation is a rare pleasure.',
      'The numbers were kind to me that time.',
    ],
    loss: [
      'Hm. The universe enjoys correcting me. Well played.',
      'An unexpected result. Those are the instructive ones.',
    ],
    split: ['A perfectly symmetric outcome. How elegant.', 'We split it — equilibrium, of a sort.'],
    yourTurn: ['The decision is yours. Take your time — I am watching the variables.', 'Your move. What will the data show?'],
    bluffAccusation: [
      'Bluffing? I merely present incomplete information with confidence.',
      'If you are certain I am bluffing, the bet button is right there. Certainty deserves testing.',
    ],
    compliment: ['You are kind. Luck flatters preparation.', 'Thank you. Though I suspect flattery is a strategy.'],
    luckTalk: [
      'Luck is probability taken personally, my friend.',
      'The deck has no memory — only we do.',
    ],
    whatDoIHave: [
      'What do you have? A superposition of possibilities until you show me.',
      'I could guess, but a good experimentalist never announces results early.',
    ],
    actionWords: [
      'Saying it aloud does nothing here — the buttons are the only instruments that count.',
      'Words are not wagers. If you mean it, press it.',
    ],
    potQuestion: (snap) => [`The pot stands at ${snap.pot} chips. A tidy sum of our disagreements.`],
    turnQuestion: (snap) => [
      snap.activePlayer === 'player' ? 'It is your decision, in fact.' : 'The move is mine — patience.',
    ],
    lastHand: (m) => {
      const last = m.handSummaries[m.handSummaries.length - 1];
      return last
        ? [`Last hand? ${last.headline} — ${last.potWon} chips changed hands.`]
        : ['We have no history yet. Delightful — a blank notebook.'];
    },
    generic: [
      'Curious. Do go on.',
      'An interesting thought. The cards, however, remain indifferent.',
      'I am listening — and calculating, always both.',
    ],
    fallback: ['Forgive me, I was lost in a calculation. You were saying?'],
  },
  lebron: {
    greeting: [
      "Pull up a seat. I play to win, but I'll keep it friendly.",
      "Let's get to work. Momentum starts on hand one.",
    ],
    streetComment: (street, snap) => [
      `That ${street} changes the whole rhythm of this hand.`,
      `Board's talking now. ${snap.pot} in the middle — stay locked in.`,
      'New card, new read. Execution time.',
    ],
    playerAggro: [
      "Big bet. I respect pressure — I've spent a career handling it.",
      "You're pushing the pace. Careful — that's my game.",
      'Okay, you want to make this a battle. I like battles.',
    ],
    playerPassive: [
      "Playing it safe? Sometimes that's the smart possession.",
      "Quiet move. Champions know when to slow it down — we'll see if you do.",
    ],
    playerFolded: ['Smart retreat. Live for the next possession.', "No shame in that. Reset and go again."],
    win: [
      'That’s execution. One hand at a time, that’s how you build a run.',
      'Momentum’s mine now. Feel it shifting?',
    ],
    loss: ['Good hand. I’ll take that hit and come back stronger.', 'You got that one. The rematch starts right now.'],
    split: ['We split it. Even game — next one decides the tone.'],
    yourTurn: ['Your decision. Clock’s in your head, not on the table.', 'On you. Trust your read and commit.'],
    bluffAccusation: [
      'If you think it’s a bluff, make me pay. Talk is free — chips aren’t.',
      'People said I couldn’t close either. Test me.',
    ],
    compliment: ['Appreciate that. Respect makes a good game great.', 'Thanks. Now don’t let it soften you up.'],
    luckTalk: ['Luck rides with the prepared. I put in the reps.', 'Call it luck if you want — I call it positioning.'],
    whatDoIHave: ['You’ll pay to see these. That’s how the game works.', 'My cards? Locked in the vault until showdown.'],
    actionWords: [
      'Saying it doesn’t play it. The buttons are down there when you’re ready to commit.',
      'Words don’t move chips at this table. Click it or keep talking.',
    ],
    potQuestion: (snap) => [`${snap.pot} chips in the middle. Worth fighting for.`],
    turnQuestion: (snap) => [snap.activePlayer === 'player' ? 'That’s on you right now.' : 'My move. Watch and learn.'],
    lastHand: (m) => {
      const last = m.handSummaries[m.handSummaries.length - 1];
      return last ? [`Last hand: ${last.headline}. That’s the momentum story so far.`] : ['No history yet. First punch matters — throw it.'];
    },
    generic: ['I hear you. Stay focused though — this pot matters.', 'Talk’s good. Execution’s better.', 'Keep talking, I’m locked in either way.'],
    fallback: ['Say that again? Crowd noise in my head.'],
  },
  negreanu: {
    greeting: [
      "Heyyy, there we go — a live one! Sit down, let's chat and play some cards.",
      'Welcome, welcome. Fair warning: I talk. A lot. Part of the game.',
    ],
    streetComment: (street, snap) => [
      `Ooh, that ${street} is spicy. Did your eyes just light up a little?`,
      `Interesting texture out there. ${snap.pot} in the pot and a story forming.`,
      'That card helps somebody, and I’m going to figure out who.',
    ],
    playerAggro: [
      'Whoa, big bet! That’s either a monster or a movie. Which one are you making?',
      'Sizing tells a story, my friend, and yours just got interesting.',
      'You came out swinging. I’ve seen that pattern before… twice tonight, actually.',
    ],
    playerPassive: [
      'Just a call? Hmm. Trappy or scared — I’ll figure out which.',
      'Small ball, I see. I invented small ball, you know. In this fictional universe, anyway.',
    ],
    playerFolded: ['Good fold? Bad fold? Only I know, and I’m not telling… okay, I might tell later.', 'You let that one go — probably wise. Probably.'],
    win: [
      'Yes! Read it like a paperback. That’s the stuff!',
      'Scoop! Don’t worry, I’ll give you a rematch — I’m generous like that.',
    ],
    loss: ['Wowww, okay, okay. Nice hand. I set the trap and fell in it myself.', 'You got me. I hate it and I love it.'],
    split: ['Chop it up! Nobody’s hurt, nobody’s happy. Classic.'],
    yourTurn: ['You’re up! And I’m watching everything — the pause, the mouse, all of it.', 'Your action, friend. Take your time; the tells are free.'],
    bluffAccusation: [
      'Me? Bluff? I’m offended. Genuinely. Deeply. …Okay, maybe a little.',
      'You call it a bluff, I call it a narrative. Pay to read the ending.',
    ],
    compliment: ['See, this is why I love this game — good vibes and violence, together.', 'Aw, thanks. Now I almost feel bad about your chips. Almost.'],
    luckTalk: ['Run good, play good — hard to tell apart from the rail, eh?', 'Luck evens out. Reads don’t.'],
    whatDoIHave: [
      'What do I have? Great question. Wrong person to ask, though.',
      'I’ll tell you exactly what I have… at showdown. Poker rules, not mine.',
    ],
    actionWords: [
      'Ha! Nice try — talking it doesn’t play it. Buttons only at this table.',
      'You can say fold all night, friend. The game only listens to clicks.',
    ],
    potQuestion: (snap) => [`Pot’s ${snap.pot}. Big enough to be fun, small enough to grow.`],
    turnQuestion: (snap) => [snap.activePlayer === 'player' ? 'You, my friend. All eyes on you.' : 'Me. And I’m milking the moment.'],
    lastHand: (m) => {
      const last = m.handSummaries[m.handSummaries.length - 1];
      return last ? [`Last hand? ${last.headline}. I remember everything, by the way.`] : ['No hands yet — clean slate, fresh reads.'];
    },
    generic: ['Ha! Good table talk. You’re learning.', 'I hear you. My read on you is updating in real time, just so you know.', 'Keep talking — every word’s a tell.'],
    fallback: ['Wait, hold on, I got distracted counting your chips. What was that?'],
  },
};

const ACTION_WORD_RE = /\b(fold|check|call|raise|bet|all[- ]?in)\b/i;
const BLUFF_RE = /\b(bluff|nervous|lying|liar|fake)\b/i;
const COMPLIMENT_RE = /\b(nice hand|well played|good play|great|impressive|nice)\b/i;
const LUCK_RE = /\b(luck|lucky|rigged|saved you)\b/i;
const WHAT_HAVE_RE = /\b(what do you (think i )?have|your (cards|hand))\b/i;
const POT_RE = /\b(pot|how much)\b/i;
const TURN_RE = /\b(whose turn|my turn|who acts)\b/i;
const LAST_HAND_RE = /\b(last hand|previous hand|earlier|before)\b/i;

/**
 * Generate one short character line. Pure: same inputs + rng → same output.
 * This function RETURNS TEXT ONLY — it has no channel to the poker engine.
 */
export function generateNpcLine(
  opponentId: OpponentId,
  trigger: NpcTrigger,
  memory: ConversationMemory,
  snap: PublicGameSnapshot | null,
  rng: () => number,
): string {
  const script = SCRIPTS[opponentId];
  const s = snap;
  switch (trigger.kind) {
    case 'greeting':
      return pick(script.greeting, rng);
    case 'street-dealt':
      return s ? pick(script.streetComment(trigger.street, s), rng) : pick(script.generic, rng);
    case 'player-action': {
      if (trigger.action === 'fold') return pick(script.playerFolded, rng);
      if (trigger.action === 'raise' || trigger.action === 'bet' || trigger.action === 'all-in') {
        return pick(script.playerAggro, rng);
      }
      return pick(script.playerPassive, rng);
    }
    case 'hand-result':
      if (trigger.winner === 'opponent') return pick(script.win, rng);
      if (trigger.winner === 'player') return pick(script.loss, rng);
      return pick(script.split, rng);
    case 'your-turn':
      return pick(script.yourTurn, rng);
    case 'fallback':
      return pick(script.fallback, rng);
    case 'player-utterance': {
      const text = trigger.text;
      // Spoken poker verbs get a verbal reaction ONLY — never an action.
      if (ACTION_WORD_RE.test(text)) return pick(script.actionWords, rng);
      if (BLUFF_RE.test(text)) return pick(script.bluffAccusation, rng);
      if (WHAT_HAVE_RE.test(text)) return pick(script.whatDoIHave, rng);
      if (LAST_HAND_RE.test(text)) return pick(script.lastHand(memory), rng);
      if (POT_RE.test(text) && s) return pick(script.potQuestion(s), rng);
      if (TURN_RE.test(text) && s) return pick(script.turnQuestion(s), rng);
      if (LUCK_RE.test(text)) return pick(script.luckTalk, rng);
      if (COMPLIMENT_RE.test(text)) return pick(script.compliment, rng);
      // Aggression awareness colors generic replies.
      if (memory.playerAggressiveActions >= 3 && rng() < 0.35) {
        return pick(script.playerAggro, rng);
      }
      return pick(script.generic, rng);
    }
  }
}
