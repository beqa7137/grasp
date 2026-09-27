import type { ErrorEvent, Event, EventHint, StackFrame } from '@sentry/node';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../config.js';
import { safeErrorDetails } from './safe-error.js';

type Transport = ReturnType<typeof import('@sentry/node').makeNodeTransport>;
type StackParser = typeof import('@sentry/node').defaultStackParser;

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function applicationFiles(): Map<string, string> {
  const directory = fileURLToPath(new URL('../', import.meta.url));
  const files = new Map<string, string>();
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:js|ts)$/.test(entry.name) || /\.(?:spec|d)\.ts$/.test(entry.name)) continue;
    const filename = resolve(entry.parentPath, entry.name);
    files.set(filename, `api/${relative(directory, filename)}`);
  }
  return files;
}

function safeFrames(frames: StackFrame[], files: Map<string, string>): StackFrame[] {
  return frames.slice(-50).flatMap((frame) => {
    let filename = frame.filename;
    if (!filename) return [];
    if (filename.startsWith('file:')) {
      try {
        const url = new URL(filename);
        if (url.search || url.hash) return [];
        filename = fileURLToPath(url);
      } catch {
        return [];
      }
    }
    const safeFilename = files.get(filename);
    if (!safeFilename) return [];
    const safe: StackFrame = { filename: safeFilename, in_app: true };
    if (Number.isSafeInteger(frame.lineno) && frame.lineno! > 0) safe.lineno = frame.lineno;
    if (Number.isSafeInteger(frame.colno) && frame.colno! > 0) safe.colno = frame.colno;
    return [safe];
  });
}

export function createSentryPrivacy(config: AppConfig, parseStack: StackParser) {
  const files = applicationFiles();
  const captures = new WeakMap<object, ErrorEvent>();
  const outbound = new WeakMap<Event, ErrorEvent>();

  return {
    capture(error: unknown, requestId?: string): [ErrorEvent, EventHint] {
      const details = safeErrorDetails(error);
      const frames = error instanceof Error && typeof error.stack === 'string' ? safeFrames(parseStack(error.stack), files) : [];
      const event: ErrorEvent = {
        type: undefined,
        event_id: randomUUID().replaceAll('-', ''),
        timestamp: Date.now() / 1_000,
        platform: 'node',
        level: 'error',
        environment: config.sentryEnvironment,
        ...(config.release ? { release: config.release } : {}),
        tags: {
          category: details.category,
          code: details.code,
          ...(requestId && REQUEST_ID.test(requestId) ? { requestId } : {}),
        },
        exception: {
          values: [{ type: details.category, value: 'Server operation failed', ...(frames.length ? { stacktrace: { frames } } : {}) }],
        },
      };
      const token = {};
      captures.set(token, event);
      return [structuredClone(event), { originalException: token }];
    },

    beforeSend(_event: ErrorEvent, hint: EventHint): ErrorEvent | null {
      const token = hint.originalException;
      const captured = token !== null && typeof token === 'object' ? captures.get(token) : undefined;
      if (!captured) return null;
      const event = structuredClone(captured);
      outbound.set(event, captured);
      return event;
    },

    transport(delegate: Transport): Transport {
      return {
        flush: (timeout) => delegate.flush(timeout),
        send(envelope) {
          const eventItem = envelope[1].find(([header]) => header.type === 'event');
          const payload = eventItem?.[1];
          const event = payload !== null && typeof payload === 'object' ? outbound.get(payload as Event) : undefined;
          if (!event) return Promise.resolve({});
          // SDK-internal errors bypass beforeSend; attachments and trace metadata are added after it.
          return delegate.send([{ event_id: event.event_id!, sent_at: new Date().toISOString() }, [[{ type: 'event' }, event]]]);
        },
      };
    },
  };
}
