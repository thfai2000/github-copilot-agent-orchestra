import { createLogger, decrypt } from '@oao/shared';

const logger = createLogger('ldap-auth');

export interface LdapConfig {
  url: string;                    // e.g. ldap://ldap.example.com:389 or ldaps://...
  bindDn: string;                 // e.g. cn=admin,dc=example,dc=com
  bindCredentialEncrypted: string; // AES-256-GCM encrypted bind password
  searchBase: string;             // e.g. ou=users,dc=example,dc=com
  searchFilter: string;           // e.g. (mail={{username}}) — {{username}} is replaced at runtime
  usernameAttribute: string;      // e.g. uid or sAMAccountName
  emailAttribute: string;         // e.g. mail
  nameAttribute: string;          // e.g. cn or displayName
  startTls?: boolean;             // upgrade to TLS after connecting (default false)
  tlsRejectUnauthorized?: boolean; // reject untrusted certs (default true)
}

export interface LdapUser {
  email: string;
  name: string;
  dn: string; // distinguished name for bind verification
}

/**
 * Authenticate a user against an LDAP / Active Directory server.
 *
 * Flow:
 * 1. Bind with service account (bindDn) to search for the user
 * 2. Search for the user entry using the configured filter
 * 3. Attempt to bind as the found user DN with the provided password
 * 4. Return user attributes on success
 */
export async function authenticateLdap(
  config: LdapConfig,
  username: string,
  password: string,
): Promise<LdapUser | null> {
  // Dynamically import ldapts to keep it optional
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let ldapts: typeof import('ldapts');
  try {
    ldapts = await import('ldapts');
  } catch {
    throw new Error('ldapts package is not installed. Run: npm install ldapts');
  }

  const bindPassword = decrypt(config.bindCredentialEncrypted);

  const tlsOptions = config.tlsRejectUnauthorized === false
    ? { rejectUnauthorized: false }
    : undefined;

  // 1. Create client and bind with service account
  const client = new ldapts.Client({
    url: config.url,
    tlsOptions,
    strictDN: false,
  });

  try {
    // Optional STARTTLS
    if (config.startTls) {
      await client.startTLS(tlsOptions ?? {});
    }

    // 2. Bind as service account
    await client.bind(config.bindDn, bindPassword);

    // 3. Search for user
    const filter = config.searchFilter.replace(/\{\{username\}\}/g, ldapEscape(username));
    const { searchEntries } = await client.search(config.searchBase, {
      scope: 'sub',
      filter,
      attributes: [config.emailAttribute, config.nameAttribute],
    });

    if (searchEntries.length === 0) {
      logger.info({ username }, 'LDAP user not found');
      return null;
    }

    const entry = searchEntries[0];
    const userDn = entry.dn;

    // Unbind service account before user bind
    await client.unbind();

    // 4. Verify user password by binding as user
    const userClient = new ldapts.Client({
      url: config.url,
      tlsOptions,
      strictDN: false,
    });

    try {
      if (config.startTls) {
        await userClient.startTLS(tlsOptions ?? {});
      }
      await userClient.bind(userDn, password);
      await userClient.unbind();
    } catch {
      logger.info({ username }, 'LDAP bind failed — invalid password');
      await userClient.unbind().catch(() => {});
      return null;
    }

    // Extract attributes
    const email = getAttr(entry, config.emailAttribute) ?? username;
    const name = getAttr(entry, config.nameAttribute) ?? username;

    logger.info({ username, email }, 'LDAP authentication successful');
    return { email, name, dn: userDn };
  } catch (err) {
    logger.error({ error: err, url: config.url }, 'LDAP authentication error');
    throw err;
  } finally {
    await client.unbind().catch(() => {});
  }
}

/** Escape special characters in LDAP filter values (RFC 4515) */
function ldapEscape(value: string): string {
  return value.replace(/[\\*()\0/]/g, (match) => {
    return '\\' + match.charCodeAt(0).toString(16).padStart(2, '0');
  });
}

/** Safely extract a string attribute from an ldapts search entry */
function getAttr(entry: Record<string, unknown>, attrName: string): string | undefined {
  const val = entry[attrName];
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  // Case-insensitive fallback
  for (const [key, v] of Object.entries(entry)) {
    if (key.toLowerCase() === attrName.toLowerCase()) {
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
    }
  }
  return undefined;
}
