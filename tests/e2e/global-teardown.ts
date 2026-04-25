import { restoreSuperAdminAuthState, stopManagedApiForward, stopManagedLocalProxy, stopManagedUiForward } from './helpers/cluster';

export default async function globalTeardown() {
  restoreSuperAdminAuthState();

  const baseURL = process.env.E2E_BASE_URL ?? 'http://oao.local';
  if (baseURL.includes('oao.local')) {
    return;
  }

  stopManagedUiForward();
  stopManagedApiForward();
  stopManagedLocalProxy();
}