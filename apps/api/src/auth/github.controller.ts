import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DeviceLearnerId, UserId } from '../common/learner-id.decorator.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AccountService } from './account.service.js';
import { notSignedIn } from './auth-errors.js';
import { GitHubSignInService } from './github-sign-in.service.js';
import { SkipIdentity } from './identity.guard.js';
import { SIGN_IN_CALLBACK_PATH } from './sign-in-callback.js';

const QUARTER_HOUR = 15 * 60_000;

const ticketSchema = z.object({ ticket: z.string().min(43).max(128) });
type Ticket = z.infer<typeof ticketSchema>;

@Controller('auth/github')
export class GitHubController {
  constructor(
    private readonly github: GitHubSignInService,
    private readonly accounts: AccountService,
  ) {}

  /** OAuth token endpoint for the app's sign-in plugin; takes a URL-encoded form, as OAuth clients send it. */
  @Post('token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @SkipIdentity()
  @RateLimit({ limit: 20, windowMs: QUARTER_HOUR })
  token(@Body() form: unknown, @Req() req: Request) {
    return this.github.token(form, `${req.protocol}://${req.get('host')}${SIGN_IN_CALLBACK_PATH}`);
  }

  /** The anonymous device learner (x-learner-id), if any, is folded into the account. */
  @Post()
  @HttpCode(200)
  @SkipIdentity()
  @RateLimit({ limit: 10, windowMs: QUARTER_HOUR })
  async signIn(@Body(new ZodValidationPipe(ticketSchema)) body: Ticket, @DeviceLearnerId() device: string | null) {
    return this.accounts.signIn(await this.github.redeem(body.ticket), device);
  }

  @Post('link')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: QUARTER_HOUR })
  async link(@Body(new ZodValidationPipe(ticketSchema)) body: Ticket, @UserId() userId: string | null) {
    if (!userId) throw notSignedIn();
    return { identities: await this.accounts.link(userId, await this.github.redeem(body.ticket)) };
  }
}
