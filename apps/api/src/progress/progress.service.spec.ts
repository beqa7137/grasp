import { MemoryProgressStore } from '../persistence/memory.stores.js';
import { ProgressStore, type AppendResult } from '../persistence/stores.js';
import { appendEventsSchema } from './progress.schema.js';
import { ProgressService } from './progress.service.js';

const learnerId = '1cd2d5c9-474f-4648-b4c0-1ad3d3d3a0ab';
const event = (id: string, at: string) => ({
  id,
  at,
  type: 'predict.answered' as const,
  algorithmId: 'binary-search',
  patternId: 'binary-search',
  correct: true,
});

afterEach(() => vi.useRealTimers());

it('normalizes timestamps and uses one server instant for the inclusive five-minute boundary', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));
  const append = vi.fn<ProgressStore['append']>().mockResolvedValue({ accepted: 2, duplicates: 0 });
  const progress = new ProgressService({ append } as unknown as ProgressStore);
  const events = appendEventsSchema.parse({
    events: [
      event('evt-boundary', '2026-09-27T14:05:00.000+02:00'),
      event('evt-deferred', '2026-09-27T14:05:00.001+02:00'),
      event('evt-earlier', '2026-09-27T11:59:59.999Z'),
    ],
  }).events;

  expect(events[0]?.at).toBe('2026-09-27T12:05:00.000Z');
  expect(await progress.ingest(learnerId, events)).toEqual({
    accepted: 2,
    duplicates: 0,
    rejectedFuture: 1,
    acknowledgedIds: ['evt-boundary', 'evt-earlier'],
    deferredFutureIds: ['evt-deferred'],
    serverTime: '2026-09-27T12:00:00.000Z',
  });
  expect(append).toHaveBeenCalledWith(learnerId, [events[0], events[2]]);
});

it('acknowledges an already stored ID only after append resolves', async () => {
  let completeAppend!: (result: AppendResult) => void;
  const append = vi.fn<ProgressStore['append']>().mockImplementation(
    () =>
      new Promise<AppendResult>((resolve) => {
        completeAppend = resolve;
      }),
  );
  const progress = new ProgressService({ append } as unknown as ProgressStore);
  const pending = progress.ingest(learnerId, [event('evt-existing', new Date().toISOString())]);
  let settled = false;
  void pending.then(() => (settled = true));

  await Promise.resolve();
  expect(settled).toBe(false);
  completeAppend({ accepted: 0, duplicates: 1 });
  expect(await pending).toMatchObject({ accepted: 0, duplicates: 1, acknowledgedIds: ['evt-existing'] });
});

it('does not return acknowledgments when append fails before writing', async () => {
  const failure = new Error('append failed');
  const append = vi.fn<ProgressStore['append']>().mockRejectedValue(failure);
  const progress = new ProgressService({ append } as unknown as ProgressStore);

  await expect(progress.ingest(learnerId, [event('evt-pending', new Date().toISOString())])).rejects.toBe(failure);
});

it('accepts the original deferred event once server time reaches its boundary', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-27T12:00:00.000Z'));
  const store = new MemoryProgressStore();
  const progress = new ProgressService(store);
  const future = event('evt-recovered', '2026-09-27T12:06:00.000Z');

  expect(await progress.ingest(learnerId, [future])).toMatchObject({
    acknowledgedIds: [],
    deferredFutureIds: [future.id],
  });
  expect(await store.list(learnerId)).toEqual([]);

  vi.setSystemTime(new Date('2026-09-27T12:01:00.000Z'));
  expect(await progress.ingest(learnerId, [future])).toMatchObject({
    acknowledgedIds: [future.id],
    deferredFutureIds: [],
    serverTime: '2026-09-27T12:01:00.000Z',
  });
  expect(await store.list(learnerId)).toEqual([future]);
});
