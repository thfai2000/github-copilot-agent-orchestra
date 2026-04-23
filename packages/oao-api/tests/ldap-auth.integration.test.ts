/**
 * LDAP integration test against a real `dwimberger/ldap-ad-it` container.
 *
 * Gated by RUN_LDAP_INTEGRATION=1 (requires Docker). Uses the seeded entry
 * cn=Albert Einstein,ou=users,dc=wimpi,dc=net (password "password").
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt } from '@oao/shared';
import { startLdapContainer, stopLdapContainer } from '../../../tests/helpers/ldap-container.js';

const shouldRun = process.env.RUN_LDAP_INTEGRATION === '1';

process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);

describe.skipIf(!shouldRun)('LDAP integration (real container)', () => {
  let url = '';
  let bindDn = '';
  let bindPassword = '';
  let searchBase = '';

  beforeAll(async () => {
    const info = await startLdapContainer();
    url = info.url;
    bindDn = info.bindDn;
    bindPassword = info.bindPassword;
    searchBase = info.searchBase;
  }, 90_000);

  afterAll(() => {
    stopLdapContainer();
  });

  it('authenticates a seeded user and rejects wrong passwords', async () => {
    const { authenticateLdap } = await import('../src/services/ldap-auth.js');
    const cfg = {
      url,
      bindDn,
      bindCredentialEncrypted: encrypt(bindPassword),
      searchBase,
      searchFilter: '(cn={{username}})',
      usernameAttribute: 'cn',
      emailAttribute: 'mail',
      nameAttribute: 'cn',
    };

    const good = await authenticateLdap(cfg, 'Albert Einstein', 'password');
    expect(good?.name).toMatch(/Einstein/);

    const bad = await authenticateLdap(cfg, 'Albert Einstein', 'wrong');
    expect(bad).toBeNull();

    const missing = await authenticateLdap(cfg, 'Nobody Here', 'whatever');
    expect(missing).toBeNull();
  }, 60_000);
});
