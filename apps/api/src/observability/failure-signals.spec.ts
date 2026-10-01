import { DrizzleQueryError } from 'drizzle-orm/errors';
import { databaseSignal, FailureSignals, SIGNAL_WINDOW_MS, type SignalReport } from './failure-signals.js';

function setup() {
  let now = Date.parse('2026-10-01T10:00:00Z');
  const sent: SignalReport[] = [];
  const signals = new FailureSignals(
    (report) => sent.push(report),
    () => now,
  );
  return { signals, sent, advance: (ms: number) => (now += ms) };
}

const timeout = () => new DrizzleQueryError('select 1', [], new Error('Query read timeout'));

describe('FailureSignals', () => {
  it('sends nothing until a failure is recorded', () => {
    const { sent } = setup();
    expect(sent).toEqual([]);
  });

  it('reports the first failure of a signal at once, then at most once a window, carrying the failures it held back', () => {
    const { signals, sent, advance } = setup();
    signals.record('db.timeout', timeout());
    for (let i = 0; i < 40; i++) {
      advance(1_000);
      signals.record('db.timeout', timeout());
    }
    expect(sent).toEqual([{ signal: 'db.timeout', failures: 1, category: 'database', code: 'unknown' }]);

    advance(SIGNAL_WINDOW_MS);
    signals.record('db.timeout', timeout());
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ signal: 'db.timeout', failures: 41 });

    advance(SIGNAL_WINDOW_MS);
    signals.record('db.timeout', timeout());
    expect(sent[2]).toMatchObject({ failures: 1 });
  });

  it('groups each signal on its own, so one noisy signal never hides another', () => {
    const { signals, sent } = setup();
    for (let i = 0; i < 5; i++) {
      signals.record('ai.busy');
      signals.record('rate-limit.store', timeout());
    }
    signals.record('ai.rejected');
    expect(sent.map((report) => report.signal)).toEqual(['ai.busy', 'rate-limit.store', 'ai.rejected']);
  });

  it('caps a burst across every signal at one report per signal per window', () => {
    const { signals, sent, advance } = setup();
    const all = ['db.timeout', 'db.unavailable', 'rate-limit.store', 'ai.timeout', 'ai.busy', 'ai.unavailable'] as const;
    for (let i = 0; i < 1_000; i++) {
      signals.record(all[i % all.length]!);
      advance(100);
    }
    expect(sent).toHaveLength(all.length);
  });

  it('keeps learner text, emails, tokens and SQL out of a report, whatever the error carries', () => {
    const { signals, sent } = setup();
    const hostile = Object.assign(
      new Error("insert into answers values ('my answer') -- ada@example.com Bearer eyJhbGciOiJIUzI1NiJ9.secret", {
        cause: Object.assign(new Error('ada@example.com'), { code: 'ada@example.com', detail: 'my answer' }),
      }),
      { code: 'Bearer eyJhbGciOiJIUzI1NiJ9.secret' },
    );
    const query = new DrizzleQueryError("select * from learners where email = 'ada@example.com'", ['my answer'], hostile);
    signals.record('db.unavailable', query);
    signals.record('ai.failed', hostile);
    expect(sent).toEqual([
      { signal: 'db.unavailable', failures: 1, category: 'database', code: 'unknown' },
      { signal: 'ai.failed', failures: 1, category: 'unknown', code: 'unknown' },
    ]);
    expect(JSON.stringify(sent)).not.toMatch(/answer|example\.com|Bearer|eyJ|select|insert/);
  });

  it('keeps a recognized database code', () => {
    const { signals, sent } = setup();
    signals.record('db.unavailable', new DrizzleQueryError('select 1', [], Object.assign(new Error('too many'), { code: '53300' })));
    expect(sent[0]).toMatchObject({ category: 'database', code: '53300' });
  });
});

describe('databaseSignal', () => {
  it('names timeouts and unreachable databases, and nothing else', () => {
    expect(databaseSignal(timeout())).toBe('db.timeout');
    expect(databaseSignal(Object.assign(new Error('x'), { code: '57014' }))).toBe('db.timeout');
    expect(databaseSignal(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe('db.unavailable');
    expect(databaseSignal(Object.assign(new Error('x'), { code: '53300' }))).toBe('db.unavailable');
    expect(databaseSignal(Object.assign(new Error('x'), { code: '23505' }))).toBeNull();
    expect(databaseSignal(new Error('private learner answer'))).toBeNull();
  });
});
