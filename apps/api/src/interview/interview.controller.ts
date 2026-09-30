import { Body, Controller, Get, HttpException, Logger, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { STAR_ANSWER_LIMIT, isEmptyDraft, starLength } from '@grasp/engine';
import { z } from 'zod';
import { LearnerId, UserId } from '../common/learner-id.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { reportError } from '../observability/error-reporting.js';
import { safeErrorDetails } from '../observability/safe-error.js';
import { databaseUnavailable, isDatabaseUnavailable } from '../persistence/database-errors.js';
import { storySchema } from '../stories/stories.schema.js';
import { InterviewService } from './interview.service.js';

const modeSchema = z.object({ mode: z.enum(['ai', 'offline']) });
const startSchema = modeSchema
  .partial()
  .extend({
    track: z.enum(['coding', 'system-design', 'behavioral']),
    problemId: z.string().max(64).optional(),
    level: z.enum(['early', 'mid', 'senior']).optional(),
  })
  .refine((s) => !s.level || s.track === 'behavioral', 'Only a behavioral interview takes a level');

const starSchema = storySchema.shape.draft
  .refine((star) => starLength(star) <= STAR_ANSWER_LIMIT, `A STAR answer is at most ${STAR_ANSWER_LIMIT} characters`)
  .refine((star) => !isEmptyDraft(star), 'The STAR answer is empty');

const messageSchema = z
  .object({
    content: z.string().max(4000).default(''),
    hint: z.boolean().default(false),
    code: z.object({ language: z.enum(['javascript', 'typescript', 'python']), source: z.string().max(20_000) }).optional(),
    star: starSchema.optional(),
  })
  .refine((m) => !(m.star && m.content.trim()), 'Send the STAR answer or a message, not both')
  .refine((m) => m.hint || m.content.trim().length > 0 || Boolean(m.code?.source.trim()) || Boolean(m.star), 'Message cannot be empty');

@Controller('interview')
export class InterviewController {
  private readonly log = new Logger(InterviewController.name);

  constructor(private readonly interviews: InterviewService) {}

  @Get('problems')
  problems(@UserId() userId: string | null) {
    return { aiAccess: this.interviews.aiAccess(userId), problems: this.interviews.catalog() };
  }

  @Get('sessions')
  recent(@LearnerId() learnerId: string, @UserId() userId: string | null) {
    return this.interviews.recent(learnerId, userId);
  }

  @Post('sessions')
  start(@LearnerId() learnerId: string, @Body(new ZodValidationPipe(startSchema)) body: z.infer<typeof startSchema>, @Req() req: Request) {
    return this.interviews.start(learnerId, body.track, body.problemId, body.mode, req.accessClaims, body.level);
  }

  @Get('sessions/:id')
  get(@LearnerId() learnerId: string, @Param('id', ParseUUIDPipe) id: string, @UserId() userId: string | null) {
    return this.interviews.get(learnerId, id, userId);
  }

  @Post('sessions/:id/mode')
  setMode(
    @LearnerId() learnerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(modeSchema)) body: z.infer<typeof modeSchema>,
    @Req() req: Request,
  ) {
    return this.interviews.setMode(learnerId, id, body.mode, req.accessClaims);
  }

  /** Streams the interviewer's reply as Server-Sent Events: `delta` chunks, then `done` (or `error`). */
  @Post('sessions/:id/messages')
  async message(
    @LearnerId() learnerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(messageSchema)) body: z.infer<typeof messageSchema>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    let started = false;
    const emit = (event: string, data: unknown) => {
      if (!started) {
        res.status(200).set({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
        started = true;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const message = await this.interviews.respond(learnerId, id, body, (text) => emit('delta', { text }), abort.signal, req.accessClaims);
      emit('done', { message });
    } catch (err) {
      if (abort.signal.aborted) return void res.end();
      const failure = isDatabaseUnavailable(err) ? databaseUnavailable() : err;
      const status = failure instanceof HttpException ? failure.getStatus() : 502;
      const msg = failure instanceof HttpException ? failure.message : 'The interviewer is unavailable right now. Please try again.';
      const response = failure instanceof HttpException ? failure.getResponse() : null;
      const code = response && typeof response === 'object' && 'code' in response ? { code: response.code } : {};
      if (!(failure instanceof HttpException)) this.log.error({ operation: 'interview.respond', ...safeErrorDetails(err) });
      if (status >= 500 && status !== 503) reportError(err, req.id);
      if (started) emit('error', { status, message: msg, ...code });
      else res.status(status).json({ statusCode: status, message: msg, ...code });
    }
    res.end();
  }

  @Post('sessions/:id/score')
  score(@LearnerId() learnerId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.interviews.score(learnerId, id, req.accessClaims);
  }
}
