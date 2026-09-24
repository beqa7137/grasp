import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { DeviceLearnerId, UserId } from '../common/learner-id.decorator.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AccountService } from './account.service.js';
import { notSignedIn } from './auth-errors.js';
import { GoogleSignInService } from './google-sign-in.service.js';
import { SkipIdentity } from './identity.guard.js';

const QUARTER_HOUR = 15 * 60_000;

const credentialSchema = z.object({ idToken: z.string().min(1).max(4096), nonce: z.string().regex(/^[\w-]{43}$/) });
type Credential = z.infer<typeof credentialSchema>;

@Controller('auth/google')
export class GoogleController {
  constructor(
    private readonly google: GoogleSignInService,
    private readonly accounts: AccountService,
  ) {}

  @Post('nonce')
  @HttpCode(200)
  @SkipIdentity()
  @RateLimit({ limit: 20, windowMs: QUARTER_HOUR })
  async nonce() {
    return { nonce: await this.google.newNonce() };
  }

  /** The anonymous device learner (x-learner-id), if any, is folded into the account. */
  @Post()
  @HttpCode(200)
  @SkipIdentity()
  @RateLimit({ limit: 10, windowMs: QUARTER_HOUR })
  async signIn(@Body(new ZodValidationPipe(credentialSchema)) body: Credential, @DeviceLearnerId() device: string | null) {
    return this.accounts.signIn(await this.google.identify(body.idToken, body.nonce), device);
  }

  @Post('link')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: QUARTER_HOUR })
  async link(@Body(new ZodValidationPipe(credentialSchema)) body: Credential, @UserId() userId: string | null) {
    if (!userId) throw notSignedIn();
    return { identities: await this.accounts.link(userId, await this.google.identify(body.idToken, body.nonce)) };
  }
}
