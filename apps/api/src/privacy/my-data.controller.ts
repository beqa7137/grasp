import { Controller, Delete, Get, Header, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LearnerId } from '../common/learner-id.decorator.js';
import { AuthStore, FeedbackStore, InterviewStore, ProgressStore } from '../persistence/stores.js';

/** Self-service export and erasure of everything stored for the calling learner, including their account. */
@Controller('me')
export class MyDataController {
  constructor(
    private readonly progress: ProgressStore,
    private readonly interviews: InterviewStore,
    private readonly feedback: FeedbackStore,
    private readonly auth: AuthStore,
  ) {}

  @Get('export')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Disposition', 'attachment; filename="grasp-data.json"')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  async export(@LearnerId() learnerId: string) {
    const [events, interviews, feedback, account] = await Promise.all([
      this.progress.list(learnerId),
      this.interviews.recent(learnerId, 1_000),
      this.feedback.list(learnerId),
      this.auth.userByLearner(learnerId),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      learnerId,
      account: account ? { email: account.email, createdAt: account.createdAt, lastLoginAt: account.lastLoginAt } : null,
      events,
      interviews: interviews.map(({ problem, ...session }) => ({ ...session, problem: { id: problem.id, title: problem.title } })),
      feedback: feedback.map(({ learnerId: _l, ...entry }) => entry),
    };
  }

  @Delete()
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  async erase(@LearnerId() learnerId: string) {
    await this.feedback.deleteLearner(learnerId);
    await this.interviews.deleteLearner(learnerId);
    await this.auth.deleteByLearner(learnerId);
    await this.progress.deleteLearner(learnerId);
  }
}
