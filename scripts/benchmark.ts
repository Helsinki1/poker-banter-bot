/**
 * Heads-up benchmark: our persona decision engine ("gto-engine", the `normal`
 * persona in src/game/ai.ts) vs an LLM playing from a text prompt.
 *
 * Design: duplicate poker. Each unique deal (seed) is played 4 ways —
 * {button: engine, button: LLM} x {hole cards as dealt, hole cards mirrored} —
 * so both card luck and position are balanced within every deal block.
 * Stacks reset to 100bb every hand; the metric is bb/100 with per-deal-block
 * pairing for variance reduction.
 *
 * The LLM sees exactly what a player would: its own hole cards, the board,
 * stacks, pot, price to call, legal actions with sizing bounds, and the hand's
 * action history. Illegal or unparseable outputs become check (else fold) and
 * are counted separately.
 *
 * Usage: node <bundled>.mjs [--deals N] [--concurrency N] [--budget-min N]
 * Env: OPENAI key read from .env (VITE_OPENAI_API_KEY) or OPENAI_API_KEY.
 * Output: CSV of per-hand results + JSON summary, paths printed at the end.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import {
  advancePhase, applyAction, createMatch, isActionPhase, legalActionsFor,
  startHand, type EngineState,
} from '../src/game/engine';
import { decideOpponentAction } from '../src/game/ai';
import { createRng, shuffledDeck } from '../src/game/deck';
import { BIG_BLIND, STARTING_STACK, cardToString, type Card, type LegalAction, type PokerAction, type Seat } from '../src/game/types';

// --- config ------------------------------------------------------------------

const arg = (name: string, dflt: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? Number(process.argv[i + 1]) : dflt;
};
const DEALS = arg('deals', 150);
const CONCURRENCY = arg('concurrency', 8);
const BUDGET_MS = arg('budget-min', 12) * 60_000;
const MODEL = process.env.BENCH_MODEL || 'gpt-5.4-mini';
const OUT_DIR = process.env.BENCH_OUT || resolve(process.cwd(), 'bench-out');

function apiKey(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const env = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    const m = /^VITE_OPENAI_API_KEY=(.+)$/m.exec(env);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  throw new Error('No OpenAI API key found (.env VITE_OPENAI_API_KEY or OPENAI_API_KEY)');
}
const KEY = apiKey();

// --- LLM seat ----------------------------------------------------------------

const SYSTEM_PROMPT = [
  'You are an expert heads-up no-limit hold\'em poker player. You are given the full public state of one hand and must choose exactly one action.',
  'Play to maximize chips won over many hands. Consider position, pot odds, hand strength, and balanced aggression.',
  'Respond with ONLY a JSON object, no other text: {"action": "<one of the legal actions>", "amount": <number, required for bet/raise: the TOTAL amount you are betting/raising TO>}',
].join('\n');

interface LlmStats { calls: number; illegal: number; parseFail: number; httpFail: number; latencyMs: number[] }

function describeState(s: EngineState, seat: Seat, legal: LegalAction[]): string {
  const hole = (seat === 'player' ? s.playerCards : s.opponentCards).map(cardToString).join(' ');
  const board = s.communityCards.map(cardToString).join(' ') || '(none)';
  const mine = seat === 'player' ? s.playerCommitted : s.opponentCommitted;
  const theirs = seat === 'player' ? s.opponentCommitted : s.playerCommitted;
  const myStack = seat === 'player' ? s.playerStack : s.opponentStack;
  const oppStack = seat === 'player' ? s.opponentStack : s.playerStack;
  const toCall = Math.max(0, theirs - mine);
  const history = s.actionLog.map((a) =>
    `${a.seat === seat ? 'you' : 'villain'}: ${a.type}${a.amount ? ` ${a.amount}` : ''}`).join(', ') || '(hand just started)';
  const legalDesc = legal.map((l) => {
    if (l.type === 'call') return `call ${l.amount}`;
    if (l.min !== undefined) return `${l.type} (total amount ${l.min}..${l.max})`;
    return l.type;
  }).join(' | ');
  return [
    `Blinds 10/20. Your position: ${s.buttonSeat === seat ? 'button/small blind (you act first preflop, last postflop)' : 'big blind'}.`,
    `Your hole cards: ${hole}. Board: ${board}. Street: ${s.street}.`,
    `Pot (incl. current bets): ${s.pot + s.playerCommitted + s.opponentCommitted}. Your stack: ${myStack}. Villain stack: ${oppStack}. To call: ${toCall}.`,
    `Action history this hand: ${history}.`,
    `LEGAL ACTIONS: ${legalDesc}.`,
    'Card notation: rank (11=J 12=Q 13=K 14=A) + suit (c d h s). Choose your action now.',
  ].join('\n');
}

async function callLlm(userContent: string, stats: LlmStats): Promise<{ action?: string; amount?: number } | null> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    max_completion_tokens: 2000, // reasoning models spend tokens before the JSON
    reasoning_effort: 'minimal', // keep it cheap/fast; dropped on 400
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body),
      });
      stats.calls++;
      stats.latencyMs.push(Date.now() - t0);
      if (res.status === 400) {
        const text = await res.text();
        if (/reasoning_effort|max_completion_tokens/.test(text) && 'reasoning_effort' in body) {
          delete body.reasoning_effort; // model rejects the knob — retry without
          continue;
        }
        stats.httpFail++;
        return null;
      }
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) { stats.httpFail++; return null; }
      const json = await res.json() as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content ?? '';
      const match = /\{[^{}]*\}/.exec(content);
      if (!match) { stats.parseFail++; return null; }
      try { return JSON.parse(match[0]); } catch { stats.parseFail++; return null; }
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  stats.httpFail++;
  return null;
}

/** Map raw LLM output onto a legal action; illegal picks degrade to check/fold. */
function toLegalAction(raw: { action?: string; amount?: number } | null, legal: LegalAction[], seat: Seat, stats: LlmStats): PokerAction {
  const fallback = (): PokerAction => {
    const check = legal.find((l) => l.type === 'check');
    if (check) return { type: 'check', seat };
    return { type: 'fold', seat };
  };
  if (!raw?.action) { stats.illegal++; return fallback(); }
  const want = String(raw.action).toLowerCase().replace(/_/g, '-');
  const opt = legal.find((l) => l.type === want);
  if (!opt) { stats.illegal++; return fallback(); }
  if (opt.type === 'bet' || opt.type === 'raise') {
    const amt = Number(raw.amount);
    if (!Number.isFinite(amt)) { stats.illegal++; return fallback(); }
    // Clamp into bounds rather than punish near-misses; count clamps as legal.
    const clamped = Math.max(opt.min ?? amt, Math.min(opt.max ?? amt, Math.round(amt)));
    return { type: opt.type, amount: clamped, seat };
  }
  if (opt.type === 'all-in') return { type: 'all-in', amount: opt.min, seat };
  return { type: opt.type, seat };
}

// --- hand harness ------------------------------------------------------------

interface HandResultRow {
  deal: number;
  variant: string; // btnEngine|btnLlm x asDealt|mirrored
  llmDelta: number; // chips won by the LLM seat this hand
  llmDecisions: number;
  actions: Record<string, { engine: number; llm: number }>;
}

/** Build a deck for the deal, optionally swapping the two players' hole cards. */
function deckFor(seed: number, mirror: boolean): Card[] {
  const deck = shuffledDeck(createRng(seed));
  if (mirror) {
    [deck[0], deck[1]] = [deck[1], deck[0]];
    [deck[2], deck[3]] = [deck[3], deck[2]];
  }
  return deck;
}

async function playHand(seed: number, llmIsButton: boolean, mirror: boolean, stats: LlmStats): Promise<HandResultRow> {
  // LLM always occupies the 'player' seat; the engine AI plays 'opponent'.
  let s = createMatch('einstein', seed);
  s = { ...s, buttonSeat: llmIsButton ? 'player' as Seat : 'opponent' as Seat };
  s = startHand(s);
  s = { ...s, deck: deckFor(seed ^ 0x9e3779b9, mirror) };

  const actions: HandResultRow['actions'] = {};
  const bump = (who: 'engine' | 'llm', type: string) => {
    actions[type] ??= { engine: 0, llm: 0 };
    actions[type][who]++;
  };

  let llmDecisions = 0;
  let guard = 0;
  while (s.phase !== 'hand-complete' && guard++ < 200) {
    if (s.toAct === null || !isActionPhase(s.phase)) {
      s = advancePhase(s);
      continue;
    }
    if (s.toAct === 'opponent') {
      const a = decideOpponentAction(s);
      bump('engine', a.type);
      s = applyAction(s, a);
    } else {
      const legal = legalActionsFor(s, 'player');
      const raw = await callLlm(describeState(s, 'player', legal), stats);
      const a = toLegalAction(raw, legal, 'player', stats);
      llmDecisions++;
      bump('llm', a.type);
      s = applyAction(s, a);
    }
  }
  return {
    deal: seed,
    variant: `${llmIsButton ? 'btnLlm' : 'btnEngine'}-${mirror ? 'mirrored' : 'asDealt'}`,
    llmDelta: s.playerStack - STARTING_STACK,
    llmDecisions,
    actions,
  };
}

// --- driver ------------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const started = Date.now();
  const stats: LlmStats = { calls: 0, illegal: 0, parseFail: 0, httpFail: 0, latencyMs: [] };
  const rows: HandResultRow[] = [];

  // Deal blocks; each block = 4 hands. A shared cursor feeds N workers.
  const variants: [boolean, boolean][] = [[false, false], [false, true], [true, false], [true, true]];
  const jobs: { seed: number; llmIsButton: boolean; mirror: boolean }[] = [];
  for (let d = 0; d < DEALS; d++) {
    const seed = (d * 2654435761 + 12345) >>> 0;
    for (const [btn, mir] of variants) jobs.push({ seed, llmIsButton: btn, mirror: mir });
  }

  let cursor = 0;
  let done = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      if (Date.now() - started > BUDGET_MS) return; // wall clock: stop starting new hands
      const job = jobs[cursor++];
      try {
        rows.push(await playHand(job.seed, job.llmIsButton, job.mirror, stats));
      } catch (e) {
        console.error(`hand failed (seed ${job.seed}):`, (e as Error).message);
      }
      done++;
      if (done % 20 === 0) {
        const elapsed = (Date.now() - started) / 1000;
        const bb = rows.reduce((a, r) => a - r.llmDelta, 0) / BIG_BLIND;
        console.log(`${done}/${jobs.length} hands · ${elapsed.toFixed(0)}s · engine ${bb >= 0 ? '+' : ''}${bb.toFixed(0)}bb · llm calls ${stats.calls} (illegal ${stats.illegal})`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // --- outputs ---------------------------------------------------------------
  const csv = ['deal,variant,llm_delta_chips,engine_delta_chips,llm_decisions'];
  for (const r of rows) csv.push(`${r.deal},${r.variant},${r.llmDelta},${-r.llmDelta},${r.llmDecisions}`);
  const csvPath = resolve(OUT_DIR, 'hands.csv');
  writeFileSync(csvPath, csv.join('\n') + '\n');

  const actionTotals: Record<string, { engine: number; llm: number }> = {};
  for (const r of rows) {
    for (const [t, c] of Object.entries(r.actions)) {
      actionTotals[t] ??= { engine: 0, llm: 0 };
      actionTotals[t].engine += c.engine;
      actionTotals[t].llm += c.llm;
    }
  }
  const hands = rows.length;
  const engineChips = rows.reduce((a, r) => a - r.llmDelta, 0);
  const perHandBb = rows.map((r) => -r.llmDelta / BIG_BLIND);
  const mean = engineChips / BIG_BLIND / Math.max(1, hands);
  const sd = Math.sqrt(perHandBb.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, hands - 1));
  const se = sd / Math.sqrt(Math.max(1, hands));
  const lat = stats.latencyMs.sort((a, b) => a - b);
  const summary = {
    model: MODEL,
    hands,
    deals: new Set(rows.map((r) => r.deal)).size,
    engine_bb_per_100: mean * 100,
    ci95_bb_per_100: 1.96 * se * 100,
    engine_chips: engineChips,
    llm: {
      calls: stats.calls,
      illegal_or_fallback: stats.illegal,
      parse_failures: stats.parseFail,
      http_failures: stats.httpFail,
      latency_p50_ms: lat[Math.floor(lat.length * 0.5)] ?? 0,
      latency_p90_ms: lat[Math.floor(lat.length * 0.9)] ?? 0,
    },
    action_totals: actionTotals,
    elapsed_s: (Date.now() - started) / 1000,
  };
  const jsonPath = resolve(OUT_DIR, 'summary.json');
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nwrote ${csvPath}\nwrote ${jsonPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
