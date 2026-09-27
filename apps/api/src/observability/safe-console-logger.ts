import { ConsoleLogger } from '@nestjs/common';
import { safeErrorDetails } from './safe-error.js';

const EXCEPTION_CONTEXTS = new Set(['ExceptionHandler', 'ExceptionsHandler']);

function isException(message: unknown, params: unknown[]): boolean {
  const context = params.at(-1);
  return message instanceof Error || (typeof context === 'string' && EXCEPTION_CONTEXTS.has(context));
}

export class SafeConsoleLogger extends ConsoleLogger {
  override error(message: unknown, ...params: unknown[]) {
    if (isException(message, params)) {
      super.error({ message: 'Unexpected failure', ...safeErrorDetails(message) }, 'ExceptionHandler');
      return;
    }
    super.error(message, ...params);
  }

  override fatal(message: unknown, ...params: unknown[]) {
    if (isException(message, params)) {
      super.fatal({ message: 'Unexpected failure', ...safeErrorDetails(message) }, 'ExceptionHandler');
      return;
    }
    super.fatal(message, ...params);
  }
}
