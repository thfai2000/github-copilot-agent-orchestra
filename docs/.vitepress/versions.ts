/**
 * Documentation version registry.
 *
 * Each entry represents a published doc version. The entry marked `latest: true`
 * is served from the site root. All other entries are served from `/v{X.Y}/`.
 *
 * When releasing a new version, the docs-release.sh script automatically:
 *   1. Marks the previous latest as non-latest (adds path `/v{X.Y}/`)
 *   2. Adds a new latest entry at the top
 *
 * You can also edit this file manually before running `npm run docs:release`.
 */

export interface DocVersion {
  /** Display label, e.g. "v1.8" */
  version: string;
  /** True if this is the current/latest version (served at site root) */
  latest?: boolean;
}

export const DOC_VERSIONS: DocVersion[] = [
  { version: 'v1.8', latest: true },
];
