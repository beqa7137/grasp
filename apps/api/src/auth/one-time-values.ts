import { Injectable } from '@nestjs/common';
import { AuthStore } from '../persistence/stores.js';
import type { OneTimePurpose, OneTimeRecord } from './auth.types.js';
import { hashToken, newOpaqueToken } from './tokens.js';

/** Random 256-bit single-use values (sign-in nonces and tickets). Only their hash is stored. */
@Injectable()
export class OneTimeValues {
  constructor(private readonly store: AuthStore) {}

  async issue(purpose: OneTimePurpose, ttlMs: number, payload: object | null = null, now = new Date()): Promise<string> {
    const value = newOpaqueToken();
    await this.store.addOneTime({
      hash: hashToken(value),
      purpose,
      payload,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      consumedAt: null,
      createdAt: now.toISOString(),
    });
    return value;
  }

  consume(purpose: OneTimePurpose, value: string, now = new Date()): Promise<OneTimeRecord | null> {
    return this.store.consumeOneTime(hashToken(value), purpose, now.toISOString());
  }
}
