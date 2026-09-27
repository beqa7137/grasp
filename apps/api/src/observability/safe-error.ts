import { DrizzleQueryError } from 'drizzle-orm/errors';
import pg from 'pg';
import { safeDatabaseErrorCategory, safeDatabaseErrorCode } from '../persistence/database-errors.js';

export function safeErrorDetails(error: unknown) {
  const code = safeDatabaseErrorCode(error);
  const category = safeDatabaseErrorCategory(error);
  if (error instanceof DrizzleQueryError || error instanceof pg.DatabaseError) return { category: 'database' as const, code };
  if (category === 'timeout' || category === 'connection') return { category, code };
  if (error instanceof TypeError) return { category: 'type' as const, code };
  if (error instanceof RangeError) return { category: 'range' as const, code };
  if (error instanceof SyntaxError) return { category: 'syntax' as const, code };
  return { category: 'unknown' as const, code };
}
