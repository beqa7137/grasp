import { MemoryAuthStore } from '../persistence/memory.stores.js';
import { OneTimeValues } from './one-time-values.js';

const t0 = new Date('2026-09-20T10:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

describe('OneTimeValues', () => {
  it('stores only a hash and hands the payload back once, for the same purpose, before expiry', async () => {
    const store = new MemoryAuthStore();
    const stored = vi.spyOn(store, 'addOneTime');
    const values = new OneTimeValues(store);
    const ticket = await values.issue('github_ticket', 60_000, { subject: '42', email: null }, t0);
    expect(ticket).toMatch(/^[\w-]{43}$/);
    expect(JSON.stringify(stored.mock.calls)).not.toContain(ticket);

    expect(await values.consume('google_nonce', ticket, t0)).toBeNull();
    expect(await values.consume('github_ticket', ticket, at(1_000))).toMatchObject({ payload: { subject: '42', email: null } });
    expect(await values.consume('github_ticket', ticket, at(2_000))).toBeNull();

    const late = await values.issue('google_nonce', 60_000, null, t0);
    expect(await values.consume('google_nonce', late, at(60_000))).toBeNull();
    expect(await values.consume('google_nonce', 'never-issued', t0)).toBeNull();
  });

  it('sweeps expired values', async () => {
    const store = new MemoryAuthStore();
    const values = new OneTimeValues(store);
    const past = new Date(Date.now() - 3_600_000);
    await values.issue('google_nonce', 60_000, null, past);
    const fresh = await values.issue('google_nonce', 60_000);
    expect(await store.sweepExpired()).toBe(1);
    expect(await values.consume('google_nonce', fresh)).not.toBeNull();
  });
});
