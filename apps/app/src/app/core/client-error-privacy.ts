import type { ErrorEvent, Event, EventHint, StackFrame } from '@sentry/angular';
import { errorCategory } from './error-category';

type Transport = ReturnType<typeof import('@sentry/angular').makeFetchTransport>;
type StackParser = typeof import('@sentry/angular').defaultStackParser;

function safeFrames(frames: StackFrame[], files: ReadonlyMap<string, string>): StackFrame[] {
  return frames.slice(-50).flatMap((frame) => {
    const filename = frame.filename && files.get(frame.filename);
    if (!filename) return [];
    const safe: StackFrame = { filename, in_app: true };
    if (Number.isSafeInteger(frame.lineno) && frame.lineno! > 0) safe.lineno = frame.lineno;
    if (Number.isSafeInteger(frame.colno) && frame.colno! > 0) safe.colno = frame.colno;
    return [safe];
  });
}

export function createClientErrorPrivacy(
  config: { environment: string; release: string | null },
  files: ReadonlyMap<string, string>,
  parseStack: StackParser,
) {
  const captures = new WeakMap<object, ErrorEvent>();
  const outbound = new WeakMap<Event, ErrorEvent>();

  return {
    capture(error: unknown): [ErrorEvent, EventHint] {
      const category = errorCategory(error);
      const frames = error instanceof Error && typeof error.stack === 'string' ? safeFrames(parseStack(error.stack), files) : [];
      const event: ErrorEvent = {
        type: undefined,
        event_id: crypto.randomUUID().replaceAll('-', ''),
        timestamp: Date.now() / 1_000,
        platform: 'javascript',
        level: 'error',
        environment: config.environment,
        ...(config.release ? { release: config.release } : {}),
        tags: { category },
        sdk: { settings: { infer_ip: 'never' } },
        exception: {
          values: [{ type: category, value: 'Client operation failed', ...(frames.length ? { stacktrace: { frames } } : {}) }],
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
          return delegate.send([{ event_id: event.event_id!, sent_at: new Date().toISOString() }, [[{ type: 'event' }, event]]]);
        },
      };
    },
  };
}
