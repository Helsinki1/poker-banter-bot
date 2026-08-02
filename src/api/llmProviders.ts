// Interchangeable inference backends for table talk.
//
// Two providers, one wire format: both OpenAI and Sail Research speak the
// OpenAI chat-completions protocol, so the only things that actually vary are
// the base URL, the API key, the model id, and Sail's `completion_window`.
// That makes the provider a runtime choice rather than a build-time one — you
// can switch models mid-match from the dock and hear the difference.
//
// The latency tradeoff is real and worth stating plainly: Sail's own docs say
// it "optimizes for throughput and cost, not single-turn latency". The
// streaming pipeline (chunker → Cartesia context) is identical either way, so
// whichever backend is selected, first audio still starts on the first
// fragment — but a slow first token is still dead air at the table.

/** Sail's service tiers. Only `asap` is viable for live conversation. */
export type CompletionWindow = 'asap' | 'priority' | 'standard' | 'flex';

export interface LlmModelOption {
  /** Stable id used in the picker and persisted to localStorage. */
  id: string;
  label: string;
  provider: 'openai' | 'sail';
  /** Model id as the provider's API expects it. */
  model: string;
  /**
   * Reasoning models spend hidden tokens before the first visible one, which
   * is silence at the table. Flagged so the UI can warn.
   */
  reasoning: boolean;
  /** Rough note shown as the option's title attribute. */
  note?: string;
}

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const SAIL_BASE_URL = 'https://api.sailresearch.com/v1';

/**
 * Selectable backends. Sail model ids are verified against
 * docs.sailresearch.com/models; `GET /v1/models` confirms availability for a
 * given key at runtime (see fetchSailModels).
 */
export const LLM_MODEL_OPTIONS: LlmModelOption[] = [
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini (fastest)',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    reasoning: false,
    note: 'Non-reasoning: first token arrives quickly. Best for live banter.',
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    provider: 'openai',
    model: 'gpt-4.1',
    reasoning: false,
    note: 'Sharper lines than mini, slightly slower first token.',
  },
  {
    id: 'sail-kimi-k2.6',
    label: 'Sail · Kimi K2.6',
    provider: 'sail',
    model: 'moonshotai/Kimi-K2.6',
    reasoning: true,
    note: 'Reasoning model on a throughput-optimised backend — expect a slower first word.',
  },
  {
    id: 'sail-glm-5.2',
    label: 'Sail · GLM-5.2',
    provider: 'sail',
    model: 'zai-org/GLM-5.2-FP8',
    reasoning: true,
    note: 'Reasoning model; 1M context. Slower first word than GPT.',
  },
  {
    id: 'sail-gpt-oss-120b',
    label: 'Sail · gpt-oss-120b',
    provider: 'sail',
    model: 'openai/gpt-oss-120b',
    reasoning: true,
    note: 'Only 5.1B active params — usually the quickest Sail option.',
  },
  {
    id: 'sail-qwen3.6-35b',
    label: 'Sail · Qwen3.6 35B-A3B',
    provider: 'sail',
    model: 'Qwen/Qwen3.6-35B-A3B',
    reasoning: true,
    note: '3B active params — the other comparatively quick Sail option.',
  },
  {
    id: 'sail-gemma-4-31b',
    label: 'Sail · Gemma 4 31B',
    provider: 'sail',
    model: 'google/gemma-4-31B-it',
    reasoning: true,
  },
  {
    id: 'sail-nemotron-3-super',
    label: 'Sail · Nemotron 3 Super 120B',
    provider: 'sail',
    model: 'nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16',
    reasoning: true,
  },
];

export const DEFAULT_MODEL_ID = 'gpt-4.1-mini';
const STORAGE_KEY = 'llm-model-id';

export function findModel(id: string): LlmModelOption {
  return LLM_MODEL_OPTIONS.find((m) => m.id === id)
    ?? LLM_MODEL_OPTIONS.find((m) => m.id === DEFAULT_MODEL_ID)!;
}

/** Env override wins on first load, then the player's own choice persists. */
export function loadSelectedModelId(): string {
  const envDefault = (import.meta.env.VITE_LLM_MODEL as string | undefined)?.trim();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LLM_MODEL_OPTIONS.some((m) => m.id === saved)) return saved;
  } catch { /* private mode */ }
  if (envDefault && LLM_MODEL_OPTIONS.some((m) => m.id === envDefault)) return envDefault;
  return DEFAULT_MODEL_ID;
}

export function saveSelectedModelId(id: string): void {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
}

function readKey(name: string): string {
  // Never call the network from tests (vitest loads .env, so a real key would
  // otherwise leak into fake-timer runs and hang them).
  if (import.meta.env.MODE === 'test') return '';
  return (import.meta.env[name] as string | undefined)?.trim() ?? '';
}

export function getOpenAiApiKey(): string {
  return readKey('VITE_OPENAI_API_KEY');
}

export function getSailApiKey(): string {
  return readKey('VITE_SAIL_API_KEY');
}

export function apiKeyFor(model: LlmModelOption): string {
  return model.provider === 'sail' ? getSailApiKey() : getOpenAiApiKey();
}

export function baseUrlFor(model: LlmModelOption): string {
  return model.provider === 'sail' ? SAIL_BASE_URL : OPENAI_BASE_URL;
}

/** True when the selected backend has a key configured. */
export function isModelUsable(model: LlmModelOption): boolean {
  return apiKeyFor(model) !== '';
}

/**
 * Confirm which models the key can actually reach. Advisory only — a failure
 * here never blocks generation, since the scripted lines always cover us.
 */
export async function fetchSailModels(): Promise<string[]> {
  const key = getSailApiKey();
  if (!key) return [];
  try {
    const res = await fetch(`${SAIL_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    const body: unknown = await res.json();
    const rows = (body as { data?: { id?: string }[] }).data ?? [];
    return rows.map((r) => r.id ?? '').filter(Boolean);
  } catch {
    return [];
  }
}
