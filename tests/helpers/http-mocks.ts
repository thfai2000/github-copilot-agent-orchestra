import { vi } from 'vitest';

export interface MockedFetchResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface MockedFetchCall {
  url: string;
  method: string;
  body: string | undefined;
  headers: Record<string, string>;
}

/**
 * Installs a `global.fetch` mock that serves canned responses matched by URL
 * substring. Returns a helper that lets the test inspect the calls made.
 *
 * Usage:
 *   const { calls, restore } = mockFetch({
 *     'api.github.com/user': { status: 200, body: { login: 'alice' } },
 *   });
 *   // ... run code under test ...
 *   expect(calls[0].url).toContain('api.github.com');
 *   restore();
 */
export function mockFetch(routes: Record<string, MockedFetchResponse>) {
  const original = global.fetch;
  const calls: MockedFetchCall[] = [];

  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const headers = normalizeHeaders(init?.headers);
    calls.push({ url, method, body, headers });

    const matched = Object.entries(routes).find(([pattern]) => url.includes(pattern));
    if (!matched) {
      return new Response(JSON.stringify({ error: 'mock-not-found', url }), {
        status: 599,
        headers: { 'content-type': 'application/json' },
      });
    }
    const [, res] = matched;
    return new Response(typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? {}), {
      status: res.status ?? 200,
      headers: { 'content-type': 'application/json', ...(res.headers ?? {}) },
    });
  }) as unknown as typeof fetch;

  global.fetch = fn;

  return {
    calls,
    restore() {
      global.fetch = original;
    },
  };
}

function normalizeHeaders(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => { out[k] = v; });
    return out;
  }
  if (Array.isArray(h)) {
    return Object.fromEntries(h);
  }
  return { ...(h as Record<string, string>) };
}
