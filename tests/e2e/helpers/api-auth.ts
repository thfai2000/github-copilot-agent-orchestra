import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';

export interface ApiClient {
  request: APIRequestContext;
  token: string;
  userId: string;
  email: string;
}

/**
 * Login a user via the public auth API and return an APIRequestContext that
 * automatically attaches the JWT bearer token. Use this in API-driven RBAC
 * tests where rotating between many roles in one test is expensive via UI.
 */
export async function loginApi(params: {
  baseURL: string;
  identifier: string;
  password: string;
  provider?: 'database' | 'ldap';
  forwardedIp?: string;
}): Promise<ApiClient> {
  // Always rotate the X-Forwarded-For so per-IP rate limiters do not flake the run.
  const ipHeader = params.forwardedIp ?? `10.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
  const bootstrapHeaders = { 'x-forwarded-for': ipHeader };
  const bootstrap = await playwrightRequest.newContext({ baseURL: params.baseURL, extraHTTPHeaders: bootstrapHeaders });
  try {
    const res = await bootstrap.post('/api/auth/login', {
      data: {
        identifier: params.identifier,
        password: params.password,
        provider: params.provider ?? 'database',
      },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`Login failed for ${params.identifier} (${res.status()}): ${body}`);
    }
    const payload = await res.json() as { token: string; user: { id: string; email: string } };
    const authed = await playwrightRequest.newContext({
      baseURL: params.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${payload.token}`, 'x-forwarded-for': ipHeader },
    });
    return {
      request: authed,
      token: payload.token,
      userId: payload.user.id,
      email: payload.user.email,
    };
  } finally {
    await bootstrap.dispose();
  }
}

export async function disposeClient(client: ApiClient | null) {
  if (!client) return;
  await client.request.dispose();
}
