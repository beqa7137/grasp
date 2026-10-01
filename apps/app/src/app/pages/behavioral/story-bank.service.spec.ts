import { TestBed } from '@angular/core/testing';
import { EMPTY_STAR_DRAFT, deletedStory, nextChange, type Story } from '@grasp/engine';
import { ApiError, ApiService } from '../../core/api.service';
import { AuthTokens } from '../../core/auth-tokens.service';
import { StoryBankService } from './story-bank.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: localStorage.getItem(`CapacitorStorage.${key}`) })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => localStorage.setItem(`CapacitorStorage.${key}`, value)),
    remove: vi.fn(async ({ key }: { key: string }) => localStorage.removeItem(`CapacitorStorage.${key}`)),
    keys: vi.fn(async () => ({
      keys: Object.keys(localStorage)
        .filter((key) => key.startsWith('CapacitorStorage.'))
        .map((key) => key.slice('CapacitorStorage.'.length)),
    })),
  },
}));

const BANK_KEY = 'CapacitorStorage.grasp.behavioral.stories';
const story = (id: string, title: string, updatedAt: string): Story => ({
  id,
  title,
  competencyIds: ['ownership'],
  draft: { ...EMPTY_STAR_DRAFT, action: `I fixed ${title}.` },
  updatedAt,
});
const blankStory = (id: string, updatedAt: string): Story => ({
  id,
  title: '',
  competencyIds: [],
  draft: { ...EMPTY_STAR_DRAFT },
  updatedAt,
});
const stashKey = (learnerId: string) => `${BANK_KEY}.${learnerId}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const stored = (): Story[] => JSON.parse(localStorage.getItem(BANK_KEY) ?? '[]');
const keep = (...stories: Story[]) => localStorage.setItem(BANK_KEY, JSON.stringify(stories));
const titles = (stories: readonly Story[]) => stories.map((s) => (s.deleted ? `${s.id} deleted` : s.title));
const putIds = (put: { mock: { calls: unknown[][] } }) => put.mock.calls.map(([path]) => path);

/** An account on the other end of the API, as the server keeps stories (see `storedAt`). */
function setup(account: Story[] = [], signedIn = true, serverNow = () => Date.now()) {
  const server = new Map(account.map((s) => [s.id, s]));
  const api = {
    get: vi.fn(async (_path: string) => ({ stories: [...server.values()] })),
    put: vi.fn(async (path: string, body: Story): Promise<{ story: Story }> => {
      const id = decodeURIComponent(path.slice('/stories/'.length));
      const current = server.get(id);
      if (current && Date.parse(current.updatedAt) >= Date.parse(body.updatedAt)) return { story: current };
      const sent = { ...body, updatedAt: nextChange(current, new Date(Math.min(Date.parse(body.updatedAt), serverNow()))) };
      server.set(id, sent);
      return { story: sent };
    }),
  };
  TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
  const tokens = TestBed.inject(AuthTokens);
  if (signedIn) tokens.accessToken.set('access-token');
  const bank = TestBed.inject(StoryBankService);
  return { bank, api, server, tokens };
}

describe('StoryBankService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('keeps an interview answer as a story tagged with its competency and titled by its first sentence', async () => {
    const { bank } = setup([], false);
    await bank.load();
    const answer = { ...EMPTY_STAR_DRAFT, situation: 'Our export failed for a week! Finance noticed.', action: 'I fixed it.' };
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-30T12:00:00Z'));
    await bank.saveAnswer(answer, 'ownership', 'Ownership');
    await bank.saveAnswer({ ...EMPTY_STAR_DRAFT, action: 'I fixed it.' }, 'conflict', 'Tell me about a disagreement.');
    vi.restoreAllMocks();
    expect(stored().map((s) => [s.title, s.competencyIds, s.draft.action])).toEqual([
      ['Our export failed for a week!', ['ownership'], 'I fixed it.'],
      ['Tell me about a disagreement.', ['conflict'], 'I fixed it.'],
    ]);
  });

  it('dates a new story by its creation, which edits and rehearsals keep', async () => {
    const { bank } = setup([], false);
    await bank.load();
    vi.useFakeTimers({ now: Date.parse('2026-09-01T09:00:00Z') });
    const saved = await bank.save(bank.blank().id, { title: 'Export', competencyIds: ['ownership'], draft: { action: 'I fixed it.' } });
    expect(saved.createdAt).toBe('2026-09-01T09:00:00.000Z');
    vi.setSystemTime(Date.parse('2026-09-20T09:00:00Z'));
    await bank.save(saved.id, { title: 'Export failure' });
    await bank.rehearse(saved.id, true);
    expect(stored()[0]).toMatchObject({ title: 'Export failure', createdAt: '2026-09-01T09:00:00.000Z' });
    expect(stored()[0].updatedAt > '2026-09-20').toBe(true);
  });

  it('keeps an anonymous bank on the device only, loads stories saved before sync, and deletes without tombstones', async () => {
    localStorage.setItem(
      BANK_KEY,
      JSON.stringify([
        { id: 'old', title: 'Old story', competencyIds: ['ownership'], draft: { ...EMPTY_STAR_DRAFT, action: 'I did it.' } },
      ]),
    );
    const { bank, api } = setup([], false);
    await bank.load();
    expect(bank.stories()[0]?.updatedAt).toBe('1970-01-01T00:00:00.000Z');
    await bank.save('old', { title: 'Renamed' });
    expect(bank.get('old')?.title).toBe('Renamed');
    await bank.remove('old');
    await bank.flush();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(bank.sync()).toBe('device');
    expect(localStorage.getItem(BANK_KEY)).toBeNull();
  });

  it("uploads the device's stories on signing in, older ones included", async () => {
    const legacy = { id: 'old', title: 'Old story', competencyIds: [], draft: { ...EMPTY_STAR_DRAFT, action: 'I did it.' } };
    localStorage.setItem(BANK_KEY, JSON.stringify([story('a', 'Mine', '2026-09-01T00:00:00.000Z'), legacy]));
    const { bank, server, tokens, api } = setup([], false);
    await bank.load();
    tokens.accessToken.set('access-token');
    TestBed.tick();
    await vi.waitFor(() => expect(server.size).toBe(2));
    expect(await bank.flush()).toEqual({ stories: [], checked: true });
    expect(api.get).toHaveBeenCalledWith('/stories');
    expect(titles([...server.values()])).toEqual(['Mine', 'Old story']);
    expect(server.get('old')?.updatedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(bank.sync()).toBe('synced');
  });

  it('merges the account in by latest change, uploads only what is newer here, and applies deletes both ways', async () => {
    keep(
      story('same', 'Same', '2026-09-01T00:00:00.000Z'),
      story('edited-here', 'Edited here', '2026-09-03T00:00:00.000Z'),
      story('edited-there', 'Stale here', '2026-09-01T00:00:00.000Z'),
      story('deleted-there', 'Deleted there', '2026-09-01T00:00:00.000Z'),
      deletedStory('deleted-here', '2026-09-03T00:00:00.000Z'),
    );
    const { bank, api, server } = setup([
      story('same', 'Same', '2026-09-01T00:00:00.000Z'),
      story('edited-here', 'Stale there', '2026-09-02T00:00:00.000Z'),
      story('edited-there', 'Edited there', '2026-09-02T00:00:00.000Z'),
      deletedStory('deleted-there', '2026-09-02T00:00:00.000Z'),
      story('deleted-here', 'Deleted here', '2026-09-02T00:00:00.000Z'),
      story('new-there', 'New there', '2026-09-02T00:00:00.000Z'),
      deletedStory('long-gone', '2026-08-01T00:00:00.000Z'),
    ]);
    await bank.flush();

    expect(putIds(api.put)).toEqual(['/stories/edited-here', '/stories/deleted-here']);
    expect(titles(bank.stories())).toEqual(['Same', 'Edited here', 'Edited there', 'New there']);
    expect(titles(stored())).toEqual([
      'Same',
      'Edited here',
      'Edited there',
      'deleted-there deleted',
      'deleted-here deleted',
      'New there',
      'long-gone deleted',
    ]);
    expect(server.get('deleted-here')?.deleted).toBe(true);
    expect(bank.pulled()).toBe(1);
  });

  it('keeps a delete as a tombstone until the account has it, then sends it no more', async () => {
    keep(story('a', 'A', '2026-09-01T00:00:00.000Z'));
    const { bank, api, server } = setup([story('a', 'A', '2026-09-01T00:00:00.000Z')]);
    await bank.flush();
    api.put.mockRejectedValueOnce(new ApiError(0, 'Cannot reach the Grasp server.'));
    await bank.remove('a');
    await bank.flush();
    expect(bank.sync()).toBe('failed');
    expect(bank.stories()).toEqual([]);
    expect(stored()).toEqual([expect.objectContaining({ id: 'a', deleted: true, title: '' })]);

    await bank.flush();
    expect(server.get('a')?.deleted).toBe(true);
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(bank.sync()).toBe('synced');
    await bank.resync();
    expect(api.put).toHaveBeenCalledTimes(2);
  });

  it('deletes a story the account never had outright, with no tombstone to upload', async () => {
    const { bank, api } = setup();
    await bank.flush();
    await bank.save('local', { title: 'Typed and dropped' });
    await bank.remove('local');
    expect(localStorage.getItem(BANK_KEY)).toBeNull();
    await bank.flush();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('keeps a story emptied for a rewrite until it is left blank, then deletes it everywhere', async () => {
    const { bank, server } = setup([story('a', 'A', '2026-09-01T00:00:00.000Z')]);
    await bank.flush();
    await bank.save('a', { title: '', competencyIds: [], draft: { ...EMPTY_STAR_DRAFT } });
    await bank.save('a', { title: 'Rewritten' });
    await bank.flush();
    expect(server.get('a')?.title).toBe('Rewritten');

    await bank.save('a', { title: '' });
    await bank.removeIfBlank('a');
    await bank.resync();
    expect(server.get('a')?.deleted).toBe(true);
    expect(bank.stories()).toEqual([]);
  });

  it('applies an edit to the latest stored story, so it keeps what another device changed', async () => {
    const { bank, server } = setup([story('a', 'Laptop title', '2026-09-01T00:00:00.000Z')]);
    await bank.flush();
    const open = bank.find('a')!;
    server.set('a', { ...open, draft: { ...open.draft, result: 'Written on the phone.' }, updatedAt: '2026-09-02T00:00:00.000Z' });
    await bank.resync();
    expect(bank.pulled()).toBe(2);

    expect(await bank.save('a', { title: 'Edited on the laptop' })).toMatchObject({ draft: { result: 'Written on the phone.' } });
    await bank.flush();
    expect(server.get('a')).toMatchObject({ title: 'Edited on the laptop', draft: { result: 'Written on the phone.' } });
  });

  it('keeps the bank of a learner whose session ended aside, and brings it back when they sign in here again', async () => {
    keep(story('a', 'Written after the session ended', '2026-09-01T00:00:00.000Z'));
    const { bank, server } = setup([], false);
    await bank.stash('learner-a');
    await bank.clear();
    expect(bank.stories()).toEqual([]);
    expect(localStorage.getItem('CapacitorStorage.grasp.behavioral.stories.learner-a')).not.toBeNull();

    TestBed.inject(AuthTokens).accessToken.set('access-token');
    TestBed.tick();
    await bank.restore('learner-a');
    await bank.flush();
    expect(titles(bank.stories())).toEqual(['Written after the session ended']);
    expect(server.get('a')?.title).toBe('Written after the session ended');
    expect(localStorage.getItem('CapacitorStorage.grasp.behavioral.stories.learner-a')).toBeNull();

    await bank.stash('learner-a');
    await bank.clear('learner-a');
    expect(localStorage.getItem('CapacitorStorage.grasp.behavioral.stories.learner-a')).toBeNull();
  });

  it('drops a bank kept aside more than 90 days ago when the story bank loads, and dates an undated one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = Date.parse('2026-06-01T00:00:00.000Z');
    vi.setSystemTime(start);
    const { bank } = setup([], false);
    keep(story('a', 'A', '2026-05-01T00:00:00.000Z'));
    await bank.stash('learner-a');
    vi.setSystemTime(start + DAY_MS);
    await bank.stash('learner-b');
    localStorage.setItem(stashKey('learner-c'), JSON.stringify([story('c', 'C', '2026-05-01T00:00:00.000Z')]));
    expect(JSON.parse(localStorage.getItem(stashKey('learner-a'))!)).toEqual({
      savedAt: new Date(start).toISOString(),
      stories: [expect.objectContaining({ id: 'a' })],
    });

    vi.setSystemTime(start + 90 * DAY_MS + 1);
    await bank.load();
    expect(localStorage.getItem(stashKey('learner-a'))).toBeNull();
    expect(localStorage.getItem(stashKey('learner-b'))).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(stashKey('learner-c'))!)).toEqual({
      savedAt: new Date(start + 90 * DAY_MS + 1).toISOString(),
      stories: [expect.objectContaining({ id: 'c' })],
    });

    vi.setSystemTime(start + 91 * DAY_MS + 1);
    await bank.clear();
    await bank.restore('learner-b');
    expect(bank.stories()).toEqual([]);
    expect(localStorage.getItem(stashKey('learner-b'))).toBeNull();
  });

  it('drops an unreadable bank kept aside instead of failing to load', async () => {
    const { bank } = setup([], false);
    localStorage.setItem(stashKey('learner-a'), '{not json');
    localStorage.setItem(stashKey('learner-b'), JSON.stringify({ savedAt: new Date().toISOString() }));
    await bank.load();
    expect(localStorage.getItem(stashKey('learner-a'))).toBeNull();
    expect(localStorage.getItem(stashKey('learner-b'))).toBeNull();
    await bank.restore('learner-a');
    expect(bank.stories()).toEqual([]);
  });

  it('merges a second bank kept aside for the same learner into the first, by latest change', async () => {
    const { bank } = setup([], false);
    keep(story('a', 'First session', '2026-09-01T00:00:00.000Z'), story('c', 'Only in the first', '2026-09-01T00:00:00.000Z'));
    await bank.stash('learner-a');
    await bank.clear();
    keep(story('a', 'Edited later', '2026-09-02T00:00:00.000Z'), story('b', 'Second session', '2026-09-02T00:00:00.000Z'));
    await bank.stash('learner-a');
    await bank.clear();

    await bank.restore('learner-a');
    expect(titles(bank.stories())).toEqual(['Edited later', 'Second session', 'Only in the first']);
  });

  it('never uploads a blank story, and sweeps stories left blank when the app closed, except the open one', async () => {
    keep(
      story('a', 'A', '2026-09-01T00:00:00.000Z'),
      blankStory('left', '2026-09-02T00:00:00.000Z'),
      blankStory('new', '2026-09-02T00:00:00.000Z'),
      blankStory('open', '2026-09-02T00:00:00.000Z'),
    );
    const { bank, api, server } = setup([story('left', 'Left', '2026-09-01T00:00:00.000Z')]);
    await bank.load('open');
    expect(titles(bank.stories())).toEqual(['A', '']);
    expect(stored().map((s) => s.id)).toEqual(['a', 'left', 'open']);

    await bank.save('typed', { title: '' });
    expect(await bank.flush()).toEqual({ stories: [], checked: true });
    expect(putIds(api.put)).toEqual(['/stories/a', '/stories/left']);
    expect(server.get('left')?.deleted).toBe(true);
  });

  it("dates an edit after the story's last change on a clock that runs behind, so the edit still wins", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const { bank, server } = setup([story('a', 'From a device ahead', future)], true, () => Date.parse(future) + 60_000);
    await bank.flush();
    await bank.save('a', { title: 'Edited here, behind' });
    await bank.flush();
    expect(server.get('a')?.title).toBe('Edited here, behind');
    expect(bank.sync()).toBe('synced');
  });

  it('keeps the copy the account dated at its own clock, and does not send it again', async () => {
    const serverNow = Date.now() - 3_600_000;
    const { bank, api, server } = setup([], true, () => serverNow);
    await bank.flush();
    await bank.save('a', { title: 'From a clock ahead' });
    await bank.flush();
    expect(bank.get('a')?.updatedAt).toBe(new Date(serverNow).toISOString());
    expect(server.get('a')?.updatedAt).toBe(new Date(serverNow).toISOString());
    await bank.flush();
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it('keeps uploading past a story that fails, and stops at once when rate limited', async () => {
    keep(
      story('broken', 'Broken', '2026-09-01T00:00:00.000Z'),
      story('fine', 'Fine', '2026-09-01T00:00:00.000Z'),
      story('later', 'Later', '2026-09-01T00:00:00.000Z'),
    );
    const { bank, api, server } = setup();
    const accept = api.put.getMockImplementation()!;
    api.put.mockImplementation(async (path, body) => {
      if (path === '/stories/broken') throw new ApiError(500, 'Internal server error');
      return accept(path, body);
    });
    expect((await bank.flush()).stories.map((s) => s.id)).toEqual(['broken']);
    expect([...server.keys()]).toEqual(['fine', 'later']);
    expect(bank.sync()).toBe('failed');

    api.put.mockClear();
    api.put.mockRejectedValue(new ApiError(429, 'Too many requests'));
    await bank.flush();
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it('names a story the account refuses, does not send it again until it changes, and counts it as unsynced', async () => {
    keep(story('refused', 'Refused', '2026-09-01T00:00:00.000Z'), story('fine', 'Fine', '2026-09-01T00:00:00.000Z'));
    const { bank, api, server } = setup();
    const accept = api.put.getMockImplementation()!;
    api.put.mockImplementation(async (path, body) => {
      if (path === '/stories/refused') throw new ApiError(409, 'An account keeps at most 100 stories.', 'story_limit');
      return accept(path, body);
    });
    expect((await bank.flush()).stories.map((s) => s.id)).toEqual(['refused']);
    expect([...server.keys()]).toEqual(['fine']);
    expect(bank.refusals()).toEqual([
      { story: expect.objectContaining({ id: 'refused' }), reason: 'the account already holds 100 stories' },
    ]);
    expect(bank.sync()).toBe('synced');

    const refusedSends = () => putIds(api.put).filter((path) => path === '/stories/refused').length;
    await bank.flush();
    expect(refusedSends()).toBe(1);
    await bank.save('refused', { title: 'Refused, trimmed' });
    await bank.flush();
    expect(refusedSends()).toBe(2);
    expect(stored().map((s) => s.id)).toEqual(['refused', 'fine']);

    await bank.resync();
    expect(refusedSends()).toBe(3);
    await bank.remove('fine');
    await bank.flush();
    await vi.waitFor(() => expect(refusedSends()).toBe(4));
  });

  it('uploads a burst of edits once, after a pause', async () => {
    const { bank, api } = setup();
    await bank.flush();
    vi.useFakeTimers();
    for (const title of ['T', 'Ti', 'Title']) await bank.save('a', { title });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(api.put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0]?.[1]).toMatchObject({ id: 'a', title: 'Title' });
  });

  it('clears the device after every queued change, so a sync still running cannot write the old account back', async () => {
    let answer!: (value: { stories: Story[] }) => void;
    const { bank, api, tokens } = setup();
    await bank.flush();
    await bank.save('mine', { title: 'Mine' });
    api.get.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const pending = bank.resync();
    tokens.accessToken.set(null);
    await bank.clear();
    answer({ stories: [story('theirs', 'Account story', '2026-09-01T00:00:00.000Z')] });
    await pending;
    expect(localStorage.getItem(BANK_KEY)).toBeNull();
    expect(bank.stories()).toEqual([]);
    expect(bank.sync()).toBe('device');
  });

  it('pulls again when the device comes back online, and when it comes back into view at most every 30 s', async () => {
    const { bank, api } = setup();
    await bank.flush();
    expect(api.get).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    document.dispatchEvent(new Event('visibilitychange'));
    await bank.flush();
    expect(api.get).toHaveBeenCalledTimes(3);
  });
});
