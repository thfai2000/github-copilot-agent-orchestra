import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

let loaded = false;

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Load `.env` from the repo root exactly once. Values already in
 * `process.env` are preserved (not overridden).
 */
export function loadTestEnv(): NodeJS.ProcessEnv {
  if (loaded) return process.env;
  loaded = true;

  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '..', '..', '.env'),
    resolve(process.cwd(), '..', '.env'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const parsed = parseEnvFile(readFileSync(p, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
      break;
    }
  }
  return process.env;
}

/**
 * Returns true iff every requested env var is defined and non-empty.
 * Use in combination with `it.skipIf(!hasSecrets([...]))` to gate
 * integration tests.
 */
export function hasSecrets(keys: string[]): boolean {
  loadTestEnv();
  return keys.every((k) => {
    const v = process.env[k];
    return typeof v === 'string' && v.length > 0;
  });
}
