import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The device's anonymous learner id from `x-learner-id`, lowercased; null when absent or not a UUID. */
export function deviceLearnerIdOf(req: Request): string | null {
  const id = req.header('x-learner-id');
  return id && UUID.test(id) ? id.toLowerCase() : null;
}

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

/** For sign-in routes, which skip IdentityGuard: the device learner to fold into the account, if any. */
export const DeviceLearnerId = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null =>
  deviceLearnerIdOf(ctx.switchToHttp().getRequest<Request>()),
);
