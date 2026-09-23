import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { LearnerId } from '../common/learner-id.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { appendEventsSchema, type AppendEventsDto } from './progress.schema.js';
import { ProgressService } from './progress.service.js';

@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

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
  events(@LearnerId() learnerId: string) {
    return this.progress.events(learnerId);
  }
}
