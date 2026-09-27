import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { LearnerId, UserId } from '../common/learner-id.decorator.js';
import { ErasureStore } from '../persistence/erasure.stores.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { appendEventsSchema, type AppendEventsDto } from './progress.schema.js';
import { ProgressService } from './progress.service.js';

@Controller('progress')
export class ProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly erasure: ErasureStore,
  ) {}

  @Post('events')
  @HttpCode(200)
  append(@LearnerId() learnerId: string, @Body(new ZodValidationPipe(appendEventsSchema)) body: AppendEventsDto) {
    return this.progress.ingest(learnerId, body.events);
  }

  @Get()
  get(@LearnerId() learnerId: string) {
    return this.progress.snapshot(learnerId);
  }

  @Get('events')
  async events(@LearnerId() learnerId: string, @UserId() userId: string | null) {
    const result = await this.progress.events(learnerId);
    if (!userId && result.events.length === 0) await this.erasure.assertActive(learnerId);
    return result;
  }
}
