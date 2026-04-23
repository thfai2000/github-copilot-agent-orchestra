import { spawn, spawnSync, execSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const CONTAINER_NAME = 'oao-test-ldap';
const IMAGE = 'dwimberger/ldap-ad-it';
const PORT = 10389;
const MAX_START_MS = 60_000;

function hasDocker(): boolean {
  const res = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  return res.status === 0;
}

function isRunning(): boolean {
  const out = spawnSync('docker', ['ps', '--filter', `name=${CONTAINER_NAME}`, '--format', '{{.Names}}'], { encoding: 'utf8' });
  return out.stdout.trim() === CONTAINER_NAME;
}

/**
 * Start the dwimberger/ldap-ad-it container and wait for it to accept TCP
 * connections on localhost:10389. Returns connection info the tests can use.
 *
 * Seeded entries provided by this image (used in integration tests):
 *   - bind: uid=admin,ou=system / secret
 *   - sample user: cn=Albert Einstein,ou=users,dc=wimpi,dc=net / password
 */
export async function startLdapContainer(): Promise<{
  url: string;
  bindDn: string;
  bindPassword: string;
  searchBase: string;
}> {
  if (!hasDocker()) {
    throw new Error('Docker is not available — LDAP integration tests require it');
  }

  if (!isRunning()) {
    execSync(
      `docker run --rm -d --name ${CONTAINER_NAME} -p ${PORT}:${PORT} -p 10636:10636 ${IMAGE}`,
      { stdio: 'ignore' },
    );
  }

  // Wait for port to open
  const start = Date.now();
  while (Date.now() - start < MAX_START_MS) {
    try {
      const res = spawnSync('nc', ['-z', '127.0.0.1', String(PORT)], { stdio: 'ignore' });
      if (res.status === 0) break;
    } catch {
      // ignore
    }
    await delay(500);
  }

  return {
    url: `ldap://127.0.0.1:${PORT}`,
    bindDn: 'uid=admin,ou=system',
    bindPassword: 'secret',
    searchBase: 'ou=users,dc=wimpi,dc=net',
  };
}

export function stopLdapContainer(): void {
  if (!hasDocker()) return;
  if (!isRunning()) return;
  spawnSync('docker', ['stop', CONTAINER_NAME], { stdio: 'ignore' });
}
