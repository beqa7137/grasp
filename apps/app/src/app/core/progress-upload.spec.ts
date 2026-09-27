import type { DiagnosticCompletedEvent, PracticeAnsweredEvent, StoredEvent } from '@grasp/engine';
import { packProgressEvents, readProgressAcknowledgement } from './progress-upload';

const MAX_EVENTS = 500;
const MAX_BYTES = 262_144;
const SERVER_TIME = '2026-09-27T12:34:56.789Z';
const encoder = new TextEncoder();

function practice(id: string, itemId = ''): PracticeAnsweredEvent {
  return { type: 'practice.answered', id, at: SERVER_TIME, itemId, correct: true, durationMs: 1 };
}

function requestBytes(events: StoredEvent[]): number {
  return encoder.encode(JSON.stringify({ events })).byteLength;
}

function exactSizeEvent(id: string, prefix = ''): PracticeAnsweredEvent {
  const remaining = MAX_BYTES - requestBytes([practice(id, prefix)]);
  return practice(id, prefix + 'a'.repeat(remaining));
}

describe('packProgressEvents', () => {
  it('sends no request for an empty source', () => {
    expect([...packProgressEvents([])]).toEqual([]);
  });

  it('keeps the 500th event and starts a second request for the 501st', () => {
    const uploads = [...packProgressEvents(Array.from({ length: MAX_EVENTS + 1 }, (_, index) => practice(String(index))))];

    expect(uploads.map((upload) => (upload.kind === 'batch' ? upload.events.length : upload.kind))).toEqual([500, 1]);
    expect(uploads.every((upload) => upload.kind === 'batch' && requestBytes(upload.events) <= MAX_BYTES)).toBe(true);
  });

  it.each([
    ['emoji', '😀'],
    ['CJK', '漢字'],
    ['escaped characters', '\n\t"\\'],
    ['lone surrogate', '\ud800'],
  ])('measures the full UTF-8 request exactly for %s', (_label, prefix) => {
    const atLimit = exactSizeEvent('exact', prefix);
    expect(requestBytes([atLimit])).toBe(MAX_BYTES);

    const exactUploads = [...packProgressEvents([atLimit])];
    expect(exactUploads).toEqual([{ kind: 'batch', events: [atLimit] }]);
    expect(requestBytes(exactUploads[0].kind === 'batch' ? exactUploads[0].events : [])).toBe(MAX_BYTES);

    const overLimit = practice('exact', atLimit.itemId + 'a');
    expect(requestBytes([overLimit])).toBe(MAX_BYTES + 1);
    expect([...packProgressEvents([overLimit])]).toEqual([{ kind: 'oversized', id: 'exact' }]);
  });

  it('includes the envelope and comma at the exact two-event boundary', () => {
    const first = practice('first', 'a'.repeat(100_000));
    const secondBase = practice('second');
    const remaining = MAX_BYTES - requestBytes([first, secondBase]);
    const second = practice('second', 'a'.repeat(remaining));

    expect(requestBytes([first, second])).toBe(MAX_BYTES);
    expect([...packProgressEvents([first, second])]).toEqual([{ kind: 'batch', events: [first, second] }]);

    const oneByteOver = practice('second', second.itemId + 'a');
    const uploads = [...packProgressEvents([first, oneByteOver])];
    expect(uploads).toEqual([
      { kind: 'batch', events: [first] },
      { kind: 'batch', events: [oneByteOver] },
    ]);
    expect(requestBytes([first, oneByteOver])).toBe(MAX_BYTES + 1);
  });

  it('retains valid neighbors around oversized first, middle, and final events', () => {
    const oversized = (id: string) => practice(id, 'a'.repeat(MAX_BYTES));
    const uploads = [...packProgressEvents([oversized('first'), practice('a'), oversized('middle'), practice('b'), oversized('last')])];

    expect(uploads).toEqual([
      { kind: 'oversized', id: 'first' },
      { kind: 'batch', events: [practice('a')] },
      { kind: 'oversized', id: 'middle' },
      { kind: 'batch', events: [practice('b')] },
      { kind: 'oversized', id: 'last' },
    ]);
  });

  it('detaches nested event data so later caller mutation cannot change a retry body', () => {
    const event: DiagnosticCompletedEvent = {
      type: 'diagnostic.completed',
      id: 'diagnostic',
      at: SERVER_TIME,
      answers: [{ itemId: 'original', outcome: 'correct', durationMs: 1 }],
    };
    const [upload] = [...packProgressEvents([event])];
    expect(upload.kind).toBe('batch');
    if (upload.kind !== 'batch') return;
    const measuredBody = JSON.stringify({ events: upload.events });

    event.answers[0].itemId = 'mutated';
    event.answers.push({ itemId: 'later', outcome: 'wrong', durationMs: 2 });

    expect(JSON.stringify({ events: upload.events })).toBe(measuredBody);
    expect(upload.events).toEqual([
      {
        type: 'diagnostic.completed',
        id: 'diagnostic',
        at: SERVER_TIME,
        answers: [{ itemId: 'original', outcome: 'correct', durationMs: 1 }],
      },
    ]);
  });

  it('serializes each source event once while creating the detached batch', () => {
    const event = practice('once');
    let reads = 0;
    Object.defineProperty(event, 'itemId', {
      enumerable: true,
      get: () => {
        reads++;
        return 'item';
      },
    });

    expect([...packProgressEvents([event])]).toEqual([{ kind: 'batch', events: [practice('once', 'item')] }]);
    expect(reads).toBe(1);
  });
});

describe('readProgressAcknowledgement', () => {
  const submitted = [{ id: 'one' }, { id: 'two' }];
  const valid = () => ({ acknowledgedIds: ['one'], deferredFutureIds: ['two'], serverTime: SERVER_TIME });

  it('accepts an exact partition, including an all-future response', () => {
    expect(readProgressAcknowledgement(valid(), submitted)).toEqual(valid());
    expect(readProgressAcknowledgement({ ...valid(), accepted: 0, duplicates: 0, rejectedFuture: 0 }, submitted)).toEqual(valid());
    const allFuture = { acknowledgedIds: [], deferredFutureIds: ['two', 'one'], serverTime: SERVER_TIME };
    expect(readProgressAcknowledgement(allFuture, submitted)).toEqual(allFuture);
    expect(readProgressAcknowledgement({ acknowledgedIds: [], deferredFutureIds: [], serverTime: SERVER_TIME }, [])).toEqual({
      acknowledgedIds: [],
      deferredFutureIds: [],
      serverTime: SERVER_TIME,
    });
  });

  it.each([
    ['null response', null],
    ['array response', []],
    ['count-only response', { accepted: 2, duplicates: 0, rejectedFuture: 0, serverTime: SERVER_TIME }],
    ['missing acknowledged IDs', { deferredFutureIds: ['one', 'two'], serverTime: SERVER_TIME }],
    ['missing deferred IDs', { acknowledgedIds: ['one', 'two'], serverTime: SERVER_TIME }],
    ['wrong array type', { acknowledgedIds: 'one', deferredFutureIds: ['two'], serverTime: SERVER_TIME }],
    ['wrong ID type', { acknowledgedIds: [1], deferredFutureIds: ['two'], serverTime: SERVER_TIME }],
    ['duplicate acknowledged ID', { acknowledgedIds: ['one', 'one'], deferredFutureIds: ['two'], serverTime: SERVER_TIME }],
    ['duplicate deferred ID', { acknowledgedIds: ['one'], deferredFutureIds: ['two', 'two'], serverTime: SERVER_TIME }],
    ['overlapping ID', { acknowledgedIds: ['one'], deferredFutureIds: ['one', 'two'], serverTime: SERVER_TIME }],
    ['foreign ID', { acknowledgedIds: ['one', 'foreign'], deferredFutureIds: ['two'], serverTime: SERVER_TIME }],
    ['missing ID', { acknowledgedIds: ['one'], deferredFutureIds: [], serverTime: SERVER_TIME }],
    ['invalid time', { acknowledgedIds: ['one'], deferredFutureIds: ['two'], serverTime: 'yesterday' }],
    ['noncanonical time', { acknowledgedIds: ['one'], deferredFutureIds: ['two'], serverTime: '2026-09-27T12:34:56Z' }],
  ])('rejects %s without returning partial acknowledgements', (_label, response) => {
    expect(() => readProgressAcknowledgement(response, submitted)).toThrow();
  });

  it('rejects duplicate submitted IDs because their partition is ambiguous', () => {
    expect(() => readProgressAcknowledgement(valid(), [{ id: 'one' }, { id: 'one' }])).toThrow();
  });
});
