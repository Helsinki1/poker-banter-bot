import { describe, expect, it } from 'vitest';
import { TextChunker } from './chunker';

// The chunker is the latency-critical seam: it must emit the first fragment
// after only a few words, and must never cut a word in half.

describe('TextChunker', () => {
  it('emits the first fragment after only a few words', () => {
    const c = new TextChunker();
    expect(c.push('You ')).toEqual([]);
    expect(c.push('fold ')).toEqual([]);
    expect(c.push('there ')).toEqual([]);
    // Four complete words plus a trailing space is enough to ship.
    const out = c.push('every single ');
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toBe('You fold there every');
  });

  it('never splits mid-word', () => {
    const c = new TextChunker();
    const deltas = ['Champ', 'ions', ' close', ' out', ' games', ' like', ' this', ' one', ' always', ' '];
    const fragments: string[] = [];
    for (const d of deltas) fragments.push(...c.push(d));
    const tail = c.flush();
    if (tail) fragments.push(tail);
    const joined = fragments.join(' ').replace(/\s+/g, ' ').trim();
    expect(joined).toBe('Champions close out games like this one always');
    // "Champions" must never appear as a broken pair.
    expect(fragments.some((f) => f.endsWith('Champ'))).toBe(false);
  });

  it('cuts early at punctuation', () => {
    const c = new TextChunker();
    const out = c.push('Scared money, ');
    expect(out).toEqual(['Scared money,']);
  });

  it('reassembles the full text losslessly', () => {
    const c = new TextChunker();
    const text = 'That call was a disaster, frankly. Nobody folds there. Nobody!';
    const fragments: string[] = [];
    // Feed one character at a time — the worst case for a streaming parser.
    for (const ch of text) fragments.push(...c.push(ch));
    const tail = c.flush();
    if (tail) fragments.push(tail);
    expect(fragments.join(' ').replace(/\s+/g, ' ').trim()).toBe(text);
  });

  it('holds a trailing partial word until it completes', () => {
    const c = new TextChunker();
    c.push('one two three fo');
    // "fo" is incomplete: the quota is not met by a partial word.
    const first = c.push('ur ');
    expect(first).toEqual(['one two three four']);
  });

  it('flush returns null when nothing is buffered', () => {
    const c = new TextChunker();
    expect(c.flush()).toBeNull();
  });
});
