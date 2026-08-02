import { describe, expect, it } from 'vitest';
import {
  CSV_HEADER, coerceEntry, insertEntry, MAX_ENTRIES, parseCsv, sanitizeName,
  serializeCsv, type LeaderboardEntry,
} from './leaderboardCore';

const e = (name: string, score: number, at: number): LeaderboardEntry =>
  ({ name, opponentId: 'lebron', score, at });

describe('sanitizeName', () => {
  it('strips CSV metacharacters, collapses whitespace and caps length', () => {
    expect(sanitizeName('  Ada,\n"Lovelace"  ')).toBe('Ada Lovelace');
    expect(sanitizeName('x'.repeat(50))).toHaveLength(20);
  });

  it('falls back to Anonymous for empty or all-junk names', () => {
    expect(sanitizeName('')).toBe('Anonymous');
    expect(sanitizeName('",\n"')).toBe('Anonymous');
  });
});

describe('insertEntry', () => {
  it('keeps the list sorted by score desc, earlier entry first on ties', () => {
    let list: LeaderboardEntry[] = [];
    list = insertEntry(list, e('low', 100, 1));
    list = insertEntry(list, e('high', 900, 2));
    list = insertEntry(list, e('tie-late', 100, 5));
    expect(list.map((x) => x.name)).toEqual(['high', 'low', 'tie-late']);
  });

  it('caps the board at the top MAX_ENTRIES scores', () => {
    let list: LeaderboardEntry[] = [];
    for (let i = 0; i < MAX_ENTRIES + 10; i++) list = insertEntry(list, e(`p${i}`, i, i));
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0].score).toBe(MAX_ENTRIES + 9); // best kept
    expect(list.at(-1)!.score).toBe(10); // worst 10 dropped
  });
});

describe('CSV round-trip', () => {
  it('serializes and parses back the same entries', () => {
    const list = [e('Ada', 4000, 10), e('Grace', 2500, 20)];
    expect(parseCsv(serializeCsv(list))).toEqual(list);
  });

  it('ignores the header, blank lines and malformed rows', () => {
    const text = [
      CSV_HEADER,
      '',
      'Ada,lebron,4000,10',
      'not a row',
      'Eve,unknown-opponent,100,5',
      'Mallory,trump,NaN,5',
      'Bob,dana,300,7',
    ].join('\n');
    expect(parseCsv(text).map((x) => x.name)).toEqual(['Ada', 'Bob']);
  });

  it('returns [] for garbage input', () => {
    expect(parseCsv('��!!\n,,,,\n')).toEqual([]);
  });
});

describe('coerceEntry', () => {
  it('accepts a valid payload and floors the score', () => {
    const entry = coerceEntry({ name: 'Ada', opponentId: 'trump', score: 123.9, at: 5 });
    expect(entry).toEqual({ name: 'Ada', opponentId: 'trump', score: 123, at: 5 });
  });

  it('rejects bad opponents and negative scores; defaults a missing timestamp', () => {
    expect(coerceEntry({ name: 'x', opponentId: 'nope', score: 1 })).toBeNull();
    expect(coerceEntry({ name: 'x', opponentId: 'lebron', score: -5 })).toBeNull();
    expect(coerceEntry(null)).toBeNull();
    const entry = coerceEntry({ name: 'x', opponentId: 'lebron', score: 1 });
    expect(entry?.at).toBeGreaterThan(0);
  });
});
