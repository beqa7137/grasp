import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AuthStore } from '../persistence/stores.js';
import type { OneTimePurpose, OneTimeRecord } from './auth.types.js';

const hash = (value: string) => createHash('sha256').update(value).digest('base64url');

/** Random 256-bit single-use values (sign-in nonces and tickets). Only their hash is stored. */
@Injectable()
export class OneTimeValues {
  constructor(private readonly store: AuthStore) {}

  async issue(purpose: OneTimePurpose, ttlMs: number, payload: object | null = null, now = new Date()): Promise<string> {
    const value = randomBytes(32).toString('base64url');
    await this.store.addOneTime({
      hash: hash(value),
      purpose,
      payload,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      consumedAt: null,
      createdAt: now.toISOString(),
    });
    return value;
  }

  /** The stored record the first time the value is presented before it expires; null when unknown, expired or used. */
  consume(purpose: OneTimePurpose, value: string, now = new Date()): Promise<OneTimeRecord | null> {
    return this.store.consumeOneTime(hash(value), purpose, now.toISOString());
  }
}
