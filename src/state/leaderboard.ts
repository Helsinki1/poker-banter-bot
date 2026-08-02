import {
  insertEntry, parseCsv, serializeCsv, type LeaderboardEntry,
} from './leaderboardCore';

export type { LeaderboardEntry } from './leaderboardCore';

// Leaderboard client. The scores live in leaderboard.csv on disk, served by
// a tiny middleware in vite.config.ts (GET/POST /api/leaderboard). When the
// endpoint is unavailable (e.g. a purely static build), we degrade to
// localStorage so the arcade loop still works per-browser.

const STORAGE_KEY = 'poker-leaderboard-csv';

function loadLocal(): LeaderboardEntry[] {
  try {
    return parseCsv(localStorage.getItem(STORAGE_KEY) ?? '');
  } catch {
    return []; // SSR / private mode
  }
}

function saveLocal(list: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeCsv(list));
  } catch { /* private mode */ }
}

export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) throw new Error(`GET /api/leaderboard ${res.status}`);
    const list = parseCsv(await res.text());
    saveLocal(list); // keep the local mirror fresh
    return list;
  } catch {
    return loadLocal();
  }
}

export async function addLeaderboardEntry(
  entry: Omit<LeaderboardEntry, 'at'>,
): Promise<LeaderboardEntry[]> {
  const full: LeaderboardEntry = { ...entry, at: Date.now() };
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(full),
    });
    if (!res.ok) throw new Error(`POST /api/leaderboard ${res.status}`);
    const list = parseCsv(await res.text());
    saveLocal(list);
    return list;
  } catch {
    const list = insertEntry(loadLocal(), full);
    saveLocal(list);
    return list;
  }
}
