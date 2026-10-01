import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SkipIdentity } from '../auth/identity.guard.js';
import { SkipRateLimit } from '../common/rate-limit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MetricsStore } from '../persistence/metrics.store.js';
import { FeedbackStore, type FeedbackCursor } from '../persistence/stores.js';
import { AdminGuard } from './admin.guard.js';

export const FEEDBACK_PAGE_MAX = 200;

const cursorSchema = z.tuple([z.iso.datetime(), z.uuid()]);
const encodeCursor = ({ createdAt, id }: FeedbackCursor) => Buffer.from(JSON.stringify([createdAt, id])).toString('base64url');

const feedbackPageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(FEEDBACK_PAGE_MAX).default(50),
  before: z
    .string()
    .max(200)
    .transform((value, ctx): FeedbackCursor => {
      try {
        const [createdAt, id] = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
        return { createdAt, id };
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Unknown cursor' });
        return z.NEVER;
      }
    })
    .optional(),
});

@SkipRateLimit()
@SkipIdentity()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly metricsStore: MetricsStore,
    private readonly feedback: FeedbackStore,
  ) {}

  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  async metrics() {
    return this.metricsStore.cohort(new Date());
  }

  /** Newest first; `next` asks for the following page and is null on the last. */
  @Get('feedback')
  @Header('Cache-Control', 'no-store')
  async feedbackPage(@Query(new ZodValidationPipe(feedbackPageSchema)) query: z.infer<typeof feedbackPageSchema>) {
    const entries = await this.feedback.page(query.limit + 1, query.before ?? null);
    const page = entries.slice(0, query.limit);
    return { entries: page, next: entries.length > query.limit ? encodeCursor(page.at(-1)!) : null };
  }
}
