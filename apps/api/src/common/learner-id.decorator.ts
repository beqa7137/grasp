import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The learner the request acts for, resolved by IdentityGuard: the signed-in account's learner, or
 * the anonymous device id from `x-learner-id`.
 */
export const LearnerId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const identity = ctx.switchToHttp().getRequest<Request>().identity;
  if (!identity) throw new BadRequestException('Missing or invalid x-learner-id header (UUID expected)');
  return identity.learnerId;
});

/** The signed-in user, or null for anonymous callers. */
export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  return ctx.switchToHttp().getRequest<Request>().identity?.userId ?? null;
});
