import { ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { InterviewStore, ProgressStore } from '../persistence/stores.js';
import { Interviewer } from './interviewer.js';
import type { InterviewSession, InterviewTrack, PublicInterviewSession } from './interview.types.js';
import { PROBLEMS, pickProblem } from './problems.js';

const HOUR_MS = 3_600_000;

export const interviewEventId = (sessionId: string) => `interview-${sessionId}`;
const MAX_CANDIDATE_TURNS = 30;

@Injectable()
export class InterviewService {
  private readonly usage = new Map<string, number[]>();

  constructor(
    private readonly store: InterviewStore,
    private readonly progress: ProgressStore,
    private readonly interviewer: Interviewer,
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
    input: { content: string; hint: boolean },
    onDelta: (text: string) => void,
    signal: AbortSignal,
  ) {
    const session = await this.load(learnerId, id);
    if (session.status !== 'active') throw new ConflictException('Interview already scored');
    if (session.messages.filter((m) => m.role === 'candidate').length >= MAX_CANDIDATE_TURNS) {
      throw new ConflictException('Turn limit reached — end the interview to get your scorecard');
    }
    this.consumeQuota(learnerId);

    session.messages.push({
      role: 'candidate',
      content: input.hint && !input.content.trim() ? 'Could I get a hint?' : input.content.trim(),
      at: new Date().toISOString(),
      ...(input.hint ? { hint: true } : {}),
    });
    if (input.hint) session.hintsUsed += 1;

    const reply = await this.interviewer.reply(session, onDelta, signal);
    const message = { role: 'interviewer' as const, content: reply, at: new Date().toISOString() };
    session.messages.push(message);
    await this.store.save(session);
    return message;
  }

  async score(learnerId: string, id: string): Promise<PublicInterviewSession> {
    const session = await this.load(learnerId, id);
    if (session.scorecard) return this.toPublic(session);
    this.consumeQuota(learnerId);
    session.scorecard = await this.interviewer.score(session);
    session.status = 'scored';
    session.scoredAt = new Date().toISOString();
    await this.store.save(session);
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
  }

  private async load(learnerId: string, id: string) {
    const session = await this.store.get(learnerId, id);
    if (!session) throw new NotFoundException('Interview not found');
    return session;
  }

  private consumeQuota(learnerId: string) {
    const now = Date.now();
    const recent = (this.usage.get(learnerId) ?? []).filter((t) => now - t < HOUR_MS);
    if (recent.length >= this.config.interviewMessagesPerHour) {
      throw new HttpException('Interview rate limit reached, try again later', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.usage.set(learnerId, recent);
  }

  private toPublic(s: InterviewSession): PublicInterviewSession {
    const { learnerId: _l, problem, ...rest } = s;
    return {
      ...rest,
      problem: { id: problem.id, title: problem.title, track: problem.track, patternIds: problem.patternIds },
      mode: this.interviewer.mode,
    };
  }
}
