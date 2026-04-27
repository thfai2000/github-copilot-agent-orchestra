import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We test the pure helpers (parsing, normalisation) by re-implementing the
// isolated logic from `services/github-catalog.ts` against the same fixtures.
// The DB-touching upsert path is covered by the integration suite; here we
// only assert the wire-format normalisation.

import {
  fetchGithubCatalog,
  type GithubCatalogModelEntry,
} from '../src/services/github-catalog.js';

const ORIGINAL_FETCH = global.fetch;

describe('github-catalog service', () => {
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('fetchGithubCatalog accepts an array response', async () => {
    const sample: GithubCatalogModelEntry[] = [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', publisher: 'OpenAI', summary: 'Fast & cheap' },
      { id: 'openai/gpt-5-mini', name: 'GPT-5 mini', publisher: 'OpenAI', supported_reasoning_efforts: ['low', 'medium', 'high'] },
    ];
    global.fetch = vi.fn(async () => new Response(JSON.stringify(sample), { status: 200, headers: { 'content-type': 'application/json' } })) as any;

    const result = await fetchGithubCatalog({ githubToken: 'gho_test' });
    expect(result).toHaveLength(2);
    expect(result[1].supported_reasoning_efforts).toEqual(['low', 'medium', 'high']);
  });

  it('fetchGithubCatalog accepts a { models: [...] } envelope', async () => {
    const payload = { models: [{ id: 'meta/llama-3', name: 'Llama 3' }] };
    global.fetch = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as any;

    const result = await fetchGithubCatalog({ githubToken: 'gho_test' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('meta/llama-3');
  });

  it('fetchGithubCatalog throws with status detail on non-2xx', async () => {
    global.fetch = vi.fn(async () => new Response('forbidden', { status: 403 })) as any;
    await expect(fetchGithubCatalog({ githubToken: 'bad' })).rejects.toThrow(/403/);
  });

  it('fetchGithubCatalog throws on non-array, non-models payload', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })) as any;
    await expect(fetchGithubCatalog({ githubToken: 'gho_test' })).rejects.toThrow(/array/i);
  });

  it('fetchGithubCatalog uses the override URL when provided', async () => {
    const fetchSpy = vi.fn(async () => new Response('[]', { status: 200 })) as any;
    global.fetch = fetchSpy;
    await fetchGithubCatalog({ githubToken: 'gho_test', url: 'https://example.com/custom/catalog' });
    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/custom/catalog', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer gho_test' }),
    }));
  });
});
