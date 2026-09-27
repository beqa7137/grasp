import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthStore } from '../persistence/stores.js';
import { sessionEnded } from './auth-errors.js';
import type { User } from './auth.types.js';
import { ACCESS_TOKEN_SECONDS, TokenService, hashToken, newOpaqueToken } from './tokens.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
/** Two tabs refreshing with the same token at once is normal; reuse after this looks like theft. */
const REFRESH_REUSE_LEEWAY_MS = 10_000;

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: { id: string; email: string };
  learnerId: string;
}

/** Access tokens plus rotating refresh tokens, grouped in families so a stolen token ends its whole chain. */
@Injectable()
export class SessionService {
  private readonly log = new Logger(SessionService.name);

  constructor(
    private readonly store: AuthStore,
    private readonly tokens: TokenService,
  ) {}

  /** Starts a new session family for someone who just signed in. */
  async start(user: User, now = new Date()): Promise<AuthSession> {
    const familyId = randomUUID();
    if (!(await this.store.createFamily(user.id, familyId, now.toISOString()))) throw sessionEnded();
    return this.issue(user, familyId, now);
  }

  async refresh(refreshToken: string, now = new Date()): Promise<AuthSession> {
    const record = await this.store.refreshTokenByHash(hashToken(refreshToken));
    if (!record || record.revokedAt || record.expiresAt <= now.toISOString()) throw sessionEnded();
    if (record.rotatedAt && now.getTime() - Date.parse(record.rotatedAt) > REFRESH_REUSE_LEEWAY_MS) {
      await this.store.revokeFamily(record.familyId, now.toISOString());
      this.log.warn(`Refresh token reuse for user ${record.userId}; signed out that session family`);
      throw sessionEnded();
    }
    const user = await this.store.userById(record.userId);
    if (!user) throw sessionEnded();
    await this.store.markRotated(record.id, now.toISOString());
    return this.issue(user, record.familyId, now);
  }

  async logout(refreshToken: string, now = new Date()): Promise<void> {
    const record = await this.store.refreshTokenByHash(hashToken(refreshToken));
    if (record) await this.store.revokeFamily(record.familyId, now.toISOString());
  }

  private async issue(user: User, familyId: string, now: Date): Promise<AuthSession> {
    const refreshToken = newOpaqueToken();
    const added = await this.store.addRefreshToken({
      id: randomUUID(),
      userId: user.id,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(now.getTime() + REFRESH_TTL_MS).toISOString(),
      rotatedAt: null,
      revokedAt: null,
      createdAt: now.toISOString(),
    });
    if (!added) throw sessionEnded();
    return {
      accessToken: await this.tokens.sign({ userId: user.id, learnerId: user.learnerId, familyId }, now),
      expiresIn: ACCESS_TOKEN_SECONDS,
      refreshToken,
      user: { id: user.id, email: user.email },
      learnerId: user.learnerId,
    };
  }
}
