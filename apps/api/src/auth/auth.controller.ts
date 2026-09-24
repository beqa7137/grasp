import { Body, Controller, Get, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { UserId } from '../common/learner-id.decorator.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { SkipIdentity } from './identity.guard.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUARTER_HOUR = 15 * 60_000;

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const startSchema = z.object({ email });
const verifySchema = z.object({ email, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });
const tokenSchema = z.object({ refreshToken: z.string().min(20).max(200) });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('config')
  @SkipIdentity()
  config() {
    return { email: this.auth.emailEnabled };
  }

  @Post('email/start')
  @HttpCode(202)
  @SkipIdentity()
  @RateLimit({ limit: 5, windowMs: QUARTER_HOUR })
  async start(@Body(new ZodValidationPipe(startSchema)) body: z.infer<typeof startSchema>) {
    await this.auth.startEmail(body.email);
    return { sent: true };
  }

  /** The anonymous device learner (x-learner-id), if any, is folded into the account. */
  @Post('email/verify')
  @HttpCode(200)
  @SkipIdentity()
  @RateLimit({ limit: 10, windowMs: QUARTER_HOUR })
  verify(@Body(new ZodValidationPipe(verifySchema)) body: z.infer<typeof verifySchema>, @Req() req: Request) {
    const device = req.header('x-learner-id');
    return this.auth.verifyEmail(body.email, body.code, device && UUID.test(device) ? device.toLowerCase() : null);
  }

  @Post('refresh')
  @HttpCode(200)
  @SkipIdentity()
  @RateLimit({ limit: 30, windowMs: QUARTER_HOUR })
  refresh(@Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @SkipIdentity()
  async logout(@Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>) {
    await this.auth.logout(body.refreshToken);
  }

  @Get('me')
  me(@UserId() userId: string | null) {
    if (!userId) throw new UnauthorizedException('Not signed in');
    return this.auth.me(userId);
  }
}
