import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Card, GamePhase, GameSnapshot, OpponentId, PokerAction, PokerActionType } from '../game/types';
import { MockPokerGameClient } from '../api/pokerClient';
import { thinkTimeMs } from '../game/ai';
import type { DealerMood, SpriteMood } from '../sprites/types';

// Coordinates the authoritative poker client with presentation pacing.
// Poker state lives in the client/engine; this hook only decides WHEN to ask
// for the next transition so dealer/card animations get time to play.
// Animation never determines outcomes — it only consumes snapshots.

export interface ScenarioStep {
  seat: 'player' | 'opponent';
  type: PokerActionType;
  amount?: number;
}

export interface Scenario {
  seed: number;
  /** Scripted actions (both seats) executed with zero pacing. */
  script?: ScenarioStep[];
  /** Stop auto-advancing when this phase is reached (visual review). */
  freezeAt?: GamePhase;
  /** Rigged decks per hand (deterministic outcomes for demo scenes). */
  riggedDecks?: Card[][];
}

export interface MatchController {
  snapshot: GameSnapshot | null;
  /** Transient opponent reaction to its own last action (betting, folding …). */
  reaction: SpriteMood | null;
  dealerMood: DealerMood;
  frozen: boolean;
  /** Begin the first hand (after the intro beat). */
  begin: () => void;
  submitPlayerAction: (type: PokerActionType, amount?: number) => Promise<void>;
  nextHand: () => void;
  rematch: () => void;
}

function pacingFor(phase: GamePhase, reduced: boolean): number {
  if (reduced) return 250;
  switch (phase) {
    case 'shuffling': return 1400;
    case 'posting-blinds': return 650;
    case 'dealing-hole-cards': return 1700;
    case 'dealing-flop': return 1500;
    case 'dealing-turn': return 1000;
    case 'dealing-river': return 1000;
    case 'showdown': return 1800;
    case 'fold-resolution': return 900;
    case 'pot-award': return 1500;
    case 'resetting-hand': return 900;
    default: return 600;
  }
}

const AUTO_PHASES: GamePhase[] = [
  'shuffling', 'posting-blinds', 'dealing-hole-cards', 'dealing-flop',
  'dealing-turn', 'dealing-river', 'showdown', 'fold-resolution',
  'pot-award', 'resetting-hand',
];

export function dealerMoodFor(snapshot: GameSnapshot | null): DealerMood {
  if (!snapshot) return 'idle';
  switch (snapshot.phase) {
    case 'shuffling': return 'shuffling';
    case 'posting-blinds': return 'cutting';
    case 'dealing-hole-cards':
    case 'dealing-flop':
    case 'dealing-turn':
    case 'dealing-river':
      return 'dealing';
    case 'showdown': return 'idle';
    case 'pot-award': return 'pushing-pot';
    case 'resetting-hand': return 'collecting';
    case 'hand-complete': return 'resetting';
    default:
      if (snapshot.animationCue === 'chips-to-pot') return 'pulling-chips';
      return 'idle';
  }
}

function reactionFor(action: PokerAction): SpriteMood {
  switch (action.type) {
    case 'bet': return 'betting';
    case 'raise': return 'raising';
    case 'all-in': return 'raising';
    case 'call': return 'calling';
    case 'check': return 'checking';
    case 'fold': return 'folding';
  }
}

export function useMatch(opponentId: OpponentId | null, scenario?: Scenario): MatchController {
  const clientRef = useRef<MockPokerGameClient | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [reaction, setReaction] = useState<SpriteMood | null>(null);
  const [frozen, setFrozen] = useState(false);
  const runRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scriptRef = useRef<ScenarioStep[]>([]);
  const scriptedRef = useRef(false);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  // Create the match when an opponent is chosen.
  useEffect(() => {
    runRef.current += 1;
    clearTimer();
    setSnapshot(null);
    setReaction(null);
    setFrozen(false);
    scriptRef.current = scenario?.script ? [...scenario.script] : [];
    scriptedRef.current = Boolean(scenario?.script?.length || scenario?.freezeAt);
    if (!opponentId) { clientRef.current = null; return; }
    const run = runRef.current;
    const client = new MockPokerGameClient({
      seed: scenario?.seed,
      latencyMs: scriptedRef.current ? 0 : 25,
      riggedDecks: scenario?.riggedDecks,
    });
    clientRef.current = client;
    void client.startMatch(opponentId).then((snap) => {
      if (runRef.current === run) setSnapshot(snap);
    });
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentId]);

  const apply = useCallback((snap: GameSnapshot) => {
    setSnapshot(snap);
    if (snap.previousAction && snap.previousAction.seat === 'opponent') {
      setReaction(reactionFor(snap.previousAction));
      setTimeout(() => setReaction(null), 1600);
    }
  }, []);

  // Drive automatic phases + opponent turns.
  useEffect(() => {
    const client = clientRef.current;
    if (!client || !snapshot) return;
    const run = runRef.current;
    const scripted = scriptedRef.current && (scriptRef.current.length > 0 || scenario?.freezeAt !== undefined);

    if (scenario?.freezeAt && snapshot.phase === scenario.freezeAt) {
      setFrozen(true);
      return;
    }
    if (snapshot.matchOver && snapshot.phase === 'hand-complete') return;

    const schedule = (ms: number, fn: () => Promise<GameSnapshot>) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        void fn().then((snap) => { if (runRef.current === run) apply(snap); })
          .catch(() => { /* stale scenario step — ignore */ });
      }, scripted ? 0 : ms);
    };

    if (AUTO_PHASES.includes(snapshot.phase)) {
      schedule(pacingFor(snapshot.phase, reduced), () => client.advancePhase());
      return;
    }
    if (snapshot.activePlayer === 'opponent') {
      const step = scriptRef.current[0];
      if (scripted && step && step.seat === 'opponent') {
        scriptRef.current.shift();
        schedule(0, () => client.submitAction({ type: step.type, amount: step.amount, seat: 'opponent' }));
      } else if (!scripted) {
        schedule(thinkTimeMs(snapshot.opponentId, Math.random()), () => client.requestOpponentAction());
      }
      return;
    }
    if (snapshot.activePlayer === 'player' && scripted) {
      const step = scriptRef.current[0];
      if (step && step.seat === 'player') {
        scriptRef.current.shift();
        schedule(0, () => client.submitAction({ type: step.type, amount: step.amount, seat: 'player' }));
      }
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, apply, reduced]);

  const begin = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    const run = runRef.current;
    void client.startHand().then((snap) => { if (runRef.current === run) apply(snap); });
  }, [apply]);

  const submitPlayerAction = useCallback(async (type: PokerActionType, amount?: number) => {
    const client = clientRef.current;
    if (!client) return;
    const run = runRef.current;
    const snap = await client.submitAction({ type, amount, seat: 'player' });
    if (runRef.current === run) apply(snap);
  }, [apply]);

  const nextHand = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    const run = runRef.current;
    void client.startNextHand().then((snap) => { if (runRef.current === run) apply(snap); });
  }, [apply]);

  const rematch = useCallback(() => {
    const client = clientRef.current;
    if (!client || !opponentId) return;
    const run = runRef.current;
    void client.startMatch(opponentId).then(() => client.startHand())
      .then((snap) => { if (runRef.current === run) apply(snap); });
  }, [apply, opponentId]);

  return {
    snapshot,
    reaction,
    dealerMood: dealerMoodFor(snapshot),
    frozen,
    begin,
    submitPlayerAction,
    nextHand,
    rematch,
  };
}
