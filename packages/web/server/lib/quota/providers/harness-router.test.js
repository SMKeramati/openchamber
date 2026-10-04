import { describe, expect, test } from 'bun:test';
import { toRouterQuota } from './harness-router.js';

const status = {
  picks: {
    auto: { id: 'chatgpt.dev-team', provider: 'gpt', model: 'gpt-6.1-sol' },
    best: { id: 'chatgpt.dev-team', provider: 'gpt', model: 'gpt-6.1-sol' },
  },
  seats: [
    { id: 'a-own', provider: 'claude', score: 0.2, week: 60, fiveHour: 10, resetsAt: 2_000_000_000_000, coolingDown: false },
    { id: 'b-team', provider: 'claude', score: 0.9, week: 20, fiveHour: null, resetsAt: 2_000_000_000_000, coolingDown: false },
    { id: 'c-cool', provider: 'claude', score: 5, week: 99, fiveHour: 100, resetsAt: 2_000_000_000_000, coolingDown: true },
    { id: 'chatgpt.dev-team', provider: 'gpt', score: 3, week: 1, fiveHour: 0, resetsAt: 2_000_000_000_000, coolingDown: false },
  ],
};

describe('harness router quota', () => {
  test('orders seats by score with cooling ones last, and labels what is left', () => {
    const result = toRouterQuota(status, { providerId: 'claude', providerName: 'Claude', pool: 'claude' });
    expect(result.ok).toBe(true);
    expect(Object.keys(result.usage.models)).toEqual(['b-team', 'a-own', 'c-cool']);
    expect(result.usage.models['a-own'].windows['7d'].valueLabel).toBe('40% left · 5h 90%');
    expect(result.usage.models['b-team'].windows['7d'].valueLabel).toBe('80% left');
    expect(result.usage.models['c-cool'].windows['7d'].valueLabel).toBe('cooling down');
    expect(result.usage.windows['7d'].usedPercent).toBe(20);
    expect(result.usage.windows['5h']).toBeUndefined();
    expect(result.planLabel).toBe('auto → chatgpt.dev-team (gpt-6.1-sol)');
  });

  test('names the auto pick plainly on its own provider', () => {
    const result = toRouterQuota(status, { providerId: 'codex', providerName: 'Codex', pool: 'gpt' });
    expect(result.planLabel).toBe('auto → chatgpt.dev-team');
    expect(result.usage.windows['5h'].usedPercent).toBe(0);
  });

  test('reports a provider with no seats as an error, not as empty', () => {
    const result = toRouterQuota({ seats: [] }, { providerId: 'claude', providerName: 'Claude', pool: 'claude' });
    expect(result.ok).toBe(false);
  });
});
