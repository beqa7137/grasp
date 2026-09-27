import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, errors, jwtVerify } from 'jose';

const ISSUER = 'grasp-api';
const AUDIENCE = 'grasp-app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ACCESS_TOKEN_SECONDS = 15 * 60;

export interface AccessClaims {
  userId: string;
  learnerId: string;
  familyId: string;
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
    return new SignJWT({ lid: claims.learnerId, fid: claims.familyId })
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
      if (
        typeof payload.sub !== 'string' ||
        typeof payload['lid'] !== 'string' ||
        typeof payload['fid'] !== 'string' ||
        !UUID.test(payload.sub) ||
        !UUID.test(payload['lid']) ||
        !UUID.test(payload['fid'])
      ) {
        throw new InvalidTokenError('Malformed token');
      }
      return { userId: payload.sub, learnerId: payload['lid'], familyId: payload['fid'] };
    } catch (e) {
      if (e instanceof InvalidTokenError) throw e;
      throw new InvalidTokenError(e instanceof errors.JWTExpired ? 'Token expired' : 'Invalid token');
    }
  }
}

export const newOpaqueToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
