import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DeviceLearnerId, UserId } from '../common/learner-id.decorator.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AccountService } from './account.service.js';
import { notSignedIn } from './auth-errors.js';
import { codeVerifierSchema, GitHubSignInService } from './github-sign-in.service.js';
import { SkipIdentity } from './identity.guard.js';
import { SIGN_IN_CALLBACK_PATH } from './sign-in-callback.js';

const QUARTER_HOUR = 15 * 60_000;

const redemptionSchema = z.object({ ticket: z.string().min(43).max(128), codeVerifier: codeVerifierSchema });
type Redemption = z.infer<typeof redemptionSchema>;

@Controller('auth/github')
export class GitHubController {
  constructor(
    private readonly github: GitHubSignInService,
    private readonly accounts: AccountService,
  ) {}

  /** OAuth token endpoint for the app's sign-in plugin. */
  @Post('token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @SkipIdentity()
  @RateLimit({ limit: 20, windowMs: QUARTER_HOUR })
  token(@Body() form: unknown, @Req() req: Request) {
    return this.github.token(form, `${req.protocol}://${req.get('host')}${SIGN_IN_CALLBACK_PATH}`);
  }

  @Post()
  @HttpCode(200)
  @SkipIdentity()
  @RateLimit({ limit: 10, windowMs: QUARTER_HOUR })
  async signIn(@Body(new ZodValidationPipe(redemptionSchema)) body: Redemption, @DeviceLearnerId() device: string | null) {
    return this.accounts.signIn(await this.github.redeem(body.ticket, body.codeVerifier), device);
  }

  @Post('link')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: QUARTER_HOUR })
  async link(@Body(new ZodValidationPipe(redemptionSchema)) body: Redemption, @UserId() userId: string | null) {
    if (!userId) throw notSignedIn();
    return { identities: await this.accounts.link(userId, await this.github.redeem(body.ticket, body.codeVerifier)) };
  }
}
