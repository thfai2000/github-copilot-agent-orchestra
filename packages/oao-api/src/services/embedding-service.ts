import { createLogger } from '@oao/shared';

const logger = createLogger('embedding-service');

const EMBEDDING_DIMENSION = 1536;

// ─── Provider types ──────────────────────────────────────────────────

export type EmbeddingProvider = 'openai' | 'local' | 'hash';

/**
 * Resolve which embedding provider to use.
 * Priority:
 *   1. EMBEDDING_PROVIDER env var (explicit: 'openai' | 'local' | 'hash')
 *   2. OPENAI_API_KEY set → 'openai'
 *   3. Default → 'local' (offline, CPU-based semantic embeddings)
 */
export function resolveProvider(): EmbeddingProvider {
  const explicit = process.env.EMBEDDING_PROVIDER?.toLowerCase();
  if (explicit === 'openai' || explicit === 'local' || explicit === 'hash') return explicit;
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'local';
}

// ─── Local model singleton (lazy-loaded) ─────────────────────────────

let localPipelinePromise: Promise<LocalEmbeddingPipeline> | null = null;

interface LocalEmbeddingPipeline {
  (texts: string[], options?: { pooling: string; normalize: boolean }): Promise<{ tolist(): number[][] }>;
}

async function getLocalPipeline(): Promise<LocalEmbeddingPipeline> {
  if (!localPipelinePromise) {
    localPipelinePromise = (async () => {
      logger.info('Loading local embedding model (all-MiniLM-L6-v2)...');
      // Dynamic import — only loads when local provider is used
      const { pipeline } = await import('@huggingface/transformers');
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        // Force CPU / WASM backend. Model ~23 MB, downloaded once and cached.
        device: 'cpu',
      });
      logger.info('Local embedding model loaded');
      return extractor as unknown as LocalEmbeddingPipeline;
    })();
  }
  return localPipelinePromise;
}

// ─── Main entry point ────────────────────────────────────────────────

/**
 * Generate a text embedding vector (1536 dimensions).
 *
 * Provider selection (configurable via EMBEDDING_PROVIDER env var):
 *   - 'openai'  — OpenAI text-embedding-3-small (requires OPENAI_API_KEY)
 *   - 'local'   — Offline CPU-based model (all-MiniLM-L6-v2, 384d → padded to 1536d)
 *   - 'hash'    — Deterministic hash fallback (no semantic understanding)
 *
 * Default: 'local' if no OPENAI_API_KEY, 'openai' if key is set.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = resolveProvider();

  switch (provider) {
    case 'openai':
      return generateOpenAIEmbedding(text, process.env.OPENAI_API_KEY!);
    case 'local':
      return generateLocalEmbedding(text);
    case 'hash':
    default:
      return generateHashEmbedding(text);
  }
}

// ─── OpenAI provider ─────────────────────────────────────────────────

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
    logger.error({ status: res.status, error: err }, 'OpenAI embedding API failed, falling back to local');
    return generateLocalEmbedding(text);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data[0].embedding;
}

// ─── Local provider (Transformers.js — offline, CPU) ─────────────────

async function generateLocalEmbedding(text: string): Promise<number[]> {
  try {
    const extractor = await getLocalPipeline();
    const output = await extractor([text.slice(0, 8000)], { pooling: 'mean', normalize: true });
    const vec384 = output.tolist()[0];
    // Pad to 1536 dimensions for pgvector column compatibility.
    // Cosine similarity is unaffected by zero-padding.
    return padTo1536(vec384);
  } catch (err) {
    logger.error({ err }, 'Local embedding failed, falling back to hash');
    return generateHashEmbedding(text);
  }
}

function padTo1536(vec: number[]): number[] {
  if (vec.length >= EMBEDDING_DIMENSION) return vec.slice(0, EMBEDDING_DIMENSION);
  const padded = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  for (let i = 0; i < vec.length; i++) padded[i] = vec[i];
  return padded;
}

// ─── Hash fallback ───────────────────────────────────────────────────

function generateHashEmbedding(text: string): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = normalized.split(/\s+/).filter(Boolean);
  const vec = new Float64Array(EMBEDDING_DIMENSION);

  for (const word of words) {
    let h = 0;
    for (let i = 0; i < word.length; i++) {
      h = ((h << 5) - h + word.charCodeAt(i)) | 0;
    }
    for (let j = 0; j < 8; j++) {
      const idx = Math.abs((h * (j + 1) * 2654435761) | 0) % EMBEDDING_DIMENSION;
      vec[idx] += 1.0 / words.length;
    }
  }

  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) vec[i] /= norm;
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
