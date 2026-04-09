import { describe, it, expect } from 'vitest';
import { generateEmbedding, cosineSimilarity } from '../src/services/embedding-service.js';

describe('embedding-service', () => {
  describe('generateEmbedding (hash fallback)', () => {
    it('returns a 1536-dimension vector', async () => {
      // No OPENAI_API_KEY set, so hash fallback is used
      delete process.env.OPENAI_API_KEY;
      const embedding = await generateEmbedding('hello world');
      expect(embedding).toHaveLength(1536);
    });

    it('returns numbers in the vector', async () => {
      delete process.env.OPENAI_API_KEY;
      const embedding = await generateEmbedding('test text');
      expect(embedding.every((v) => typeof v === 'number')).toBe(true);
    });

    it('produces a normalized vector (L2 norm ~= 1)', async () => {
      delete process.env.OPENAI_API_KEY;
      const embedding = await generateEmbedding('some words here');
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('produces deterministic output for the same input', async () => {
      delete process.env.OPENAI_API_KEY;
      const a = await generateEmbedding('deterministic check');
      const b = await generateEmbedding('deterministic check');
      expect(a).toEqual(b);
    });

    it('produces different vectors for different inputs', async () => {
      delete process.env.OPENAI_API_KEY;
      const a = await generateEmbedding('hello world');
      const b = await generateEmbedding('goodbye universe');
      // They should not be identical
      expect(a).not.toEqual(b);
    });

    it('handles empty string', async () => {
      delete process.env.OPENAI_API_KEY;
      const embedding = await generateEmbedding('');
      expect(embedding).toHaveLength(1536);
      // All zeros for empty input but still length 1536
      expect(embedding.every((v) => v === 0)).toBe(true);
    });

    it('handles special characters by normalizing', async () => {
      delete process.env.OPENAI_API_KEY;
      const embedding = await generateEmbedding('hello! @#$ world');
      expect(embedding).toHaveLength(1536);
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const v = [0.5, 0.5, 0.5, 0.5];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
    });

    it('returns 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
    });

    it('returns -1 for opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
    });

    it('returns 0 for zero vectors', () => {
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('handles one zero vector', () => {
      const a = [1, 2, 3];
      const b = [0, 0, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('computes correct similarity for known vectors', () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      // dot = 4+10+18 = 32, normA = sqrt(14), normB = sqrt(77)
      const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
      expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 10);
    });

    it('similar texts have higher cosine similarity than dissimilar texts', async () => {
      delete process.env.OPENAI_API_KEY;
      const { generateEmbedding: gen } = await import('../src/services/embedding-service.js');
      const base = await gen('stock market trading');
      const similar = await gen('stock market investment');
      const dissimilar = await gen('chocolate cake recipe');

      const simScore = cosineSimilarity(base, similar);
      const dissimScore = cosineSimilarity(base, dissimilar);
      // Similar texts should have higher similarity
      expect(simScore).toBeGreaterThan(dissimScore);
    });
  });
});
