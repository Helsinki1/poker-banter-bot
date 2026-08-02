import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  LLM_MODEL_OPTIONS,
  SAIL_BASE_URL,
  OPENAI_BASE_URL,
  baseUrlFor,
  findModel,
  resolveWindow,
} from './llmProviders';

describe('llm provider registry', () => {
  it('routes each model to its own provider base URL', () => {
    for (const model of LLM_MODEL_OPTIONS) {
      const expected = model.provider === 'sail' ? SAIL_BASE_URL : OPENAI_BASE_URL;
      expect(baseUrlFor(model)).toBe(expected);
    }
  });

  it('gives every provider an absolute base URL', () => {
    // The OpenAI SDK builds request URLs with `new URL(base)`, which throws
    // `Invalid URL` on a bare path like "/sail/v1". streamBanterLine catches
    // that, so a relative proxy URL made every line fall back to the scripted
    // script with no network call at all — invisible except in the browser.
    for (const model of LLM_MODEL_OPTIONS) {
      expect(() => new URL(baseUrlFor(model))).not.toThrow();
    }
  });

  it('falls back to the default rather than crashing on an unknown id', () => {
    // A stale localStorage value from a removed model must not break startup.
    expect(findModel('model-that-was-removed').id).toBe(DEFAULT_MODEL_ID);
  });

  it('defaults to a non-reasoning model so first audio stays fast', () => {
    // Reasoning models emit hidden tokens before the first spoken word, which
    // is dead air. The default must not do that.
    expect(findModel(DEFAULT_MODEL_ID).reasoning).toBe(false);
  });

  it('has unique ids and marks every Sail model as reasoning', () => {
    const ids = LLM_MODEL_OPTIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Per docs.sailresearch.com/models every served model is a reasoning
    // model; if that changes the note/UI warning needs revisiting.
    for (const m of LLM_MODEL_OPTIONS.filter((m) => m.provider === 'sail')) {
      expect(m.reasoning).toBe(true);
    }
  });

  it('never requests a completion window the model rejects', () => {
    // Sail 400s on an unsupported tier ("this model supports: flex"), which
    // would silently drop every line to the scripted fallback.
    for (const m of LLM_MODEL_OPTIONS.filter((m) => m.windows)) {
      expect(m.windows).toContain(resolveWindow(m, 'asap'));
    }
  });

  it('keeps the preferred window when the model allows it', () => {
    expect(resolveWindow(findModel('sail-kimi-k2.6'), 'asap')).toBe('asap');
  });

  it('downgrades to the quickest supported window otherwise', () => {
    // Qwen3.6 and Nemotron only accept `flex` (verified against the live API).
    expect(resolveWindow(findModel('sail-qwen3.6-35b'), 'asap')).toBe('flex');
    expect(resolveWindow(findModel('sail-nemotron-3-super'), 'asap')).toBe('flex');
  });

  it('names Sail models in provider/model form', () => {
    for (const m of LLM_MODEL_OPTIONS.filter((m) => m.provider === 'sail')) {
      expect(m.model).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });
});
