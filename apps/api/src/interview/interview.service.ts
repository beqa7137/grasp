import { ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { ErasureStore } from '../persistence/erasure.stores.js';
import { CoordinationStore, InterviewStore, ProgressStore } from '../persistence/stores.js';
import { Interviewer } from './interviewer.js';
import type { CodeSnapshot, InterviewSession, InterviewTrack, PublicInterviewSession, TokenUsage } from './interview.types.js';
import { addUsage } from './pricing.js';
import { PROBLEMS, pickProblem } from './problems.js';
import { SpendGuard } from './spend-guard.js';

const HOUR_MS = 3_600_000;
/**
 * Upper bound on one reply or scoring call, retries included. The lease is released as soon as the call
 * ends; the expiry only matters if an instance dies mid-call, and then frees the session after this long.
 */
const SESSION_LEASE_MS = 15 * 60_000;

export const interviewEventId = (sessionId: string) => `interview-${sessionId}`;
const MAX_CANDIDATE_TURNS = 30;

@Injectable()
export class InterviewService {
  private readonly log = new Logger(InterviewService.name);

  constructor(
    private readonly store: InterviewStore,
    private readonly progress: ProgressStore,
    private readonly interviewer: Interviewer,
    private readonly spend: SpendGuard,
    private readonly coordination: CoordinationStore,
    private readonly erasure: ErasureStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get mode() {
    return this.interviewer.mode;
  }

  catalog() {
    return PROBLEMS.map(({ id, track, title, patternIds }) => ({ id, track, title, patternIds }));
  }

  async start(learnerId: string, track: InterviewTrack, problemId?: string): Promise<PublicInterviewSession> {
    const problem = pickProblem(track, problemId);
    if (!problem) throw new NotFoundException('Unknown problem for this track');
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
    };
    await this.store.save(session);
    return this.toPublic(session);
  }

  async get(learnerId: string, id: string): Promise<PublicInterviewSession> {
    return this.toPublic(await this.load(learnerId, id));
  }

  async recent(learnerId: string) {
    return (await this.store.recent(learnerId, 20)).map((s) => this.toPublic(s));
  }

  /** Appends the candidate turn, streams the interviewer's reply through onDelta, and persists both. */
  async respond(
    learnerId: string,
    id: string,
    input: { content: string; hint: boolean; code?: CodeSnapshot },
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ) {
    return this.exclusive(id, async () => {
      const session = await this.load(learnerId, id);
      if (session.status !== 'active') throw new ConflictException('Interview already scored');
      if (session.messages.filter((m) => m.role === 'candidate').length >= MAX_CANDIDATE_TURNS) {
        throw new ConflictException('Turn limit reached: end the interview to get your scorecard');
      }
      await this.spend.assertAvailable();
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

      const reply = await this.interviewer.reply(session, onDelta, signal);
      await this.track(session, reply.usage ? [reply.usage] : []);
      await this.erasure.assertActive(learnerId);
      const message = { role: 'interviewer' as const, content: reply.text, at: new Date().toISOString() };
      session.messages.push(message);
      await this.store.save(session);
      return message;
    });
  }

  async score(learnerId: string, id: string): Promise<PublicInterviewSession> {
    return this.exclusive(id, async () => {
      const session = await this.load(learnerId, id);
      if (session.scorecard) return this.toPublic(session);
      await this.spend.assertAvailable();
      await this.consumeQuota(learnerId);
      const result = await this.interviewer.score(session);
      await this.track(session, result.usage ?? []);
      await this.erasure.assertActive(learnerId);
      session.scorecard = result.scorecard;
      session.status = 'scored';
      session.scoredAt = new Date().toISOString();
      await this.store.save(session);
      if (session.usage) {
        const u = session.usage;
        this.log.log(
          `Interview ${session.id} scored (${session.track}, ${result.scorecard.mode}): ${u.calls} calls, ` +
            `${u.inputTokens} in / ${u.cacheReadTokens} cached / ${u.cacheWriteTokens} cache-write / ${u.outputTokens} out, ` +
            `$${u.costUsd?.toFixed(4) ?? 'n/a'}`,
        );
      }
      // Weak patterns feed the learner's review schedule. The id is deterministic so the client's copy dedupes.
      await this.progress.append(learnerId, [
        {
          id: interviewEventId(session.id),
          at: session.scoredAt,
          type: 'interview.scored',
          sessionId: session.id,
          track: session.track,
          verdict: session.scorecard.verdict,
          weakPatterns: session.scorecard.weakPatterns,
        },
      ]);
      return this.toPublic(session);
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
        this.log.warn(`Could not release the lease on ${sessionId}; it expires on its own: ${String(error)}`);
      });
    }
  }

  private async track(session: InterviewSession, usage: TokenUsage[]) {
    for (const u of usage) {
      session.usage = addUsage(session.usage, u);
      await this.spend.record(u.costUsd);
    }
  }

  private async load(learnerId: string, id: string) {
    const session = await this.store.get(learnerId, id);
    if (!session) throw new NotFoundException('Interview not found');
    return session;
  }

  /** Fixed hourly windows: a learner gets `interviewMessagesPerHour` model calls per clock hour. */
  private async consumeQuota(learnerId: string) {
    const taken = await this.coordination.take(`interview-quota:${learnerId}`, HOUR_MS, this.config.interviewMessagesPerHour);
    if (!taken) throw new HttpException('Interview rate limit reached, try again later', HttpStatus.TOO_MANY_REQUESTS);
  }

  private toPublic(s: InterviewSession): PublicInterviewSession {
    const { learnerId: _l, usage: _u, problem, ...rest } = s;
    return {
      ...rest,
      problem: { id: problem.id, title: problem.title, track: problem.track, patternIds: problem.patternIds },
      mode: this.interviewer.mode,
    };
  }
}
