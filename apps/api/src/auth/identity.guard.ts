import { type CanActivate, type ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request as HttpRequest } from 'express';
import { deviceLearnerIdOf } from '../common/learner-id.decorator.js';
import { AuthStore } from '../persistence/stores.js';
import type { Identity } from './auth.types.js';
import { InvalidTokenError, TokenService } from './tokens.js';

const SKIP_IDENTITY = 'grasp:skip-identity';

/** For routes that authenticate differently (operator token) or read the device id themselves (sign-in). */
export const SkipIdentity = () => SetMetadata(SKIP_IDENTITY, true);

declare module 'express-serve-static-core' {
  interface Request {
    identity?: Identity;
  }
}

/**
 * Resolves who is calling before anything else runs. A bearer token wins; otherwise the anonymous
 * `x-learner-id` is accepted unless that learner already belongs to an account, which then requires
 * signing in.
 */
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly store: AuthStore,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_IDENTITY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<HttpRequest>();

    const authorization = req.header('authorization');
    if (authorization?.startsWith('Bearer ')) {
      try {
        const claims = await this.tokens.verify(authorization.slice(7));
        req.identity = { learnerId: claims.learnerId, userId: claims.userId };
        return true;
      } catch (e) {
        if (e instanceof InvalidTokenError) throw new UnauthorizedException({ statusCode: 401, message: e.message, code: 'token_invalid' });
        throw e;
      }
    }

    const learnerId = deviceLearnerIdOf(req);
    if (learnerId) {
      if (await this.store.userByLearner(learnerId)) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'This progress belongs to an account. Sign in to continue.',
          code: 'sign_in_required',
        });
      }
      req.identity = { learnerId, userId: null };
    }
    return true;
  }
}
