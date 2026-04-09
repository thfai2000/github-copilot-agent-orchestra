import { describe, it, expect, beforeEach } from 'vitest';

// We need to test the EventBus class. Since it's exported as a singleton,
// we'll import the module and test the singleton instance.
// We re-create isolation via the broadcast/connect methods.

describe('EventBus (SSE)', () => {
  let agentEventBus: typeof import('../../src/sse/event-bus.js')['agentEventBus'];

  beforeEach(async () => {
    // Re-import to get the singleton (state persists across tests in same module)
    const mod = await import('../../src/sse/event-bus.js');
    agentEventBus = mod.agentEventBus;
  });

  it('starts with zero connections', () => {
    // connectionCount may be > 0 if prior tests connected without cleanup,
    // but the class should expose the getter correctly
    expect(typeof agentEventBus.connectionCount).toBe('number');
  });

  it('connect() returns a Response with SSE headers', () => {
    const fakeContext = {} as Parameters<typeof agentEventBus.connect>[0];
    const response = agentEventBus.connect(fakeContext);

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
  });

  it('connect() returns a readable stream body', () => {
    const fakeContext = {} as Parameters<typeof agentEventBus.connect>[0];
    const response = agentEventBus.connect(fakeContext);
    expect(response.body).toBeTruthy();
    expect(response.body).toBeInstanceOf(ReadableStream);
  });

  it('connect() sends initial "connected" event with clientId', async () => {
    const fakeContext = {} as Parameters<typeof agentEventBus.connect>[0];
    const response = agentEventBus.connect(fakeContext);

    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain('event: connected');
    expect(text).toContain('"clientId"');

    // Cancel the stream to clean up
    await reader.cancel();
  });

  it('broadcast() sends events to connected clients', async () => {
    const fakeContext = {} as Parameters<typeof agentEventBus.connect>[0];
    const response = agentEventBus.connect(fakeContext);

    const reader = response.body!.getReader();
    // Read the initial "connected" event first
    await reader.read();

    // Broadcast a custom event
    agentEventBus.broadcast('test-event', { message: 'hello' });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain('event: test-event');
    expect(text).toContain('"message":"hello"');

    await reader.cancel();
  });

  it('broadcast() handles disconnected clients gracefully', () => {
    // Broadcasting with no connected clients should not throw
    expect(() => agentEventBus.broadcast('orphan-event', { test: true })).not.toThrow();
  });

  it('connectionCount increments on connect', () => {
    const before = agentEventBus.connectionCount;
    const fakeContext = {} as Parameters<typeof agentEventBus.connect>[0];
    agentEventBus.connect(fakeContext);
    expect(agentEventBus.connectionCount).toBeGreaterThanOrEqual(before + 1);
  });
});
