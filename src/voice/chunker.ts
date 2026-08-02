// Splits a streaming LLM response into TTS-ready fragments.
//
// The whole latency win rests here: instead of waiting for the model to finish
// a sentence, we ship the first few words the instant they form a clean
// fragment, then send progressively larger ones. Cartesia contexts stitch the
// fragments into one continuous utterance, so prosody survives the splitting.
//
// Fragments always end on a word boundary — never mid-word, which would make
// the synthesizer mispronounce it.

/** Words needed before the very first flush. Small = fastest first audio. */
export const FIRST_FLUSH_WORDS = 4;
/** Words needed for every later flush. Larger = better prosody, no latency cost. */
export const LATER_FLUSH_WORDS = 8;

const BOUNDARY_RE = /[.!?,;:—]/;

export class TextChunker {
  private buffer = '';
  private flushed = 0;

  /**
   * Absorb a delta and return any fragments ready to synthesize.
   * A fragment is emitted when the buffer holds enough words, or reaches
   * punctuation (a natural prosodic seam, worth flushing early).
   */
  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      const fragment = this.takeFragment();
      if (!fragment) break;
      out.push(fragment);
    }
    return out;
  }

  /** Everything still buffered, for the end of the stream. */
  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = '';
    if (rest) this.flushed++;
    return rest || null;
  }

  private takeFragment(): string | null {
    const need = this.flushed === 0 ? FIRST_FLUSH_WORDS : LATER_FLUSH_WORDS;

    // Only split at a boundary we know is complete. A trailing partial word
    // (no whitespace after it) stays buffered until the next delta.
    const lastSpace = this.buffer.search(/\s\S*$/);
    if (lastSpace <= 0) return null;
    const committable = this.buffer.slice(0, lastSpace);

    const words = committable.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;

    // Punctuation inside the committable region is a natural place to cut,
    // even if we are short of the word quota.
    const punct = this.findBoundary(committable);
    if (punct !== -1) {
      const fragment = this.buffer.slice(0, punct + 1).trim();
      if (fragment) {
        this.buffer = this.buffer.slice(punct + 1);
        this.flushed++;
        return fragment;
      }
    }

    if (words.length < need) return null;

    const cut = this.wordBoundaryAfter(words.slice(0, need).join(' ').length);
    const fragment = this.buffer.slice(0, cut).trim();
    if (!fragment) return null;
    this.buffer = this.buffer.slice(cut);
    this.flushed++;
    return fragment;
  }

  /** Index of the first punctuation mark, or -1. */
  private findBoundary(text: string): number {
    const m = BOUNDARY_RE.exec(text);
    return m ? m.index : -1;
  }

  /**
   * Walk forward from `approx` to the next whitespace so the cut lands between
   * words even when the model emitted odd spacing.
   */
  private wordBoundaryAfter(approx: number): number {
    let i = Math.min(approx, this.buffer.length);
    while (i < this.buffer.length && !/\s/.test(this.buffer[i])) i++;
    return i;
  }
}
