import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CartesiaTtsSocket } from './cartesiaTtsSocket';

// A minimal WebSocket stand-in that records the frames we send.
class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor() {
    FakeSocket.last = this;
    // Open on the next microtask so ensureOpen()'s promise can be awaited.
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = 3; this.onclose?.(); }

  frames(): Record<string, unknown>[] {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

function noopEvents() {
  return { onChunk: () => {}, onTimestamps: () => {}, onDone: () => {}, onError: () => {} };
}

describe('CartesiaTtsSocket', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeSocket as unknown as typeof WebSocket);
  });

  it('separates streamed fragments so adjacent words do not fuse', async () => {
    // Cartesia concatenates a context's fragments verbatim. Without a
    // separator, "the" + "clutch" is synthesized as the single word
    // "theclutch" — wrong in the audio AND in the word timestamps that
    // drive subtitles.
    const socket = new CartesiaTtsSocket('key', noopEvents());
    await socket.send('resp-1', 'v1', 'Kobe locked down the', false);
    await socket.send('resp-1', 'v1', 'clutch moments;', false);

    const transcripts = FakeSocket.last.frames().map((f) => f.transcript as string);
    expect(transcripts).toEqual(['Kobe locked down the ', 'clutch moments; ']);
    expect(transcripts.join('')).toContain('the clutch');
  });

  it('does not pad the closing frame, which carries no text', async () => {
    const socket = new CartesiaTtsSocket('key', noopEvents());
    await socket.send('resp-1', 'v1', '', true);
    const frame = FakeSocket.last.frames()[0];
    expect(frame.transcript).toBe('');
    expect(frame.continue).toBe(false);
  });

  it('never sends a frame without a context_id', async () => {
    // Every frame on this endpoint is parsed as a generation request; one
    // lacking a valid context_id is rejected with a 400 that cannot be
    // attributed to a response.
    const socket = new CartesiaTtsSocket('key', noopEvents());
    await socket.send('resp-7', 'v1', 'hello there friend', false);
    socket.cancel('resp-7');
    for (const frame of FakeSocket.last.frames()) {
      expect(frame.context_id).toBe('ctx-resp-7');
      expect(String(frame.context_id)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});
