import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { InterviewScoredEvent, StoredEvent } from '@grasp/engine';
import type { LearnerEvent } from '../admin/cohort-metrics.js';
import type { AuthIdentity, OneTimePurpose, OneTimeRecord, Provider, RefreshTokenRecord, User } from '../auth/auth.types.js';
import type { AccessClaims } from '../auth/tokens.js';
import type { FeedbackEntry } from '../feedback/feedback.types.js';
import type { InterviewSession } from '../interview/interview.types.js';
import { completedScore, scoredEvent } from '../interview/score-completion.js';
import { MemoryLearnerState } from './erasure.stores.js';
import { learnerMoved } from './learner-errors.js';
import {
  AuthStore,
  CoordinationStore,
  FeedbackStore,
  InterviewStore,
  ProgressStore,
  TOKEN_SWEEP_GRACE_MS,
  type AppendResult,
  type FeedbackCursor,
  type ReceivedEvents,
  type WindowTotal,
} from './stores.js';

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const newestFirst = (a: FeedbackCursor, b: FeedbackCursor) => compare(b.createdAt, a.createdAt) || compare(b.id, a.id);

interface Received {
  event: StoredEvent;
  at: number;
}

@Injectable()
export class MemoryProgressStore extends ProgressStore {
  private readonly events = new Map<string, Map<string, Received>>();

  constructor(private readonly learnerState = new MemoryLearnerState()) {
    super();
  }

  async append(learnerId: string, events: StoredEvent[]): Promise<AppendResult> {
    this.learnerState.assertActive(learnerId);
    const log = this.log(learnerId);
    let accepted = 0;
    for (const event of events) {
      if (log.has(event.id)) continue;
      log.set(event.id, { event, at: Date.now() });
      accepted++;
    }
    return { accepted, duplicates: events.length - accepted };
  }

  insertScoreEvent(learnerId: string, event: InterviewScoredEvent): void {
    this.learnerState.assertActive(learnerId);
    const log = this.log(learnerId);
    if (!log.has(event.id)) log.set(event.id, { event: structuredClone(event), at: Date.now() });
  }

  private log(learnerId: string) {
    const log = this.events.get(learnerId) ?? new Map<string, Received>();
    this.events.set(learnerId, log);
    return log;
  }

  async list(learnerId: string): Promise<StoredEvent[]> {
    return [...(this.events.get(learnerId)?.values() ?? [])].map(({ event }) => event);
  }

  async listReceivedAfter(learnerId: string, after: Date | null): Promise<ReceivedEvents> {
    const events: StoredEvent[] = [];
    let latest: number | null = null;
    for (const { event, at } of this.events.get(learnerId)?.values() ?? []) {
      if (after && at <= after.getTime()) continue;
      events.push(event);
      latest = Math.max(latest ?? at, at);
    }
    return { events, latest: latest === null ? null : new Date(latest).toISOString() };
  }

  async all(): Promise<LearnerEvent[]> {
    return [...this.events].flatMap(([learnerId, log]) => [...log.values()].map(({ event }) => ({ learnerId, event })));
  }

  async deleteLearner(learnerId: string): Promise<void> {
    this.events.delete(learnerId);
  }

  async moveLearner(from: string, to: string): Promise<void> {
    this.learnerState.assertActive(to);
    await this.append(to, await this.list(from));
    this.events.delete(from);
  }
}

@Injectable()
export class MemoryInterviewStore extends InterviewStore {
  private readonly sessions = new Map<string, InterviewSession>();

  constructor(
    private readonly learnerState = new MemoryLearnerState(),
    private readonly progress = new MemoryProgressStore(learnerState),
  ) {
    super();
  }

  async save(session: InterviewSession): Promise<void> {
    this.learnerState.assertActive(session.learnerId);
    const existing = this.sessions.get(session.id);
    if (existing && existing.learnerId !== session.learnerId) throw learnerMoved();
    if (existing?.status === 'scored') throw new ConflictException('Interview already scored');
    this.sessions.set(session.id, structuredClone(session));
  }

  async completeScore(candidate: InterviewSession): Promise<InterviewSession> {
    return this.learnerState.exclusive(async () => {
      this.learnerState.assertActive(candidate.learnerId);
      const stored = this.sessions.get(candidate.id);
      if (!stored) throw new NotFoundException('Interview not found');
      if (stored.learnerId !== candidate.learnerId) throw learnerMoved();

      const result = structuredClone(completedScore(stored, candidate));
      this.progress.insertScoreEvent(result.learnerId, scoredEvent(result));
      if (stored.status === 'active') this.sessions.set(result.id, result);
      return structuredClone(result);
    });
  }

  async get(learnerId: string, id: string): Promise<InterviewSession | null> {
    const s = this.sessions.get(id);
    return s && s.learnerId === learnerId ? structuredClone(s) : null;
  }

  async recent(learnerId: string, limit: number): Promise<InterviewSession[]> {
    return [...this.sessions.values()]
      .filter((s) => s.learnerId === learnerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((s) => structuredClone(s));
  }

  async all(): Promise<InterviewSession[]> {
    return [...this.sessions.values()].map((s) => structuredClone(s));
  }

  async deleteLearner(learnerId: string): Promise<void> {
    for (const [id, s] of this.sessions) if (s.learnerId === learnerId) this.sessions.delete(id);
  }

  async moveLearner(from: string, to: string): Promise<void> {
    this.learnerState.assertActive(to);
    for (const s of this.sessions.values()) if (s.learnerId === from) s.learnerId = to;
  }
}

@Injectable()
export class MemoryFeedbackStore extends FeedbackStore {
  private readonly entries: FeedbackEntry[] = [];

  constructor(private readonly learnerState = new MemoryLearnerState()) {
    super();
  }

  async add(entry: FeedbackEntry): Promise<void> {
    this.learnerState.assertActive(entry.learnerId);
    this.entries.push(structuredClone(entry));
  }

  async list(learnerId: string): Promise<FeedbackEntry[]> {
    return this.entries.filter((e) => e.learnerId === learnerId).map((e) => structuredClone(e));
  }

  async all(): Promise<FeedbackEntry[]> {
    return this.entries.map((e) => structuredClone(e));
  }

  async page(limit: number, before: FeedbackCursor | null): Promise<FeedbackEntry[]> {
    return this.entries
      .filter((e) => !before || newestFirst(before, e) < 0)
      .sort(newestFirst)
      .slice(0, limit)
      .map((e) => structuredClone(e));
  }

  async deleteLearner(learnerId: string): Promise<void> {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i].learnerId === learnerId) this.entries.splice(i, 1);
  }

  async moveLearner(from: string, to: string): Promise<void> {
    this.learnerState.assertActive(to);
    for (const e of this.entries) if (e.learnerId === from) e.learnerId = to;
  }
}

@Injectable()
export class MemoryAuthStore extends AuthStore {
  private readonly users = new Map<string, User>();
  private readonly identities = new Map<string, AuthIdentity>();
  private readonly oneTime = new Map<string, OneTimeRecord>();
  private readonly tokens = new Map<string, RefreshTokenRecord>();
  private readonly families = new Map<string, { userId: string; revokedAt: string | null }>();

  constructor(private readonly learnerState?: MemoryLearnerState) {
    super();
  }

  async userByEmail(email: string): Promise<User | null> {
    return copy([...this.users.values()].find((u) => u.email === email));
  }

  async userById(id: string): Promise<User | null> {
    return copy(this.users.get(id));
  }

  async userByLearner(learnerId: string): Promise<User | null> {
    return copy([...this.users.values()].find((u) => u.learnerId === learnerId));
  }

  async createUser(user: User, identity?: AuthIdentity): Promise<boolean> {
    this.learnerState?.assertActive(user.learnerId);
    if ([...this.users.values()].some((u) => u.email === user.email)) return false;
    if (identity && this.identities.has(identityKey(identity.provider, identity.subject))) return false;
    this.users.set(user.id, { ...user });
    if (identity) this.identities.set(identityKey(identity.provider, identity.subject), { ...identity });
    return true;
  }

  async touchLogin(userId: string, at: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) user.lastLoginAt = at;
  }

  async deleteByLearner(learnerId: string): Promise<void> {
    for (const [id, user] of this.users) {
      if (user.learnerId !== learnerId) continue;
      this.users.delete(id);
      for (const [tokenId, token] of this.tokens) if (token.userId === id) this.tokens.delete(tokenId);
      for (const [familyId, family] of this.families) if (family.userId === id) this.families.delete(familyId);
      for (const [key, identity] of this.identities) if (identity.userId === id) this.identities.delete(key);
    }
  }

  async identity(provider: Provider, subject: string): Promise<AuthIdentity | null> {
    return copy(this.identities.get(identityKey(provider, subject)));
  }

  async linkIdentity(identity: AuthIdentity): Promise<AuthIdentity> {
    const key = identityKey(identity.provider, identity.subject);
    if (!this.identities.has(key)) this.identities.set(key, { ...identity });
    return { ...this.identities.get(key)! };
  }

  async touchIdentity(id: string, email: string | null, at: string): Promise<void> {
    const identity = [...this.identities.values()].find((i) => i.id === id);
    if (!identity) return;
    identity.lastLoginAt = at;
    if (email) identity.email = email;
  }

  async identitiesForUser(userId: string): Promise<AuthIdentity[]> {
    return [...this.identities.values()]
      .filter((i) => i.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((i) => ({ ...i }));
  }

  async addOneTime(record: OneTimeRecord): Promise<void> {
    this.oneTime.set(record.hash, structuredClone(record));
  }

  async consumeOneTime(hash: string, purpose: OneTimePurpose, at: string): Promise<OneTimeRecord | null> {
    const record = this.oneTime.get(hash);
    if (!record || record.purpose !== purpose || record.consumedAt || record.expiresAt <= at) return null;
    record.consumedAt = at;
    return structuredClone(record);
  }

  async sweepExpired(): Promise<number> {
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - TOKEN_SWEEP_GRACE_MS).toISOString();
    let removed = 0;
    for (const [hash, record] of this.oneTime) if (record.expiresAt < now && this.oneTime.delete(hash)) removed++;
    const swept = new Set<string>();
    for (const [id, token] of this.tokens) {
      if (token.expiresAt >= cutoff) continue;
      this.tokens.delete(id);
      swept.add(token.familyId);
      removed++;
    }
    const live = new Set([...this.tokens.values()].filter((t) => t.expiresAt >= cutoff).map((t) => t.familyId));
    for (const familyId of swept) if (!live.has(familyId) && this.families.delete(familyId)) removed++;
    return removed;
  }

  async createFamily(userId: string, familyId: string, _at: string): Promise<boolean> {
    if (!this.users.has(userId) || this.families.has(familyId)) return false;
    this.families.set(familyId, { userId, revokedAt: null });
    return true;
  }

  async activeFamily(userId: string, learnerId: string, familyId: string): Promise<boolean> {
    const family = this.families.get(familyId);
    return family?.userId === userId && !family.revokedAt && this.users.get(userId)?.learnerId === learnerId;
  }

  async addRefreshToken(token: RefreshTokenRecord): Promise<boolean> {
    const family = this.families.get(token.familyId);
    if (family?.userId !== token.userId || family.revokedAt) return false;
    this.tokens.set(token.id, { ...token });
    return true;
  }

  async refreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const token = [...this.tokens.values()].find((t) => t.tokenHash === tokenHash);
    return token ? { ...token } : null;
  }

  async markRotated(id: string, at: string): Promise<void> {
    const token = this.tokens.get(id);
    if (token && !token.rotatedAt) token.rotatedAt = at;
  }

  async revokeFamily(familyId: string, at: string): Promise<void> {
    const family = this.families.get(familyId);
    if (family && !family.revokedAt) family.revokedAt = at;
    for (const token of this.tokens.values()) if (token.familyId === familyId && !token.revokedAt) token.revokedAt = at;
  }
}

const copy = <T extends object>(value: T | undefined): T | null => (value ? { ...value } : null);
const identityKey = (provider: Provider, subject: string) => `${provider}:${subject}`;

/** Single-process coordination: correct for one instance, which is all the in-memory mode supports anyway. */
export class MemoryCoordinationStore extends CoordinationStore {
  private readonly windows = new Map<string, { start: number; total: number; expiresAt: number }>();
  private readonly leases = new Map<string, { holder: string; expiresAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly auth?: AuthStore,
  ) {
    super();
  }

  async add(key: string, windowMs: number, amount: number, retainMs = 0): Promise<WindowTotal> {
    const w = this.current(key, windowMs, retainMs);
    w.total += amount;
    return { total: w.total, resetsInMs: w.start + windowMs - this.now() };
  }

  async addForSession(key: string, windowMs: number, amount: number, claims: AccessClaims): Promise<WindowTotal | null> {
    if (!this.auth || !(await this.auth.activeFamily(claims.userId, claims.learnerId, claims.familyId))) return null;
    return this.add(key, windowMs, amount);
  }

  async take(key: string, windowMs: number, limit: number): Promise<WindowTotal | null> {
    const w = this.current(key, windowMs, 0);
    if (w.total >= limit) return null;
    w.total += 1;
    return { total: w.total, resetsInMs: w.start + windowMs - this.now() };
  }

  async read(key: string, windowMs: number): Promise<number> {
    const start = windowStart(this.now(), windowMs);
    const w = this.windows.get(key);
    return w && w.start === start ? w.total : 0;
  }

  async acquireLease(key: string, holder: string, ttlMs: number): Promise<boolean> {
    const lease = this.leases.get(key);
    if (lease && lease.expiresAt > this.now() && lease.holder !== holder) return false;
    this.leases.set(key, { holder, expiresAt: this.now() + ttlMs });
    return true;
  }

  async releaseLease(key: string, holder: string): Promise<void> {
    if (this.leases.get(key)?.holder === holder) this.leases.delete(key);
  }

  async sweep(): Promise<number> {
    const now = this.now();
    let removed = 0;
    for (const [key, w] of this.windows) if (w.expiresAt <= now && this.windows.delete(key)) removed++;
    for (const [key, l] of this.leases) if (l.expiresAt <= now && this.leases.delete(key)) removed++;
    return removed;
  }

  private current(key: string, windowMs: number, retainMs: number) {
    const start = windowStart(this.now(), windowMs);
    let w = this.windows.get(key);
    if (!w || w.start !== start) {
      w = { start, total: 0, expiresAt: start + windowMs + retainMs };
      this.windows.set(key, w);
    }
    return w;
  }
}

export const windowStart = (at: number, windowMs: number) => Math.floor(at / windowMs) * windowMs;
