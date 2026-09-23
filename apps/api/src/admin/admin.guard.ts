import { type CanActivate, type ExecutionContext, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config.js';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Bearer-token check for operator endpoints. Without ADMIN_TOKEN the routes behave as if they don't exist. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.config.adminToken) throw new NotFoundException();
    const header = ctx.switchToHttp().getRequest<Request>().header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!timingSafeEqual(digest(token), digest(this.config.adminToken))) throw new UnauthorizedException();
    return true;
  }
}
