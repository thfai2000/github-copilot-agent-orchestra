import type { FullConfig } from '@playwright/test';
import { ensureUiBaseReachable } from './helpers/cluster';

export default async function globalSetup(config: FullConfig) {
  const project = config.projects[0];
  const baseURL = typeof project?.use?.baseURL === 'string'
    ? project.use.baseURL
    : (process.env.E2E_BASE_URL ?? 'http://localhost:3002');

  await ensureUiBaseReachable(baseURL);
}