import { stopManagedUiForward } from './helpers/cluster';

export default async function globalTeardown() {
  stopManagedUiForward();
}