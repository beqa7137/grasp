import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { NavController } from '@ionic/angular';
import { EMPTY_STAR_DRAFT, deletedStory, type Story } from '@grasp/engine';
import { ApiService } from '../../core/api.service';
import { AuthTokens } from '../../core/auth-tokens.service';
import { StarEditorComponent } from './star-editor.component';
import { StoryBankService } from './story-bank.service';
import { StoryPage } from './story.page';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: localStorage.getItem(`CapacitorStorage.${key}`) })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => localStorage.setItem(`CapacitorStorage.${key}`, value)),
    remove: vi.fn(async ({ key }: { key: string }) => localStorage.removeItem(`CapacitorStorage.${key}`)),
    keys: vi.fn(async () => ({ keys: [] })),
  },
}));

const story = (id: string, title: string, updatedAt: string): Story => ({
  id,
  title,
  competencyIds: ['ownership'],
  draft: { ...EMPTY_STAR_DRAFT, action: `I fixed ${title}.` },
  updatedAt,
});

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

async function setup(id: string, account: Story[] = []) {
  const server = new Map(account.map((s) => [s.id, s]));
  const api = {
    get: vi.fn(async (_path: string) => ({ stories: [...server.values()] })),
    put: vi.fn(async (path: string, body: Story) => {
      const current = server.get(body.id);
      if (current && Date.parse(current.updatedAt) >= Date.parse(body.updatedAt)) return { story: current };
      server.set(decodeURIComponent(path.slice('/stories/'.length)), body);
      return { story: body };
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: NavController, useValue: { navigateBack: async () => true } },
    ],
  });
  TestBed.overrideComponent(StoryPage, { set: { imports: [StarEditorComponent], schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
  TestBed.inject(AuthTokens).accessToken.set('access-token');
  const bank = TestBed.inject(StoryBankService);
  await bank.flush();
  const fixture = TestBed.createComponent(StoryPage);
  fixture.componentRef.setInput('id', id);
  fixture.detectChanges();
  await vi.waitFor(() => expect(fixture.componentInstance.story()).not.toBeNull());
  const page = fixture.componentInstance;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, page, bank, api, server, settle, text: () => (fixture.nativeElement as HTMLElement).textContent ?? '' };
}

describe('StoryPage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows a story deleted on another device as deleted, and saves nothing typed into it afterwards', async () => {
    const { page, bank, api, server, settle, text } = await setup('a', [story('a', 'Mine', '2026-09-01T00:00:00.000Z')]);
    expect(page.story()?.title).toBe('Mine');
    server.set('a', deletedStory('a', '2026-09-02T00:00:00.000Z'));
    await bank.resync();
    await settle();
    expect(text()).toContain('This story was deleted.');

    page.update({ title: 'Typed into a stale page' });
    await bank.flush();
    expect(bank.find('a')?.deleted).toBe(true);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('keeps what is typed after a synced story is cleared, and drops the story only if it is left blank', async () => {
    const { page, bank, server, settle, text } = await setup('n');
    page.update({ title: 'A' });
    await bank.flush();
    expect(server.get('n')?.title).toBe('A');

    page.update({ title: '' });
    page.update({ title: 'B' });
    await bank.flush();
    await bank.resync();
    await settle();
    expect(page.story()?.title).toBe('B');
    expect(bank.get('n')?.title).toBe('B');
    expect(server.get('n')?.title).toBe('B');
    expect(text()).not.toContain('This story was deleted.');

    page.update({ title: '' });
    page.ionViewWillLeave();
    await bank.flush();
    expect(bank.get('n')).toBeUndefined();
    expect(server.get('n')?.deleted).toBe(true);
  });

  it('keeps a keystroke that a sync lands under, and then shows what the sync brought in', async () => {
    const { page, bank, server } = await setup('a', [story('a', 'Mine', '2026-09-01T00:00:00.000Z')]);
    const pulled = { ...story('a', 'Mine', '2026-09-02T00:00:00.000Z'), draft: { ...EMPTY_STAR_DRAFT, result: 'From the phone.' } };
    server.set('a', pulled);
    const [adoptWrite, saveWrite] = [gate(), gate()];
    const set = vi.mocked(Preferences.set);
    const write = set.getMockImplementation()!;
    set.mockClear();
    set.mockImplementationOnce(async (options) => (await adoptWrite.opened, write(options)));
    set.mockImplementationOnce(async (options) => (await saveWrite.opened, write(options)));

    const sync = bank.resync();
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    page.update({ title: 'Typed' });
    adoptWrite.open();
    await vi.waitFor(() => expect(bank.pulled()).toBe(2));
    TestBed.tick();
    expect(page.story()?.title).toBe('Typed');

    saveWrite.open();
    await sync;
    await bank.load();
    await vi.waitFor(() => expect(page.story()?.draft.result).toBe('From the phone.'));
    expect(page.story()?.title).toBe('Typed');
  });
});
