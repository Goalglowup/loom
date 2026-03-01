import jwt from 'jsonwebtoken';

export function signJwt(payload: object, secret: string, expiresInMs: number): string {
  return jwt.sign(payload, secret, { expiresIn: Math.floor(expiresInMs / 1000) });
}

export function verifyJwt<T>(token: string, secret: string): T {
  return jwt.verify(token, secret) as T;
}
