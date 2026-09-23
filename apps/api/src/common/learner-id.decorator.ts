import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Anonymous, device-generated learner id sent as `x-learner-id`.
 * Swap for an authenticated principal once accounts land (see docs/PLAN.md, M1).
 */
export const LearnerId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const id = req.header('x-learner-id');
  if (!id || !UUID.test(id)) throw new BadRequestException('Missing or invalid x-learner-id header (UUID expected)');
  return id.toLowerCase();
});
