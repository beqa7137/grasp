import { ServiceUnavailableException } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import pg from 'pg';

const NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
]);
const POSTGRES_CODES = new Set(['53300', '53400', '57014', '57P01', '57P02', '57P03']);
const CONNECTION_MESSAGES = new Set([
  'Client has encountered a connection error and is not queryable',
  'Connection terminated',
  'Connection terminated unexpectedly',
]);
const TIMEOUT_MESSAGES = new Set([
  'Connection terminated due to connection timeout',
  'Query read timeout',
  'timeout exceeded when trying to connect',
  'timeout expired',
]);

function errorDetails(error: unknown): { code?: unknown; message?: unknown; cause?: unknown } | null {
  return error !== null && typeof error === 'object' ? error : null;
}

function* errorChain(error: unknown) {
  for (let depth = 0; error && depth < 5; depth++) {
    const details = errorDetails(error);
    if (!details) return;
    yield details;
    error = details.cause;
  }
}

export function safeDatabaseErrorCode(error: unknown): string {
  for (const { code } of errorChain(error)) {
    if (typeof code === 'string' && (NETWORK_CODES.has(code) || POSTGRES_CODES.has(code) || /^08[A-Z0-9]{3}$/.test(code))) return code;
  }
  return 'unknown';
}

export function safeDatabaseErrorCategory(error: unknown): 'timeout' | 'connection' | 'postgres' | 'unknown' {
  for (const { code, message } of errorChain(error)) {
    if (code === 'ETIMEDOUT' || code === '57014' || (typeof message === 'string' && TIMEOUT_MESSAGES.has(message))) return 'timeout';
    if (
      (typeof code === 'string' && (NETWORK_CODES.has(code) || /^08[A-Z0-9]{3}$/.test(code))) ||
      (typeof message === 'string' && CONNECTION_MESSAGES.has(message))
    )
      return 'connection';
    if (typeof code === 'string' && POSTGRES_CODES.has(code)) return 'postgres';
  }
  return 'unknown';
}

export function isDatabaseUnavailable(error: unknown): boolean {
  return (error instanceof DrizzleQueryError || error instanceof pg.DatabaseError) && safeDatabaseErrorCategory(error) !== 'unknown';
}

export function databaseUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({ status: 'unavailable', database: 'unreachable' });
}
