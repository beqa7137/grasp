import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthStore, FeedbackStore, InterviewStore, ProgressStore } from '../persistence/stores.js';
import type { User } from './auth.types.js';
import { Mailer, signInEmail } from './mailer.js';
import { ACCESS_TOKEN_SECONDS, TokenService, hashLoginCode, hashToken, newLoginCode, newRefreshToken, sameHash } from './tokens.js';

const MINUTE = 60_000;
export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
export const CODES_PER_WINDOW = 3;
const CODE_WINDOW_MINUTES = 15;
const REFRESH_TTL_DAYS = 30;
/** Two tabs refreshing with the same token at once is normal; reuse after this looks like theft. */
const REFRESH_REUSE_LEEWAY_MS = 10_000;

export const AUTH_SECRET = Symbol('AUTH_SECRET');

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: { id: string; email: string };
  learnerId: string;
}

const invalidCode = () => new UnauthorizedException('That code is invalid or has expired. Request a new one.');
const invalidSession = () => new UnauthorizedException('Your session has ended. Please sign in again.');

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly store: AuthStore,
    private readonly progress: ProgressStore,
    private readonly interviews: InterviewStore,
    private readonly feedback: FeedbackStore,
    private readonly mailer: Mailer,
    private readonly tokens: TokenService,
    @Inject(AUTH_SECRET) private readonly secret: string,
  ) {}

  get emailEnabled() {
    return this.mailer.enabled;
  }

  /** Always answers the same way whether or not an account exists, so emails cannot be enumerated. */
  async startEmail(email: string, now = new Date()): Promise<void> {
    if (!this.mailer.enabled) throw new ServiceUnavailableException('Email sign-in is not available right now.');
    const since = new Date(now.getTime() - CODE_WINDOW_MINUTES * MINUTE).toISOString();
    if ((await this.store.countCodesSince(email, since)) >= CODES_PER_WINDOW) {
      throw new HttpException('Too many codes requested for this email. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = newLoginCode();
    await this.store.addCode({
      id: randomUUID(),
      email,
      codeHash: hashLoginCode(this.secret, email, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * MINUTE).toISOString(),
      attempts: 0,
      consumedAt: null,
      createdAt: now.toISOString(),
    });
    try {
      await this.mailer.send({ to: email, ...signInEmail(code, CODE_TTL_MINUTES) });
    } catch (e) {
      this.log.error(`Sign-in email failed: ${e instanceof Error ? e.message : e}`);
      throw new ServiceUnavailableException('We could not send the email. Please try again.');
    }
  }

  /**
   * Signs in with a code. A new account adopts the device's anonymous progress; an existing account
   * absorbs it, so nothing learned before signing in is lost.
   */
  async verifyEmail(email: string, code: string, deviceLearnerId: string | null, now = new Date()): Promise<AuthSession> {
    const record = await this.store.latestCode(email);
    if (!record || record.expiresAt <= now.toISOString() || record.attempts >= MAX_CODE_ATTEMPTS) throw invalidCode();
    if (!sameHash(record.codeHash, hashLoginCode(this.secret, email, code))) {
      await this.store.updateCode(record.id, { attempts: record.attempts + 1 });
      throw invalidCode();
    }
    await this.store.updateCode(record.id, { consumedAt: now.toISOString() });

    const unclaimedDevice = deviceLearnerId && !(await this.store.userByLearner(deviceLearnerId)) ? deviceLearnerId : null;
    let user = await this.store.userByEmail(email);
    if (!user) {
      user = { id: randomUUID(), email, learnerId: unclaimedDevice ?? randomUUID(), createdAt: now.toISOString(), lastLoginAt: null };
      await this.store.createUser(user);
      this.log.log(`New account ${user.id}`);
    } else if (unclaimedDevice && unclaimedDevice !== user.learnerId) {
      await this.mergeLearner(unclaimedDevice, user.learnerId);
    }
    await this.store.touchLogin(user.id, now.toISOString());
    return this.issue(user, randomUUID(), now);
  }

  async refresh(refreshToken: string, now = new Date()): Promise<AuthSession> {
    const record = await this.store.refreshTokenByHash(hashToken(refreshToken));
    if (!record || record.revokedAt || record.expiresAt <= now.toISOString()) throw invalidSession();
    if (record.rotatedAt && now.getTime() - Date.parse(record.rotatedAt) > REFRESH_REUSE_LEEWAY_MS) {
      await this.store.revokeFamily(record.familyId, now.toISOString());
      this.log.warn(`Refresh token reuse for user ${record.userId}; signed out that session family`);
      throw invalidSession();
    }
    const user = await this.store.userById(record.userId);
    if (!user) throw invalidSession();
    await this.store.markRotated(record.id, now.toISOString());
    return this.issue(user, record.familyId, now);
  }

  async logout(refreshToken: string, now = new Date()): Promise<void> {
    const record = await this.store.refreshTokenByHash(hashToken(refreshToken));
    if (record) await this.store.revokeFamily(record.familyId, now.toISOString());
  }

  async me(userId: string) {
    const user = await this.store.userById(userId);
    if (!user) throw invalidSession();
    return { user: { id: user.id, email: user.email }, learnerId: user.learnerId };
  }

  private async mergeLearner(from: string, into: string) {
    await this.feedback.moveLearner(from, into);
    await this.interviews.moveLearner(from, into);
    await this.progress.moveLearner(from, into);
    await this.progress.deleteLearner(from);
    this.log.log(`Merged anonymous learner into account learner ${into}`);
  }

  private async issue(user: User, familyId: string, now: Date): Promise<AuthSession> {
    const refreshToken = newRefreshToken();
    await this.store.addRefreshToken({
      id: randomUUID(),
      userId: user.id,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(now.getTime() + REFRESH_TTL_DAYS * 24 * 60 * MINUTE).toISOString(),
      rotatedAt: null,
      revokedAt: null,
      createdAt: now.toISOString(),
    });
    return {
      accessToken: await this.tokens.sign({ userId: user.id, learnerId: user.learnerId }, now),
      expiresIn: ACCESS_TOKEN_SECONDS,
      refreshToken,
      user: { id: user.id, email: user.email },
      learnerId: user.learnerId,
    };
  }
}
