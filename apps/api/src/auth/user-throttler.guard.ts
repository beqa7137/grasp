import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/** Signed-in callers are limited per account (across devices and networks); everyone else per IP. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const request = req as Request;
    return request.identity?.userId ? `user:${request.identity.userId}` : `ip:${request.ip}`;
  }
}
