export interface AuthUser {
  userId: string;
  email: string;
  name: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}
