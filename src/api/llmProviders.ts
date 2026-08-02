// Interchangeable inference backends for table talk.
//
// Two providers, one wire format: both OpenAI and Sail Research speak the
// OpenAI chat-completions protocol, so the only things that actually vary are
// the base URL, the API key, the model id, and Sail's `completion_window`.
// That makes the provider a runtime choice rather than a build-time one, you
// can switch models mid-match from the dock and hear the difference.
//
// The latency tradeoff is real and worth stating plainly: Sail's own docs say
// it "optimizes for throughput and cost, not single-turn latency". The
// streaming pipeline (chunker → Cartesia context) is identical either way, so
// whichever backend is selected, first audio still starts on the first
// fragment, but a slow first token is still dead air at the table.

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
  /**
   * Windows this model actually accepts. Sail rejects a mismatch with a 400
   * ("this model supports: flex"), so the request must use a supported tier
   * rather than assuming `asap` is universal. Verified per-model against the
   * live API. Omitted for OpenAI, which has no such concept.
   */
  windows?: CompletionWindow[];
  /**
   * What to pass as `reasoning_effort`. Sail's models are all reasoning models
   * and will happily spend a whole 1024-token budget deliberating and emit no
   * spoken text at all (measured: Kimi burned 1598 reasoning tokens in 49s for
   * one 13-word line). Turning reasoning off takes Kimi from ~26-49s to ~1.4s,
   * which is the difference between usable at a poker table and not. Models
   * that reject `none` name their supported values in the 400; verified live.
   */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  /**
   * Serves an uploaded LoRA adapter on top of `model` instead of the base
   * weights, by sending its name as `metadata.lora`.
   *
   * The name is not baked in — it comes from VITE_SAIL_LORA, so retraining and
   * re-registering an adapter (see training/pokerbench) needs no code change.
   * Two consequences, both verified against the live API: Sail rejects
   * `completion_window: asap` for LoRA requests, so `windows` must exclude it;
   * and a request naming an unknown adapter is a hard 404 rather than a quiet
   * fall back to the base model.
   */
  usesLora?: boolean;
  /** Rough note shown as the option's title attribute. */
  note?: string;
}

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const SAIL_DIRECT_BASE_URL = 'https://api.sailresearch.com/v1';
/**
 * Sail sends no Access-Control-Allow-Origin header, so a direct browser fetch
 * is blocked by CORS. In dev we go through the Vite proxy (see vite.config.ts),
 * which makes the call server-side where CORS does not apply. A production
 * build would need an equivalent proxy of its own.
 *
 * The origin prefix is required, not cosmetic: the OpenAI SDK builds request
 * URLs with `new URL(...)`, which throws `Invalid URL` on a bare path, and
 * `streamBanterLine` catches that, so every line would silently fall back to
 * the scripted script with no network call at all.
 */
export const SAIL_PROXY_BASE_URL = `${
  typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}/sail/v1`;
export const SAIL_BASE_URL = import.meta.env.DEV ? SAIL_PROXY_BASE_URL : SAIL_DIRECT_BASE_URL;

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
    windows: ['asap', 'priority', 'standard', 'flex'],
    reasoningEffort: 'none',
    note: 'Reasoning disabled for speed (~1.4s). Leaving it on costs 26-49s per line.',
  },
  {
    id: 'sail-kimi-k2.6-lora',
    label: 'Sail · Kimi K2.6 + PokerBench LoRA',
    provider: 'sail',
    // The adapter rides on the base model: `model` still names Kimi K2.6, and
    // `metadata.lora` selects the adapter. Kimi is the only base model Sail
    // serves LoRAs for (max rank 32).
    model: 'moonshotai/Kimi-K2.6',
    reasoning: true,
    // `asap` is deliberately absent: Sail answers a LoRA request on that tier
    // with 400 "lora requests cannot use completion_window=asap". resolveWindow
    // therefore picks `priority`, the quickest tier that is actually accepted.
    windows: ['priority', 'standard', 'flex'],
    reasoningEffort: 'none',
    usesLora: true,
    note: 'Post-trained on PokerBench (see training/pokerbench). Needs VITE_SAIL_LORA. '
      + '~8.5s per line: LoRA requests cannot use the fast `asap` tier.',
  },
  {
    id: 'sail-glm-5.2',
    label: 'Sail · GLM-5.2',
    provider: 'sail',
    model: 'zai-org/GLM-5.2-FP8',
    reasoning: true,
    windows: ['asap', 'priority', 'standard', 'flex'],
    reasoningEffort: 'none',
    note: 'Reasoning disabled for speed (~1.0s measured).',
  },
  {
    id: 'sail-gpt-oss-120b',
    label: 'Sail · gpt-oss-120b',
    provider: 'sail',
    model: 'openai/gpt-oss-120b',
    reasoning: true,
    windows: ['asap', 'priority', 'standard', 'flex'],
    // Rejects `none` ("supported: low, medium, high"), verified live.
    reasoningEffort: 'low',
    note: 'Only 5.1B active params, but cannot disable reasoning, slower than Kimi here.',
  },
  {
    id: 'sail-qwen3.6-35b',
    label: 'Sail · Qwen3.6 35B-A3B',
    provider: 'sail',
    model: 'Qwen/Qwen3.6-35B-A3B',
    reasoning: true,
    // Verified against the live API: this model rejects `asap`.
    windows: ['flex'],
    note: '3B active params, the other comparatively quick Sail option.',
  },
  {
    id: 'sail-gemma-4-31b',
    label: 'Sail · Gemma 4 31B',
    provider: 'sail',
    model: 'google/gemma-4-31B-it',
    reasoning: true,
    windows: ['asap', 'priority', 'standard', 'flex'],
    reasoningEffort: 'none',
    note: 'Reasoning disabled, but still ~8.6s measured, too slow for live banter.',
  },
  {
    id: 'sail-nemotron-3-super',
    label: 'Sail · Nemotron 3 Super 120B',
    provider: 'sail',
    model: 'nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16',
    reasoning: true,
    // Verified against the live API: this model rejects `asap`.
    windows: ['flex'],
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

/**
 * Name of the uploaded Sail LoRA to serve, from VITE_SAIL_LORA.
 *
 * Unlike the keys this is readable in tests: it is a name, not a credential,
 * and nothing about reading it touches the network.
 */
export function getSailLoraName(): string {
  return (import.meta.env.VITE_SAIL_LORA as string | undefined)?.trim() ?? '';
}

/**
 * The `metadata` block for a Sail request, or undefined for OpenAI.
 *
 * Sail carries both the service tier and the LoRA selection here. They are
 * built together because they constrain each other — an `asap` tier alongside
 * `lora` is a 400 — and `windows` on the LoRA option is what keeps
 * `resolveWindow` from producing that combination.
 */
export function sailMetadata(
  model: LlmModelOption,
  preferredWindow: CompletionWindow,
): Record<string, string> | undefined {
  if (model.provider !== 'sail') return undefined;
  const metadata: Record<string, string> = {
    completion_window: resolveWindow(model, preferredWindow),
  };
  if (model.usesLora) metadata.lora = getSailLoraName();
  return metadata;
}

export function apiKeyFor(model: LlmModelOption): string {
  return model.provider === 'sail' ? getSailApiKey() : getOpenAiApiKey();
}

export function baseUrlFor(model: LlmModelOption): string {
  return model.provider === 'sail' ? SAIL_BASE_URL : OPENAI_BASE_URL;
}

/**
 * The fastest window this model accepts, preferring `preferred` when allowed.
 * Sending an unsupported tier is a hard 400, so this must be honoured rather
 * than defaulting to `asap` everywhere.
 */
export function resolveWindow(
  model: LlmModelOption,
  preferred: CompletionWindow,
): CompletionWindow {
  const allowed = model.windows;
  if (!allowed || allowed.length === 0) return preferred;
  if (allowed.includes(preferred)) return preferred;
  // Fall back to the quickest tier the model does support.
  const bySpeed: CompletionWindow[] = ['asap', 'priority', 'standard', 'flex'];
  return bySpeed.find((w) => allowed.includes(w)) ?? allowed[0];
}

/** True when the selected backend has everything it needs configured. */
export function isModelUsable(model: LlmModelOption): boolean {
  if (apiKeyFor(model) === '') return false;
  // A LoRA option with no adapter name would be served by the base model — the
  // request succeeds and sounds fine, so nothing would ever reveal that the
  // fine-tune is not actually in play. Treat it as unconfigured instead.
  return !model.usesLora || getSailLoraName() !== '';
}

/** What the player has to set to make this option work. */
export function missingConfigFor(model: LlmModelOption): string {
  if (apiKeyFor(model) === '') {
    return model.provider === 'sail' ? 'VITE_SAIL_API_KEY' : 'VITE_OPENAI_API_KEY';
  }
  if (model.usesLora && getSailLoraName() === '') return 'VITE_SAIL_LORA';
  return '';
}

/**
 * Confirm which models the key can actually reach. Advisory only, a failure
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
