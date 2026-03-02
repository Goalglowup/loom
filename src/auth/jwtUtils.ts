import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
  scopes?: string[];
  orgSlug?: string | null;
}

export function signJwt(payload: object, secret: string, expiresInMs: number): string {
  return jwt.sign(payload, secret, { expiresIn: Math.floor(expiresInMs / 1000) });
}

export function verifyJwt<T>(token: string, secret: string): T {
  return jwt.verify(token, secret) as T;
}
