import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { UserId } from '../common/learner-id.decorator.js';
import { PublicRead } from '../common/public-read.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AccountService } from './account.service.js';
import { notSignedIn } from './auth-errors.js';
import { AUTH_NETWORK_LIMIT } from './auth-rate-limit.service.js';
import { GitHubOAuthClient } from './github-oauth.client.js';
import { GoogleIdTokenVerifier } from './google-id-token.verifier.js';
import { SkipIdentity } from './identity.guard.js';
import { SessionService } from './session.service.js';

const tokenSchema = z.object({ refreshToken: z.string().min(20).max(200) });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly accounts: AccountService,
    private readonly google: GoogleIdTokenVerifier,
    private readonly github: GitHubOAuthClient,
  ) {}

  @Get('config')
  @PublicRead()
  config() {
    return { google: this.google.clients, github: this.github.app };
  }

  @Post('refresh')
  @RateLimit(AUTH_NETWORK_LIMIT)
  @HttpCode(200)
  @SkipIdentity()
  refresh(@Body(new ZodValidationPipe(tokenSchema)) body: z.infer<typeof tokenSchema>) {
    return this.sessions.refresh(body.refreshToken);
  }

  @Post('logout')
  @RateLimit(AUTH_NETWORK_LIMIT)
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
