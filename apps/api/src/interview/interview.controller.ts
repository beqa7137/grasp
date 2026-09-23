import { Body, Controller, Get, HttpException, Logger, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { LearnerId } from '../common/learner-id.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { InterviewService } from './interview.service.js';

const startSchema = z.object({
  track: z.enum(['coding', 'system-design']),
  problemId: z.string().max(64).optional(),
});

const messageSchema = z
  .object({ content: z.string().max(4000).default(''), hint: z.boolean().default(false) })
  .refine((m) => m.hint || m.content.trim().length > 0, 'Message cannot be empty');

@Controller('interview')
export class InterviewController {
  private readonly log = new Logger(InterviewController.name);

  constructor(private readonly interviews: InterviewService) {}

  @Get('problems')
  problems() {
    return { mode: this.interviews.mode, problems: this.interviews.catalog() };
  }

  @Get('sessions')
  recent(@LearnerId() learnerId: string) {
    return this.interviews.recent(learnerId);
  }

  @Post('sessions')
  start(@LearnerId() learnerId: string, @Body(new ZodValidationPipe(startSchema)) body: z.infer<typeof startSchema>) {
    return this.interviews.start(learnerId, body.track, body.problemId);
  }

  @Get('sessions/:id')
  get(@LearnerId() learnerId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.get(learnerId, id);
  }

  /** Streams the interviewer's reply as Server-Sent Events: `delta` chunks, then `done` (or `error`). */
  @Post('sessions/:id/messages')
  async message(
    @LearnerId() learnerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(messageSchema)) body: z.infer<typeof messageSchema>,
    @Res() res: Response,
  ) {
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    let started = false;
    const emit = (event: string, data: unknown) => {
      if (!started) {
        res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        started = true;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const message = await this.interviews.respond(learnerId, id, body, (text) => emit('delta', { text }), abort.signal);
      emit('done', { message });
    } catch (err) {
      const status = err instanceof HttpException ? err.getStatus() : 502;
      const msg = err instanceof HttpException ? err.message : 'The interviewer is unavailable right now. Please try again.';
      if (!(err instanceof HttpException)) this.log.error(err);
      if (started) emit('error', { status, message: msg });
      else res.status(status).json({ statusCode: status, message: msg });
    }
    res.end();
  }

  @Post('sessions/:id/score')
  score(@LearnerId() learnerId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.score(learnerId, id);
  }
}
