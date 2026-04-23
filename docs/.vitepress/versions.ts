import { readFileSync } from 'node:fs';

/**
 * Documentation version registry.
 *
 * The GitHub Pages build can inject the full version list through
 * `DOC_VERSIONS_JSON`. When that env var is absent, fall back to the current
 * repository version so local VitePress development still works without any
 * release metadata.
 */

export interface DocVersion {
  /** Display label, e.g. "1.30.11" */
  version: string;
  /** True if this is the current/latest version (served at site root) */
  latest?: boolean;
}

function fallbackVersion(): DocVersion[] {
  const packageJsonPath = new URL('../../package.json', import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
  const version = typeof packageJson.version === 'string' && packageJson.version.trim()
    ? packageJson.version.trim()
    : '0.0.0';

  return [{ version, latest: true }];
}

function parseInjectedVersions(): DocVersion[] | null {
  const raw = process.env.DOC_VERSIONS_JSON;
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Array<{ version?: unknown; latest?: unknown }>;
    const normalized = parsed
      .filter((entry) => typeof entry?.version === 'string' && entry.version.trim())
      .map((entry, index) => ({
        version: String(entry.version).trim(),
        latest: index === 0 || entry.latest === true,
      }));

    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

export const DOC_VERSIONS: DocVersion[] = parseInjectedVersions() ?? fallbackVersion();
