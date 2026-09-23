import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LearnerId } from '../common/learner-id.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FeedbackStore } from '../persistence/stores.js';
import { FEEDBACK_KINDS } from './feedback.types.js';

const feedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(1).max(2000),
  rating: z.number().int().min(1).max(5).nullable().default(null),
  context: z.object({
    route: z.string().max(200),
    release: z.string().max(64).nullable().default(null),
    platform: z.string().max(20),
  }),
});

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly store: FeedbackStore) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  async submit(@LearnerId() learnerId: string, @Body(new ZodValidationPipe(feedbackSchema)) body: z.infer<typeof feedbackSchema>) {
    const entry = { id: randomUUID(), learnerId, createdAt: new Date().toISOString(), ...body };
    await this.store.add(entry);
    return { id: entry.id };
  }
}
