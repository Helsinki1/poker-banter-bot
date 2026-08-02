import { afterEach, describe, expect, it, vi } from 'vitest';

// Exercises streamBanterLine against a stubbed OpenAI-compatible client, so the
// request shape and delta handling are verified without touching the network.

const created = vi.fn();

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: created } };
  },
}));

// The real key getters return '' under MODE=test to keep the suite offline;
// stub them so the request path is actually reached.
vi.mock('./llmProviders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmProviders')>();
  return {
    ...actual,
    getOpenAiApiKey: () => 'test-openai-key',
    getSailApiKey: () => 'test-sail-key',
    apiKeyFor: () => 'test-key',
    isModelUsable: () => true,
  };
});

const { setBanterModel, streamBanterLine } = await import('./llmBanter');
const { findModel } = await import('./llmProviders');

function streamOf(parts: Record<string, unknown>[]) {
  return (async function* () {
    for (const p of parts) yield p;
  })();
}

function textDeltas(...chunks: string[]) {
  return streamOf(chunks.map((c) => ({ choices: [{ delta: { content: c } }] })));
}

async function collect(model: string): Promise<string> {
  setBanterModel(model);
  const memory = { turns: [], handSummaries: [], playerFolds: 0, playerAggressiveActions: 0, playerPassiveActions: 0 };
  let out = '';
  for await (const d of streamBanterLine(
    'The King of Courts', 'lebron', { kind: 'greeting' },
    memory as never, null,
  )) out += d;
  return out;
}

afterEach(() => {
  created.mockReset();
  setBanterModel('gpt-4.1-mini');
});

describe('streamBanterLine backend selection', () => {
  it('sends a Sail model id and completion window to the Sail backend', async () => {
    created.mockReturnValue(textDeltas('Scared money never wins.'));
    await collect('sail-kimi-k2.6');
    const body = created.mock.calls[0][0];
    expect(body.model).toBe('moonshotai/Kimi-K2.6');
    // Only `asap` is conversational; the slower tiers average minutes.
    expect(body.metadata).toEqual({ completion_window: 'asap' });
    expect(body.stream).toBe(true);
  });

  it('does not send Sail-only metadata to OpenAI', async () => {
    created.mockReturnValue(textDeltas('Nice try, rookie.'));
    await collect('gpt-4.1-mini');
    const body = created.mock.calls[0][0];
    expect(body.model).toBe('gpt-4.1-mini');
    expect(body.metadata).toBeUndefined();
  });

  it('never speaks a reasoning model’s chain-of-thought', async () => {
    // Reasoning deltas arrive on a separate field. If they leaked into the
    // yielded text the NPC would say its own deliberation out loud.
    created.mockReturnValue(streamOf([
      { choices: [{ delta: { reasoning_content: 'The player seems passive, so I should' } }] },
      { choices: [{ delta: { reasoning: 'mock their folding pattern.' } }] },
      { choices: [{ delta: { content: 'You fold like laundry.' } }] },
    ]));
    const line = await collect('sail-kimi-k2.6');
    expect(line).toBe('You fold like laundry.');
    expect(line).not.toContain('player seems passive');
    expect(line).not.toContain('mock their folding');
  });

  it('turns reasoning off where the model allows it', async () => {
    // This is the single biggest latency lever on Sail: measured live, Kimi
    // takes 26-49s with reasoning on (and sometimes spends the whole budget
    // thinking and returns NO line at all) versus ~1.4s with it off.
    created.mockReturnValue(textDeltas('Scared money never wins.'));
    await collect('sail-kimi-k2.6');
    expect(created.mock.calls[0][0].reasoning_effort).toBe('none');
  });

  it('does not send reasoning_effort to OpenAI models that have no such setting', async () => {
    created.mockReturnValue(textDeltas('Nice try.'));
    await collect('gpt-4.1-mini');
    expect(created.mock.calls[0][0].reasoning_effort).toBeUndefined();
  });

  it('asks for the effort level a model actually supports', async () => {
    // gpt-oss-120b 400s on `none` ("supported: low, medium, high").
    created.mockReturnValue(textDeltas('Hm.'));
    await collect('sail-gpt-oss-120b');
    expect(created.mock.calls[0][0].reasoning_effort).toBe('low');
  });

  it('gives still-reasoning models room to think without truncating the line', async () => {
    created.mockReturnValue(textDeltas('Hm.'));
    await collect('sail-gpt-oss-120b');
    const reasoningBudget = created.mock.calls[0][0].max_completion_tokens;
    created.mockReset();
    created.mockReturnValue(textDeltas('Hm.'));
    await collect('gpt-4.1-mini');
    const plainBudget = created.mock.calls[0][0].max_completion_tokens;
    // A 60-token cap can be consumed entirely by hidden reasoning, yielding
    // an empty line, so the reasoning budget must be larger.
    expect(reasoningBudget).toBeGreaterThan(plainBudget);
  });

  it('switching models retargets the next request', async () => {
    created.mockReturnValue(textDeltas('One.'));
    await collect('sail-glm-5.2');
    expect(created.mock.calls[0][0].model).toBe(findModel('sail-glm-5.2').model);
    created.mockReset();
    created.mockReturnValue(textDeltas('Two.'));
    await collect('gpt-4.1');
    expect(created.mock.calls[0][0].model).toBe('gpt-4.1');
  });

  it('falls through silently when the backend fails', async () => {
    // The scripted line has to carry the conversation; a throw must not escape.
    created.mockRejectedValue(new Error('502 from provider'));
    await expect(collect('sail-kimi-k2.6')).resolves.toBe('');
  });
});
