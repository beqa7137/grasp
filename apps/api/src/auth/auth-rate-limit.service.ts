import { Injectable } from '@nestjs/common';
import { RateLimitExceeded } from '../common/rate-limit-exceeded.js';
import { CoordinationStore, type WindowTotal } from '../persistence/stores.js';
import { sessionEnded } from './auth-errors.js';
import type { VerifiedIdentity } from './auth.types.js';
import { hashToken, type AccessClaims } from './tokens.js';

export const AUTH_NETWORK_LIMIT = { limit: 1200, windowMs: 60_000 };
export const AUTH_WINDOW_MS = 15 * 60_000;

@Injectable()
export class AuthRateLimitService {
  constructor(private readonly store: CoordinationStore) {}

  async signIn(identity: VerifiedIdentity): Promise<void> {
    const counted = await this.store.add(`auth:sign-in:${hashToken(`${identity.provider}:${identity.subject}`)}`, AUTH_WINDOW_MS, 1);
    this.enforce(counted, 10);
  }

  async githubTicket(subject: string): Promise<void> {
    const counted = await this.store.add(`auth:github-ticket:${hashToken(subject)}`, AUTH_WINDOW_MS, 1);
    this.enforce(counted, 20);
  }

  async refresh(claims: AccessClaims): Promise<void> {
    const counted = await this.store.addForSession(`auth:refresh:${hashToken(claims.userId)}`, AUTH_WINDOW_MS, 1, claims);
    if (!counted) throw sessionEnded();
    this.enforce(counted, 30);
  }

  private enforce(counted: WindowTotal, limit: number): void {
    if (counted.total > limit) throw new RateLimitExceeded(limit, counted.resetsInMs);
  }
}
