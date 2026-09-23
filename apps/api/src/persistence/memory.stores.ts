import { Injectable } from '@nestjs/common';
import type { StoredEvent } from '@grasp/engine';
import type { LearnerEvent } from '../admin/cohort-metrics.js';
import type { LoginCode, RefreshTokenRecord, User } from '../auth/auth.types.js';
import type { FeedbackEntry } from '../feedback/feedback.types.js';
import type { InterviewSession } from '../interview/interview.types.js';
import { AuthStore, FeedbackStore, InterviewStore, ProgressStore, type AppendResult } from './stores.js';

@Injectable()
export class MemoryProgressStore extends ProgressStore {
  private readonly events = new Map<string, Map<string, StoredEvent>>();

  async append(learnerId: string, events: StoredEvent[]): Promise<AppendResult> {
    const log = this.events.get(learnerId) ?? new Map<string, StoredEvent>();
    this.events.set(learnerId, log);
    let accepted = 0;
    for (const e of events) {
      if (log.has(e.id)) continue;
      log.set(e.id, e);
      accepted++;
    }
    return { accepted, duplicates: events.length - accepted };
  }

  async list(learnerId: string): Promise<StoredEvent[]> {
    return [...(this.events.get(learnerId)?.values() ?? [])];
  }

  async all(): Promise<LearnerEvent[]> {
    return [...this.events].flatMap(([learnerId, log]) => [...log.values()].map((event) => ({ learnerId, event })));
  }

  async deleteLearner(learnerId: string): Promise<void> {
    this.events.delete(learnerId);
  }

  async moveLearner(from: string, to: string): Promise<void> {
    await this.append(to, [...(this.events.get(from)?.values() ?? [])]);
    this.events.delete(from);
  }
}

@Injectable()
export class MemoryInterviewStore extends InterviewStore {
  private readonly sessions = new Map<string, InterviewSession>();

  async save(session: InterviewSession): Promise<void> {
    this.sessions.set(session.id, structuredClone(session));
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
    for (const s of this.sessions.values()) if (s.learnerId === from) s.learnerId = to;
  }
}

@Injectable()
export class MemoryFeedbackStore extends FeedbackStore {
  private readonly entries: FeedbackEntry[] = [];

  async add(entry: FeedbackEntry): Promise<void> {
    this.entries.push(structuredClone(entry));
  }

  async list(learnerId: string): Promise<FeedbackEntry[]> {
    return this.entries.filter((e) => e.learnerId === learnerId).map((e) => structuredClone(e));
  }

  async all(): Promise<FeedbackEntry[]> {
    return this.entries.map((e) => structuredClone(e));
  }

  async deleteLearner(learnerId: string): Promise<void> {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i].learnerId === learnerId) this.entries.splice(i, 1);
  }

  async moveLearner(from: string, to: string): Promise<void> {
    for (const e of this.entries) if (e.learnerId === from) e.learnerId = to;
  }
}

@Injectable()
export class MemoryAuthStore extends AuthStore {
  private readonly codes: LoginCode[] = [];
  private readonly users = new Map<string, User>();
  private readonly tokens = new Map<string, RefreshTokenRecord>();

  async addCode(code: LoginCode): Promise<void> {
    this.codes.push({ ...code });
  }

  async countCodesSince(email: string, since: string): Promise<number> {
    return this.codes.filter((c) => c.email === email && c.createdAt >= since).length;
  }

  async latestCode(email: string): Promise<LoginCode | null> {
    const code = this.codes.filter((c) => c.email === email && !c.consumedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return code ? { ...code } : null;
  }

  async updateCode(id: string, patch: Partial<Pick<LoginCode, 'attempts' | 'consumedAt'>>): Promise<void> {
    const code = this.codes.find((c) => c.id === id);
    if (code) Object.assign(code, patch);
  }

  async userByEmail(email: string): Promise<User | null> {
    return this.copy([...this.users.values()].find((u) => u.email === email));
  }

  async userById(id: string): Promise<User | null> {
    return this.copy(this.users.get(id));
  }

  async userByLearner(learnerId: string): Promise<User | null> {
    return this.copy([...this.users.values()].find((u) => u.learnerId === learnerId));
  }

  async createUser(user: User): Promise<void> {
    this.users.set(user.id, { ...user });
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
    }
  }

  async addRefreshToken(token: RefreshTokenRecord): Promise<void> {
    this.tokens.set(token.id, { ...token });
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
    for (const token of this.tokens.values()) if (token.familyId === familyId && !token.revokedAt) token.revokedAt = at;
  }

  private copy(user: User | undefined): User | null {
    return user ? { ...user } : null;
  }
}
