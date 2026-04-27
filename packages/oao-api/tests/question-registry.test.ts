import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerQuestion,
  resolveQuestion,
  rejectQuestion,
  hasPendingQuestion,
  __resetQuestionRegistry,
} from '../src/services/question-registry.js';

describe('question-registry', () => {
  beforeEach(() => {
    __resetQuestionRegistry();
  });

  it('resolves a registered question with the supplied answers', async () => {
    const promise = registerQuestion('conv-1', 'ask-1', 60_000);
    expect(hasPendingQuestion('conv-1', 'ask-1')).toBe(true);

    const ok = resolveQuestion('conv-1', 'ask-1', { q1: 'yes' });
    expect(ok).toBe(true);
    expect(hasPendingQuestion('conv-1', 'ask-1')).toBe(false);
    await expect(promise).resolves.toEqual({ q1: 'yes' });
  });

  it('rejects when explicit reject is invoked', async () => {
    const promise = registerQuestion('conv-2', 'ask-2', 60_000);
    const ok = rejectQuestion('conv-2', 'ask-2', 'cancelled');
    expect(ok).toBe(true);
    await expect(promise).rejects.toThrow('cancelled');
  });

  it('rejects after the timeout elapses', async () => {
    const promise = registerQuestion('conv-3', 'ask-3', 25);
    await expect(promise).rejects.toThrow(/timed out/i);
    expect(hasPendingQuestion('conv-3', 'ask-3')).toBe(false);
  });

  it('returns false when resolving an unknown question', () => {
    expect(resolveQuestion('missing', 'missing', { a: 'b' })).toBe(false);
    expect(rejectQuestion('missing', 'missing', 'nope')).toBe(false);
  });

  it('keeps entries for distinct askIds independent', async () => {
    const a = registerQuestion('conv-4', 'ask-a', 60_000);
    const b = registerQuestion('conv-4', 'ask-b', 60_000);
    resolveQuestion('conv-4', 'ask-a', { value: 1 });
    await expect(a).resolves.toEqual({ value: 1 });
    expect(hasPendingQuestion('conv-4', 'ask-b')).toBe(true);
    resolveQuestion('conv-4', 'ask-b', { value: 2 });
    await expect(b).resolves.toEqual({ value: 2 });
  });
});
