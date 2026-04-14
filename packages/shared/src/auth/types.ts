export type AuthProviderType = 'database' | 'ldap';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  authProvider: AuthProviderType;
  workspaceId: string | null;
  workspaceSlug: string | null;
}

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  authProvider: AuthProviderType;
  workspaceId: string | null;
  workspaceSlug: string | null;
  iat: number;
  exp: number;
}
