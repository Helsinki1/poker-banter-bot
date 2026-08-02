import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  LLM_MODEL_OPTIONS,
  SAIL_BASE_URL,
  OPENAI_BASE_URL,
  baseUrlFor,
  findModel,
  isModelUsable,
  missingConfigFor,
  resolveWindow,
  sailMetadata,
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

describe('post-trained LoRA backend', () => {
  const LORA_ID = 'sail-kimi-k2.6-lora';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('never asks for asap on a LoRA request', () => {
    // Verified against the live API: Sail answers `asap` + `lora` with
    // 400 "lora requests cannot use completion_window=asap". Since asap is the
    // preferred tier everywhere else, the option itself has to exclude it.
    const lora = findModel(LORA_ID);
    expect(lora.windows).not.toContain('asap');
    expect(resolveWindow(lora, 'asap')).toBe('priority');
  });

  it('sends the configured adapter name as metadata.lora', () => {
    vi.stubEnv('VITE_SAIL_LORA', 'pokerbench-sft-v1');
    expect(sailMetadata(findModel(LORA_ID), 'asap')).toEqual({
      completion_window: 'priority',
      lora: 'pokerbench-sft-v1',
    });
  });

  it('rides on the base model id, since the adapter is selected by metadata', () => {
    // Kimi K2.6 is the only base model Sail serves LoRAs for. The request still
    // names the base model; `metadata.lora` is what swaps in the adapter.
    expect(findModel(LORA_ID).model).toBe(findModel('sail-kimi-k2.6').model);
  });

  it('does not attach lora metadata to the plain Sail models', () => {
    vi.stubEnv('VITE_SAIL_LORA', 'pokerbench-sft-v1');
    // Otherwise picking base Kimi would silently serve the fine-tune.
    expect(sailMetadata(findModel('sail-kimi-k2.6'), 'asap')).toEqual({
      completion_window: 'asap',
    });
  });

  it('sends no metadata at all to OpenAI', () => {
    expect(sailMetadata(findModel('gpt-4.1-mini'), 'asap')).toBeUndefined();
  });

  it('keeps reasoning off, so the tuned model answers instead of deliberating', () => {
    expect(findModel(LORA_ID).reasoningEffort).toBe('none');
  });

  it('treats a missing adapter name as unconfigured, not as a working option', () => {
    // With a key but no VITE_SAIL_LORA, Sail would serve the BASE model: the
    // request succeeds and the banter sounds fine, so nothing would reveal that
    // the fine-tune is not in play. Better to disable the option outright.
    vi.stubEnv('VITE_SAIL_LORA', '');
    vi.stubEnv('VITE_SAIL_API_KEY', 'sk-test');
    vi.stubEnv('MODE', 'development'); // readKey returns '' under MODE=test
    expect(isModelUsable(findModel(LORA_ID))).toBe(false);
    expect(missingConfigFor(findModel(LORA_ID))).toBe('VITE_SAIL_LORA');
    // The base Kimi option is unaffected — it needs no adapter.
    expect(isModelUsable(findModel('sail-kimi-k2.6'))).toBe(true);
  });

  it('reports the key, not the adapter, when the key is what is missing', () => {
    vi.stubEnv('VITE_SAIL_LORA', 'pokerbench-sft-v1');
    vi.stubEnv('VITE_SAIL_API_KEY', '');
    vi.stubEnv('MODE', 'development');
    expect(missingConfigFor(findModel(LORA_ID))).toBe('VITE_SAIL_API_KEY');
  });
});
