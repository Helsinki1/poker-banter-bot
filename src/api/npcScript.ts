import type { OpponentId } from '../game/types';
import type { PublicGameSnapshot, VoiceProfile } from './conversationClient';

// Character dialogue generation for the local mock conversation backend.
// Fictional personalities inspired by public figures, the NPC never claims
// to be the real person and never uses attributed quotations.

export const VOICE_PROFILES: Record<OpponentId, VoiceProfile> = {
  dana: { pitch: 1.15, rate: 1.0, voiceHint: ['Samantha', 'Victoria', 'Google US English'] },
  lebron: { pitch: 0.75, rate: 1.0, voiceHint: ['Aaron', 'Alex', 'Google US English'] },
  trump: { pitch: 0.88, rate: 0.98, voiceHint: ['Aaron', 'Alex', 'Google US English'] },
};

export interface HandSummary {
  handNumber: number;
  winner: 'player' | 'opponent' | 'split';
  potWon: number;
  reason: 'showdown' | 'fold';
  headline: string;
}

/** Bounded conversational memory, never an unbounded transcript. */
export interface ConversationMemory {
  /** Last N verbatim dialogue turns. */
  turns: { speaker: 'player' | 'npc'; text: string }[];
  /** Compact summaries of completed hands. */
  handSummaries: HandSummary[];
  playerAggressiveActions: number;
  playerPassiveActions: number;
  /** Times the player has folded, prime tilt material. */
  playerFolds: number;
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
    playerFolds: 0,
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

/**
 * Rewrite the UI's player-perspective result text ("Opponent folds, you take
 * the pot.") into the NPC's own first-person voice. Both the LLM prompt and
 * the spoken "last hand" recaps use this, so folds and wins are attributed to
 * the correct side, the NPC must never mock the player for the NPC's own fold.
 */
export function npcPerspectiveResult(
  winner: 'player' | 'opponent' | 'split',
  resultText: string,
): string {
  if (winner === 'split') return resultText; // already symmetric
  const hand = /with (.+)\.$/.exec(resultText)?.[1] ?? 'the better hand';
  const byFold = /fold/i.test(resultText);
  if (winner === 'opponent') {
    return byFold ? 'the player folded and I took the pot' : `I won the showdown with ${hand}`;
  }
  return byFold ? 'I folded and the player took the pot' : `the player won the showdown with ${hand}`;
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
  actionWords: Lines; // reaction when the player SAYS "fold/call/raise/check", talk only, never an action
  potQuestion: (snap: PublicGameSnapshot) => Lines;
  turnQuestion: (snap: PublicGameSnapshot) => Lines;
  lastHand: (m: ConversationMemory) => Lines;
  generic: Lines;
  fallback: Lines;
}

const SCRIPTS: Record<OpponentId, CharacterScript> = {
  dana: {
    greeting: [
      "Hi! I'm so glad you sat down, I was hoping for good company tonight.",
      'Welcome, welcome! Grab a seat, get comfy. I promise this will be fun.',
    ],
    streetComment: (street, snap) => [
      `Ooh, the ${street}! I love this part, anything can happen.`,
      `Look at that board. ${snap.communityCards.length} cards up and I'm still smiling, make of that what you will.`,
      'New card! Isn\'t this exciting?',
    ],
    playerAggro: [
      "Oh my, a big bet! Look at you go. I'll think it over, nicely, of course.",
      "Someone's feeling brave! I love that for you. Let me see...",
      "A raise? You're keeping me on my toes, that's my favorite kind of game.",
    ],
    playerPassive: [
      'A gentle check. See, we can keep this civilized.',
      "Taking it slow? Honestly, same. No rush at this table.",
    ],
    playerFolded: [
      "Aw, folding? That's okay, sometimes the kindest thing you can do is let a hand go.",
      'Good instinct! Saving your chips for a better spot.',
    ],
    win: [
      'Oh! I won that one! Sorry, I mean, thank you. That was fun!',
      "Yay, my pot!",
    ],
    loss: [
      'That was so well played! Take the chips, you earned every one.',
      "You got me! Honestly, I'm a little impressed. Nice hand!",
    ],
    split: ['We split it! Sharing is caring, right?', 'A tie! Honestly, the friendliest possible outcome.'],
    yourTurn: ["Your turn! No pressure, take all the time you need. I'll wait... patiently-ish.", "It's on you! I'll just be here, smiling mysteriously."],
    bluffAccusation: [
      "Me, bluff? I have the most honest face at this table. ...Which is exactly what a bluffer would say, huh?",
      "You think I'm bluffing? There's a very friendly way to find out.",
    ],
    compliment: ["Aw, you're the sweetest! Flattery gets you everywhere, except my chips.", 'Thank you! See, poker CAN be nice.'],
    luckTalk: [
      'Luck? Maybe a little. I prefer to think the deck just likes me.',
      "The cards even out eventually, being nice to the dealer can't hurt though.",
    ],
    whatDoIHave: [
      "My cards? They're lovely, thanks for asking! That's all you get.",
      "Wouldn't you like to know! Stick around for showdown and I'll show you everything.",
    ],
    actionWords: [
      "Saying it out loud doesn't count, the buttons are right down there, whenever you find your nerve.",
      "Talk is lovely, but the game only listens to clicks. Whenever you're ready!",
    ],
    potQuestion: (snap) => [`There's ${snap.pot} chips in the middle. A nice little nest egg, isn't it?`],
    turnQuestion: (snap) => [
      snap.activePlayer === 'player' ? "It's your turn, actually! Take your time." : "It's me! Thinking, thinking...",
    ],
    lastHand: (m) => {
      const last = m.handSummaries[m.handSummaries.length - 1];
      return last
        ? [`Last hand? ${last.headline}, ${last.potWon} chips! Still one of my favorite memories of us.`]
        : ["We haven't even played a hand yet! Clean slate, I love a clean slate."];
    },
    generic: [
      "That's so interesting, tell me more!",
      'I could chat all night. The cards can wait a second.',
      "You're fun to play with, you know that?",
    ],
    fallback: ["Sorry, I got distracted admiring the felt, what were you saying?"],
  },
  lebron: {
    greeting: [
      "Pull up a seat. I play to win, but I'll keep it friendly.",
      "Let's get to work. Momentum starts on hand one.",
    ],
    streetComment: (street, snap) => [
      `That ${street} changes the whole rhythm of this hand.`,
      `Board's talking now. ${snap.pot} in the middle, stay locked in.`,
      'New card, new read. Execution time.',
    ],
    playerAggro: [
      "Big bet. I respect pressure, I've spent a career handling it.",
      "You're pushing the pace. Careful, that's my game.",
      'Okay, you want to make this a battle. I like battles.',
    ],
    playerPassive: [
      "Playing it safe? Sometimes that's the smart possession.",
      "Quiet move. Champions know when to slow it down, we'll see if you do.",
    ],
    playerFolded: ['Smart retreat. Live for the next possession.', "No shame in that. Reset and go again."],
    win: [
      'That’s execution. One hand at a time, that’s how you build a run.',
      'Momentum’s mine now. Feel it shifting?',
    ],
    loss: ['Good hand. I’ll take that hit and come back stronger.', 'You got that one. The rematch starts right now.'],
    split: ['We split it. Even game, next one decides the tone.'],
    yourTurn: ['Your decision. Clock’s in your head, not on the table.', 'On you. Trust your read and commit.'],
    bluffAccusation: [
      'If you think it’s a bluff, make me pay. Talk is free, chips aren’t.',
      'People said I couldn’t close either. Test me.',
    ],
    compliment: ['Appreciate that. Respect makes a good game great.', 'Thanks. Now don’t let it soften you up.'],
    luckTalk: ['Luck rides with the prepared. I put in the reps.', 'Call it luck if you want, I call it positioning.'],
    whatDoIHave: ['You’ll pay to see these. That’s how the game works.', 'My cards? Locked in the vault until showdown.'],
    actionWords: [
      'Saying it doesn’t play it. The buttons are down there when you’re ready to commit.',
      'Words don’t move chips at this table. Click it or keep talking.',
    ],
    potQuestion: (snap) => [`${snap.pot} chips in the middle. Worth fighting for.`],
    turnQuestion: (snap) => [snap.activePlayer === 'player' ? 'That’s on you right now.' : 'My move. Watch and learn.'],
    lastHand: (m) => {
      const last = m.handSummaries[m.handSummaries.length - 1];
      return last ? [`Last hand: ${last.headline}. That’s the momentum story so far.`] : ['No history yet. First punch matters, throw it.'];
    },
    generic: ['I hear you. Stay focused though, this pot matters.', 'Talk’s good. Execution’s better.', 'Keep talking, I’m locked in either way.'],
    fallback: ['Say that again? Crowd noise in my head.'],
  },
  trump: {
    greeting: [
      'Welcome, welcome. You’re playing against the best dealmaker this table has ever seen. Everybody says so.',
      'Sit down, sit down. This is going to be a tremendous game, for me.',
    ],
    streetComment: (street, snap) => [
      `Beautiful ${street}. Maybe the most beautiful ${street} ever dealt. Great for me, not for you.`,
      `${snap.pot} in the pot. Huge pot. And frankly, it’s already mine.`,
      'That card? I called it. I always call it. Ask anybody.',
    ],
    playerAggro: [
      'Big bet, very bold. Bold and, frankly, a disaster. You’ll see.',
      'You’re raising ME? People have tried that. It never ends well for them, believe me.',
      'That’s a desperate bet. Sad! I’ve seen stronger moves from a losing hand.',
    ],
    playerPassive: [
      'Just a call. Low energy. Very low energy play.',
      'A check? Weak. Everybody at this table knows it’s weak.',
    ],
    playerFolded: [
      'Another fold. You fold more than anybody, people are talking about it.',
      'Smart fold. First smart thing you’ve done, frankly.',
    ],
    win: [
      'I win again. Nobody wins like me. Nobody.',
      'That pot? Mine. Like everything else at this table. Tremendous.',
    ],
    loss: ['The deck is rigged, everybody knows it. We’re looking into it, strongly.', 'You got lucky. Luckiest hand in history, probably. Won’t happen twice.'],
    split: ['A tie? I don’t do ties. We’re counting that as a win. My people agree.'],
    yourTurn: ['Your move. Take your time, the longer you think, the worse it gets for you.', 'You’re up. Everybody’s watching. No pressure. Tremendous pressure, actually.'],
    bluffAccusation: [
      'Bluff? I’ve never bluffed in my life. Most honest player in the game, many people say it.',
      'You calling ME a bluffer? That’s fake news, one hundred percent.',
    ],
    compliment: ['Of course it was a great play. I only make great plays.', 'Correct. And it was even better than you think.'],
    luckTalk: ['Luck? I make my own luck. Best luck-maker there is.', 'When I win it’s skill, when you win it’s luck. That’s just math.'],
    whatDoIHave: [
      'The best hand. The strongest hand this dealer has ever dealt. That’s all I’ll say.',
      'My cards are incredible. You’ll find out, the expensive way.',
    ],
    actionWords: [
      'Say it all you want, the buttons do the playing. Buttons only, that’s the deal.',
      'Talking a fold doesn’t make a fold. Believe me, I know deals, click it.',
    ],
    potQuestion: (snap) => [`${snap.pot} in the pot. Huge. And it’s got my name on it, beautiful name.`],
    turnQuestion: (snap) => [snap.activePlayer === 'player' ? 'You. And frankly, everybody’s losing patience.' : 'Mine. The important moves are always mine.'],
    lastHand: (m) => {
      const last = m.handSummaries[m.handSummaries.length - 1];
      return last ? [`Last hand: ${last.headline}. I remember it better than anyone. Photographic memory, the doctors were amazed.`] : ['No hands yet. Historic opportunity for you to lose the first one.'];
    },
    generic: ['That’s nice. Anyway, back to me winning.', 'Interesting. Wrong, but interesting.', 'Great talk. Terrible strategy, great talk.'],
    fallback: ['Nobody’s ever said that to me before. Anyway, I’m still winning.'],
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
 * This function RETURNS TEXT ONLY, it has no channel to the poker engine.
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
      // Spoken poker verbs get a verbal reaction ONLY, never an action.
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
