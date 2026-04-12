import { createLogger } from '@oao/shared';

const logger = createLogger('embedding-service');

const EMBEDDING_DIMENSION = 1536;

/**
 * Generate a text embedding vector.
 *
 * Strategy:
 * - If OPENAI_API_KEY is set, uses OpenAI text-embedding-3-small (1536 dims)
 * - Otherwise, falls back to a deterministic hash-based embedding for
 *   basic similarity matching without an external API
 *
 * The hash-based fallback is NOT production-quality for semantic search
 * but allows the system to function without external API keys.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    return generateOpenAIEmbedding(text, openaiKey);
  }

  logger.debug('Using hash-based embedding fallback (set OPENAI_API_KEY for semantic search)');
  return generateHashEmbedding(text);
}

/**
 * Generate embedding via OpenAI text-embedding-3-small API.
 */
async function generateOpenAIEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // limit input length
      dimensions: EMBEDDING_DIMENSION,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error({ status: res.status, error: err }, 'OpenAI embedding API failed');
    // Fall back to hash-based
    return generateHashEmbedding(text);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data[0].embedding;
}

/**
 * Deterministic hash-based embedding fallback.
 * Creates a 1536-dim vector from text using character-level hashing.
 * This preserves basic token overlap similarity but is NOT semantic.
 */
function generateHashEmbedding(text: string): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = normalized.split(/\s+/).filter(Boolean);
  const vec = new Float64Array(EMBEDDING_DIMENSION);

  for (const word of words) {
    // Hash each word into multiple dimensions
    let h = 0;
    for (let i = 0; i < word.length; i++) {
      h = ((h << 5) - h + word.charCodeAt(i)) | 0;
    }
    // Spread hash across several dimensions
    for (let j = 0; j < 8; j++) {
      const idx = Math.abs((h * (j + 1) * 2654435761) | 0) % EMBEDDING_DIMENSION;
      vec[idx] += 1.0 / words.length; // weight by frequency
    }
  }

  // L2-normalize the vector
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      vec[i] /= norm;
    }
  }

  return Array.from(vec);
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
