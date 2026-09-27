import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { tokenInvalid } from '../auth/auth-errors.js';
import type { AccessClaims } from '../auth/tokens.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { safeErrorDetails } from '../observability/safe-error.js';
import { ErasureStore } from '../persistence/erasure.stores.js';
import { AuthStore, CoordinationStore, InterviewStore } from '../persistence/stores.js';
import { Interviewer } from './interviewer.js';
import type {
  AiAccess,
  CodeSnapshot,
  InterviewMode,
  InterviewSession,
  InterviewTrack,
  PublicInterviewSession,
  TokenUsage,
} from './interview.types.js';
import { OfflineInterviewer } from './offline.interviewer.js';
import { addUsage } from './pricing.js';
import { PROBLEMS, pickProblem } from './problems.js';

const HOUR_MS = 3_600_000;
/**
 * Upper bound on one reply or scoring call, retries included. The lease is released as soon as the call
 * ends; the expiry only matters if an instance dies mid-call, and then frees the session after this long.
 */
const SESSION_LEASE_MS = 15 * 60_000;

const MAX_CANDIDATE_TURNS = 30;

@Injectable()
export class InterviewService {
  private readonly log = new Logger(InterviewService.name);

  constructor(
    private readonly store: InterviewStore,
    private readonly interviewer: Interviewer,
    private readonly offline: OfflineInterviewer,
    private readonly coordination: CoordinationStore,
    private readonly erasure: ErasureStore,
    private readonly auth: AuthStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  aiAccess(userId: string | null): AiAccess {
    if (this.interviewer.mode !== 'ai') return 'unavailable';
    return userId ? 'available' : 'sign-in-required';
  }

  catalog() {
    return PROBLEMS.map(({ id, track, title, patternIds }) => ({ id, track, title, patternIds }));
  }

  async start(
    learnerId: string,
    track: InterviewTrack,
    problemId?: string,
    mode: InterviewMode = 'offline',
    claims?: AccessClaims,
  ): Promise<PublicInterviewSession> {
    const problem = pickProblem(track, problemId);
    if (!problem) throw new NotFoundException('Unknown problem for this track');
    await this.interviewerFor(mode, claims);
    const now = new Date().toISOString();
    const session: InterviewSession = {
      id: randomUUID(),
      learnerId,
      track,
      problem,
      messages: [{ role: 'interviewer', content: problem.opening, at: now }],
      hintsUsed: 0,
      status: 'active',
      createdAt: now,
      mode,
    };
    await this.store.save(session);
    return this.toPublic(session, claims?.userId);
  }

  async get(learnerId: string, id: string, userId?: string | null): Promise<PublicInterviewSession> {
    return this.toPublic(await this.load(learnerId, id), userId);
  }

  async recent(learnerId: string, userId?: string | null) {
    return (await this.store.recent(learnerId, 20)).map((s) => this.toPublic(s, userId));
  }

  async setMode(learnerId: string, id: string, mode: InterviewMode, claims?: AccessClaims): Promise<PublicInterviewSession> {
    return this.exclusive(id, async () => {
      const session = await this.load(learnerId, id);
      if (session.status !== 'active') throw new ConflictException('Interview already scored');
      await this.interviewerFor(mode, claims);
      session.mode = mode;
      await this.store.save(session);
      return this.toPublic(session, claims?.userId);
    });
  }

  /** Appends the candidate turn, streams the interviewer's reply through onDelta, and persists both. */
  async respond(
    learnerId: string,
    id: string,
    input: { content: string; hint: boolean; code?: CodeSnapshot },
    onDelta: (text: string) => void,
    signal: AbortSignal,
    claims?: AccessClaims,
  ) {
    return this.exclusive(id, async () => {
      const session = await this.load(learnerId, id);
      if (session.status !== 'active') throw new ConflictException('Interview already scored');
      if (session.messages.filter((m) => m.role === 'candidate').length >= MAX_CANDIDATE_TURNS) {
        throw new ConflictException('Turn limit reached: end the interview to get your scorecard');
      }
      const interviewer = await this.interviewerFor(session.mode ?? 'offline', claims);
      await this.consumeQuota(learnerId);

      const code = input.code?.source.trim() ? { language: input.code.language, source: input.code.source.replace(/\s+$/, '') } : undefined;
      session.messages.push({
        role: 'candidate',
        content: input.content.trim() || (input.hint ? 'Could I get a hint?' : 'Here is my code.'),
        at: new Date().toISOString(),
        ...(input.hint ? { hint: true } : {}),
        ...(code ? { code } : {}),
      });
      if (input.hint) session.hintsUsed += 1;

      const reply = await interviewer.reply(session, onDelta, signal);
      this.track(session, reply.usage ? [reply.usage] : []);
      await this.erasure.assertActive(learnerId);
      const message = { role: 'interviewer' as const, content: reply.text, at: new Date().toISOString() };
      session.messages.push(message);
      await this.store.save(session);
      return message;
    });
  }

  async score(learnerId: string, id: string, claims?: AccessClaims): Promise<PublicInterviewSession> {
    return this.exclusive(id, async () => {
      const session = await this.load(learnerId, id);
      if (session.scorecard || session.status === 'scored') {
        return this.toPublic(await this.store.completeScore(session), claims?.userId);
      }
      const interviewer = await this.interviewerFor(session.mode ?? 'offline', claims);
      await this.consumeQuota(learnerId);
      const result = await interviewer.score(session);
      this.track(session, result.usage ?? []);
      await this.erasure.assertActive(learnerId);
      session.scorecard = result.scorecard;
      session.status = 'scored';
      session.scoredAt = new Date().toISOString();
      return this.toPublic(await this.store.completeScore(session), claims?.userId);
    });
  }

  /** One model call per session at a time, across all instances; a second request would race the first one's save. */
  private async exclusive<T>(sessionId: string, run: () => Promise<T>): Promise<T> {
    const key = `interview-session:${sessionId}`;
    const holder = randomUUID();
    if (!(await this.coordination.acquireLease(key, holder, SESSION_LEASE_MS))) {
      throw new ConflictException('The interviewer is still working on your last message');
    }
    try {
      return await run();
    } finally {
      await this.coordination.releaseLease(key, holder).catch((error: unknown) => {
        this.log.warn({ operation: 'interview.release-lease', ...safeErrorDetails(error) });
      });
    }
  }

  private track(session: InterviewSession, usage: TokenUsage[]) {
    for (const u of usage) {
      session.usage = addUsage(session.usage, u);
    }
  }

  private async load(learnerId: string, id: string) {
    const session = await this.store.get(learnerId, id);
    if (!session) throw new NotFoundException('Interview not found');
    return session;
  }

  private async interviewerFor(mode: InterviewMode, claims?: AccessClaims): Promise<Interviewer> {
    if (mode === 'offline') return this.offline;
    if (this.interviewer.mode !== 'ai') {
      throw new ServiceUnavailableException({
        code: 'ai_unavailable',
        message: 'AI interviews are unavailable right now. You can switch to scripted practice.',
      });
    }
    if (!claims) {
      throw new ForbiddenException({
        code: 'ai_sign_in_required',
        message: 'Sign in to use the AI interviewer, or choose scripted practice.',
      });
    }
    if (!(await this.auth.activeFamily(claims.userId, claims.learnerId, claims.familyId))) throw tokenInvalid('Session ended');
    return this.interviewer;
  }

  /** Fixed hourly windows: a learner gets `interviewMessagesPerHour` model calls per clock hour. */
  private async consumeQuota(learnerId: string) {
    const taken = await this.coordination.take(`interview-quota:${learnerId}`, HOUR_MS, this.config.interviewMessagesPerHour);
    if (!taken) throw new HttpException('Interview rate limit reached, try again later', HttpStatus.TOO_MANY_REQUESTS);
  }

  private toPublic(s: InterviewSession, userId?: string | null): PublicInterviewSession {
    const { learnerId: _l, usage: _u, problem, ...rest } = s;
    return {
      ...rest,
      problem: { id: problem.id, title: problem.title, track: problem.track, patternIds: problem.patternIds },
      mode: s.mode ?? s.scorecard?.mode ?? 'offline',
      aiAccess: this.aiAccess(userId ?? null),
    };
  }
}
