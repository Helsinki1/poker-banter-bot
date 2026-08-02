import type { OpponentId } from '../game/types.ts';

// Pure leaderboard domain logic — no DOM, no fs, no fetch — shared by the
// browser client (src/state/leaderboard.ts) and the Vite dev/preview
// middleware (vite.config.ts) that persists entries to leaderboard.csv.

export interface LeaderboardEntry {
  name: string;
  opponentId: OpponentId;
  score: number;
  /** Epoch ms of the cash-out; ties on score rank the earlier entry first. */
  at: number;
}

/** Displayed and persisted rows are capped to the top 25 performances. */
export const MAX_ENTRIES = 25;

export const CSV_HEADER = 'name,opponentId,score,at';

const OPPONENT_IDS: OpponentId[] = ['einstein', 'lebron', 'trump'];

/** Arcade-style name hygiene: no CSV metacharacters, capped length. */
export function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[",\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
  return cleaned || 'Anonymous';
}

/** Insert an entry keeping the list sorted (score desc, earlier first on ties) and capped. */
export function insertEntry(list: LeaderboardEntry[], entry: LeaderboardEntry): LeaderboardEntry[] {
  return [...list, entry]
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, MAX_ENTRIES);
}

export function serializeCsv(list: LeaderboardEntry[]): string {
  const rows = list.map((e) => `${sanitizeName(e.name)},${e.opponentId},${e.score},${e.at}`);
  return [CSV_HEADER, ...rows].join('\n') + '\n';
}

/** Parse the CSV, silently dropping malformed rows — never throws. */
export function parseCsv(text: string): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (const line of text.split('\n')) {
    const row = line.trim();
    if (!row || row === CSV_HEADER) continue;
    const parts = row.split(',');
    if (parts.length !== 4) continue;
    const [name, opponentId, scoreRaw, atRaw] = parts;
    const score = Number(scoreRaw);
    const at = Number(atRaw);
    if (!OPPONENT_IDS.includes(opponentId as OpponentId)) continue;
    if (!Number.isFinite(score) || score < 0 || !Number.isFinite(at)) continue;
    entries.push({ name: sanitizeName(name), opponentId: opponentId as OpponentId, score, at });
  }
  return entries.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, MAX_ENTRIES);
}

/** Validate an arbitrary JSON payload into an entry (used by the POST endpoint). */
export function coerceEntry(raw: unknown): LeaderboardEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!OPPONENT_IDS.includes(o.opponentId as OpponentId)) return null;
  const score = Number(o.score);
  if (!Number.isFinite(score) || score < 0) return null;
  const at = Number.isFinite(Number(o.at)) && Number(o.at) > 0 ? Number(o.at) : Date.now();
  return {
    name: sanitizeName(String(o.name ?? '')),
    opponentId: o.opponentId as OpponentId,
    score: Math.floor(score),
    at,
  };
}
