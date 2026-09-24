import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, errors, jwtVerify } from 'jose';

const ISSUER = 'grasp-api';
const AUDIENCE = 'grasp-app';
export const ACCESS_TOKEN_SECONDS = 15 * 60;

export interface AccessClaims {
  userId: string;
  learnerId: string;
}

export class InvalidTokenError extends Error {}

/** Short-lived HS256 access tokens; refresh tokens are opaque and stored hashed. */
export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: AccessClaims, now = new Date()): Promise<string> {
    const iat = Math.floor(now.getTime() / 1000);
    return new SignJWT({ lid: claims.learnerId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + ACCESS_TOKEN_SECONDS)
      .sign(this.key);
  }

  async verify(token: string, now = new Date()): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'], currentDate: now });
      if (typeof payload.sub !== 'string' || typeof payload['lid'] !== 'string') throw new InvalidTokenError('Malformed token');
      return { userId: payload.sub, learnerId: payload['lid'] };
    } catch (e) {
      if (e instanceof InvalidTokenError) throw e;
      throw new InvalidTokenError(e instanceof errors.JWTExpired ? 'Token expired' : 'Invalid token');
    }
  }
}

export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
