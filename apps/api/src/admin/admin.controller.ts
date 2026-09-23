import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { FeedbackStore, InterviewStore, ProgressStore } from '../persistence/stores.js';
import { AdminGuard } from './admin.guard.js';
import { cohortMetrics } from './cohort-metrics.js';

@SkipThrottle()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly progress: ProgressStore,
    private readonly interviews: InterviewStore,
    private readonly feedback: FeedbackStore,
  ) {}

  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  async metrics() {
    const [events, sessions, feedback] = await Promise.all([this.progress.all(), this.interviews.all(), this.feedback.all()]);
    return cohortMetrics(events, sessions, feedback);
  }

  @Get('feedback')
  @Header('Cache-Control', 'no-store')
  async allFeedback() {
    return (await this.feedback.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
