import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { UserId } from '../common/learner-id.decorator.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AccountService } from './account.service.js';
import { notSignedIn } from './auth-errors.js';
import { GitHubOAuthClient } from './github-oauth.client.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';
import { SkipIdentity } from './identity.guard.js';
import { SessionService } from './session.service.js';

const QUARTER_HOUR = 15 * 60_000;

const tokenSchema = z.object({ refreshToken: z.string().min(20).max(200) });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly accounts: AccountService,
    private readonly google: GoogleIdTokenVerifier,
    private readonly github: GitHubOAuthClient,
  ) {}

  /** Which sign-in providers this server offers, with the public client ids the app needs to start them. */
  @Get('config')
  @SkipIdentity()
  config() {
    return { google: this.google.clients, github: this.github.app };
  }

  @Post('refresh')
  @HttpCode(200)
  @SkipIdentity()
  @RateLimit({ limit: 30, windowMs: QUARTER_HOUR })
  refresh(@Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>) {
    return this.sessions.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @SkipIdentity()
  async logout(@Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>) {
    await this.sessions.logout(body.refreshToken);
  }

  @Get('me')
  me(@UserId() userId: string | null) {
    if (!userId) throw notSignedIn();
    return this.accounts.me(userId);
  }
}
