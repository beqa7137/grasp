import type { StoredEvent } from '@grasp/engine';

const MAX_EVENTS_PER_REQUEST = 500;
const MAX_REQUEST_BYTES = 262_144;
const EMPTY_REQUEST_BYTES = 13;
const encoder = new TextEncoder();

export type ProgressUpload = { kind: 'batch'; events: StoredEvent[] } | { kind: 'oversized'; id: string };

export interface ProgressAcknowledgement {
  acknowledgedIds: string[];
  deferredFutureIds: string[];
  serverTime: string;
}

export function* packProgressEvents(events: Iterable<StoredEvent>): Generator<ProgressUpload> {
  let batch: StoredEvent[] = [];
  let batchBytes = EMPTY_REQUEST_BYTES;

  for (const event of events) {
    const serialized = JSON.stringify(event);
    const eventBytes = encoder.encode(serialized).byteLength;

    if (EMPTY_REQUEST_BYTES + eventBytes > MAX_REQUEST_BYTES) {
      yield { kind: 'oversized', id: event.id };
      continue;
    }

    if (batch.length === MAX_EVENTS_PER_REQUEST || batchBytes + (batch.length ? 1 : 0) + eventBytes > MAX_REQUEST_BYTES) {
      yield { kind: 'batch', events: batch };
      batch = [];
      batchBytes = EMPTY_REQUEST_BYTES;
    }

    batchBytes += (batch.length ? 1 : 0) + eventBytes;
    batch.push(JSON.parse(serialized) as StoredEvent);
  }

  if (batch.length) yield { kind: 'batch', events: batch };
}

export function readProgressAcknowledgement(value: unknown, events: readonly Pick<StoredEvent, 'id'>[]): ProgressAcknowledgement {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid progress acknowledgement');
  }

  const { acknowledgedIds, deferredFutureIds, serverTime } = value as Record<string, unknown>;
  if (!Array.isArray(acknowledgedIds) || !Array.isArray(deferredFutureIds) || typeof serverTime !== 'string') {
    throw new Error('Invalid progress acknowledgement');
  }

  const timestamp = new Date(serverTime);
  if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== serverTime) {
    throw new Error('Invalid progress acknowledgement');
  }

  const submitted = new Set(events.map((event) => event.id));
  if (submitted.size !== events.length) throw new Error('Duplicate submitted progress ID');

  const seen = new Set<string>();
  for (const ids of [acknowledgedIds, deferredFutureIds]) {
    for (const id of ids) {
      if (typeof id !== 'string' || !submitted.has(id) || seen.has(id)) {
        throw new Error('Invalid progress acknowledgement');
      }
      seen.add(id);
    }
  }
  if (seen.size !== submitted.size) throw new Error('Invalid progress acknowledgement');

  return {
    acknowledgedIds: [...acknowledgedIds] as string[],
    deferredFutureIds: [...deferredFutureIds] as string[],
    serverTime,
  };
}
