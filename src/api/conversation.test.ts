import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockRealtimeConversationClient } from './mockConversationClient';
import type { NpcConversationState, PublicGameSnapshot } from './conversationClient';
import { toPublicSnapshot } from './conversationClient';
import { MockPokerGameClient } from './pokerClient';
import { MAX_HAND_SUMMARIES, MAX_TURNS } from './npcScript';

function baseSnapshot(overrides: Partial<PublicGameSnapshot> = {}): PublicGameSnapshot {
  return {
    matchId: 'm1',
    handId: 'hand-1',
    handNumber: 1,
    opponentId: 'einstein',
    phase: 'flop-player-action',
    street: 'flop',
    communityCards: ['5s', '10d', '3c'],
    pot: 120,
    playerStack: 1940,
    opponentStack: 1940,
    playerCommitted: 0,
    opponentCommitted: 0,
    amountToCall: 0,
    activePlayer: 'player',
    legalPlayerActions: ['check', 'bet'],
    actionLog: [],
    playerIsDeciding: true,
    ...overrides,
  };
}

describe('MockRealtimeConversationClient', () => {
  let client: MockRealtimeConversationClient;
  let states: NpcConversationState[];

  beforeEach(() => {
    vi.useFakeTimers();
    client = new MockRealtimeConversationClient({ seed: 7, latencyScale: 1 });
    states = [];
    client.onNpcStateChange((s) => states.push(s));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function connect() {
    const p = client.connect({ opponentId: 'einstein', snapshot: baseSnapshot() });
    await vi.advanceTimersByTimeAsync(1200);
    await p;
  }

  it('transitions disconnected → connecting → connected and greets', async () => {
    await connect();
    expect(states[0]).toBe('connecting');
    expect(states).toContain('connected');
    const texts: string[] = [];
    client.onNpcTranscript((e) => texts.push(e.text));
    await vi.advanceTimersByTimeAsync(5000);
    expect(texts.length).toBeGreaterThan(0);
    expect(states).toContain('speaking');
  });

  it('streams NPC text incrementally before the final transcript', async () => {
    await connect();
    const events: { text: string; final: boolean }[] = [];
    client.onNpcTranscript((e) => events.push({ text: e.text, final: e.final }));
    await vi.advanceTimersByTimeAsync(6000);
    const finals = events.filter((e) => e.final);
    expect(finals).toHaveLength(1);
    const partials = events.filter((e) => !e.final);
    expect(partials.length).toBeGreaterThan(1);
    // Partials build up to the final text.
    expect(finals[0].text.startsWith(partials[0].text)).toBe(true);
  });

  it('streams incremental player transcripts', async () => {
    await connect();
    await vi.advanceTimersByTimeAsync(6000); // let greeting finish
    const events: { text: string; final: boolean }[] = [];
    client.onPlayerTranscript((e) => events.push(e));
    client.sendPlayerUtterance('you look nervous my friend');
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.length).toBe(5);
    expect(events[events.length - 1].final).toBe(true);
    expect(events[events.length - 1].text).toBe('you look nervous my friend');
  });

  it('interruption cancels the active response and stops its audio', async () => {
    await connect();
    const audio: { last: boolean; text: string }[] = [];
    client.onNpcAudio((e) => { if (e.kind === 'tts') audio.push({ last: e.last, text: e.text }); });
    const transcripts: { final: boolean }[] = [];
    client.onNpcTranscript((e) => transcripts.push(e));
    // Enter speaking on the greeting (step until the response starts)…
    for (let i = 0; i < 30 && client.getState() !== 'speaking'; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(client.getState()).toBe('speaking');
    const before = transcripts.length;
    // …then barge in.
    client.interruptNpc();
    expect(client.getState()).toBe('interrupted');
    // A terminal audio event stops playback.
    expect(audio[audio.length - 1].last).toBe(true);
    // No further transcript deltas from the cancelled response.
    await vi.advanceTimersByTimeAsync(4000);
    const finalsAfter = transcripts.slice(before).filter((t) => t.final);
    expect(finalsAfter).toHaveLength(0);
  });

  it('a new player utterance barges in over the current response', async () => {
    await connect();
    await vi.advanceTimersByTimeAsync(600);
    expect(client.getState()).toBe('speaking');
    client.sendPlayerUtterance('hold on');
    await vi.advanceTimersByTimeAsync(50);
    expect(['interrupted', 'thinking']).toContain(client.getState());
    // Eventually a fresh response arrives.
    await vi.advanceTimersByTimeAsync(6000);
    expect(states.filter((s) => s === 'speaking').length).toBeGreaterThanOrEqual(2);
  });

  it('only one response is active at a time', async () => {
    await connect();
    const finals: string[] = [];
    client.onNpcTranscript((e) => { if (e.final) finals.push(e.responseId ?? ''); });
    client.sendPlayerUtterance('hello');
    client.sendPlayerUtterance('are you bluffing');
    await vi.advanceTimersByTimeAsync(10000);
    // The first utterance's response was cancelled by the second.
    expect(finals.length).toBeLessThanOrEqual(1 + 1); // greeting may complete + one reply
    const speakingCount = states.filter((s) => s === 'speaking').length;
    expect(speakingCount).toBeGreaterThan(0);
  });

  it('cancels responses that are materially outdated after a street change', async () => {
    await connect();
    await vi.advanceTimersByTimeAsync(6000);
    client.sendPlayerUtterance('what do you think of the board');
    await vi.advanceTimersByTimeAsync(700); // response pending/speaking on flop context
    const finals: string[] = [];
    client.onNpcTranscript((e) => { if (e.final) finals.push(e.text); });
    client.updateGameContext(baseSnapshot({ street: 'turn', phase: 'turn-player-action', communityCards: ['5s', '10d', '3c', '12d'] }));
    await vi.advanceTimersByTimeAsync(300);
    expect(client.getState()).not.toBe('speaking');
  });

  it('simulated connection drops reach reconnecting and recover', async () => {
    await connect();
    const errors: { recoverable: boolean }[] = [];
    client.onError((e) => errors.push(e));
    client.simulateConnectionDrop();
    expect(client.getState()).toBe('reconnecting');
    expect(errors[0]?.recoverable).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.getState()).toBe('connected');
  });

  it('keeps memory bounded', async () => {
    await connect();
    for (let i = 0; i < 40; i++) {
      client.sendPlayerUtterance(`table talk line number ${i}`);
      await vi.advanceTimersByTimeAsync(8000);
    }
    for (let i = 1; i <= 12; i++) {
      client.updateGameContext(baseSnapshot({
        handNumber: i,
        handId: `hand-${i}`,
        winner: i % 2 ? 'player' : 'opponent',
        resultText: `Hand ${i} result.`,
      }));
      await vi.advanceTimersByTimeAsync(8000);
    }
    const memory = client.getMemory();
    expect(memory.turns.length).toBeLessThanOrEqual(MAX_TURNS);
    expect(memory.handSummaries.length).toBeLessThanOrEqual(MAX_HAND_SUMMARIES);
  });

  it('remembers recent hands and can reference the last one', async () => {
    await connect();
    await vi.advanceTimersByTimeAsync(6000);
    client.updateGameContext(baseSnapshot({ winner: 'opponent', resultText: 'Opponent wins with Pair of Kings.' }));
    await vi.advanceTimersByTimeAsync(8000);
    const finals: string[] = [];
    client.onNpcTranscript((e) => { if (e.final) finals.push(e.text); });
    client.sendPlayerUtterance('what happened last hand');
    await vi.advanceTimersByTimeAsync(8000);
    expect(finals.some((t) => t.includes('Pair of Kings') || t.toLowerCase().includes('last hand'))).toBe(true);
  });

  it('mic and NPC audio mutes are independent', async () => {
    await connect();
    client.setMicrophoneEnabled(true);
    await vi.advanceTimersByTimeAsync(6000);
    expect(client.getState()).toBe('listening');
    const audio: string[] = [];
    client.onNpcAudio((e) => { if (e.kind === 'tts' && !e.last) audio.push(e.text); });
    client.setNpcAudioEnabled(false);
    client.sendPlayerUtterance('talk to me');
    await vi.advanceTimersByTimeAsync(8000);
    // No audio chunks while NPC audio muted…
    expect(audio).toHaveLength(0);
    // …but mic state is unaffected.
    expect(client.getState()).toBe('listening');
  });
});

describe('public snapshot stripping', () => {
  it('never exposes player hole cards or the deck to the conversation layer', async () => {
    const poker = new MockPokerGameClient({ seed: 5, latencyMs: 0 });
    await poker.startMatch('trump');
    let snap = await poker.startHand();
    for (let i = 0; i < 5 && snap.activePlayer === null; i++) snap = await poker.advancePhase();
    expect(snap.playerCards.length).toBe(2);
    const pub = toPublicSnapshot(snap);
    const json = JSON.stringify(pub);
    expect(json).not.toContain('playerCards');
    expect(json).not.toContain('opponentCards');
    expect(json).not.toContain('deck');
    for (const card of snap.playerCards) {
      expect(json).not.toContain(`"${card.rank}${card.suit}"`);
    }
  });
});
