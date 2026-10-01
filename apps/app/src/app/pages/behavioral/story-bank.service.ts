import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  EMPTY_STAR_DRAFT,
  STORY_LIMITS,
  deletedStory,
  isEmptyDraft,
  isNewer,
  mergeStories,
  nextChange,
  rehearse,
  reviewBank,
  type StarDraft,
  type Story,
} from '@grasp/engine';
import { ApiError, ApiService } from '../../core/api.service';
import { AuthTokens } from '../../core/auth-tokens.service';
import { STORY_BANK_KEY, storyStashKey } from '../../core/local-drafts';
import { readStoryStash, sweepStoryStashes, writeStoryStash } from '../../core/story-stash';
import { VISIBLE_RESYNC_GAP_MS } from '../../core/progress.service';

const PUSH_DELAY_MS = 1_500;
// Stories saved before sync have no updatedAt: dated as the oldest possible change, any synced copy wins over them.
const BEFORE_SYNC = new Date(0).toISOString();
/** Answers that end a sync: the device is offline, signed out, erased or sending too fast. */
const STOP_STATUSES = new Set([0, 401, 410, 429]);
const REFUSED: Record<number, string> = {
  400: `it has text the account cannot store, such as a part over ${STORY_LIMITS.part.toLocaleString('en-US')} characters`,
  409: `the account already holds ${STORY_LIMITS.stories} stories`,
  413: 'it is too long for the account',
};

export type StorySync = 'device' | 'synced' | 'failed';
export type StoryPatch = Partial<Pick<Story, 'title' | 'competencyIds'>> & { draft?: Partial<StarDraft> };

export const STORY_SYNC_NOTES: Record<StorySync, string> = {
  device: 'Saved on this device only.',
  synced: 'Synced to your account.',
  failed: 'Some changes have not reached your account yet. They are saved on this device.',
};

interface Refusal {
  updatedAt: string;
  status: number;
  reason: string;
}

export interface Unsynced {
  stories: Story[];
  /** False when the account could not be asked, so any of them may be missing from it. */
  checked: boolean;
}

const firstSentence = (text: string) =>
  text
    .trim()
    .split(/(?<=[.!?])\s/)[0]
    .slice(0, 80);

const isBlank = (story: Story) => !story.deleted && !story.title.trim() && !story.competencyIds.length && isEmptyDraft(story.draft);

/**
 * The story bank lives on the device and, while the learner is signed in, syncs with the account: each story keeps its
 * latest change, and a delete of a story the account has leaves a tombstone, as the account does.
 */
@Injectable({ providedIn: 'root' })
export class StoryBankService {
  private readonly api = inject(ApiService);
  private readonly tokens = inject(AuthTokens);
  private readonly all = signal<readonly Story[]>([]);
  private readonly failed = signal(false);
  private readonly refused = signal<ReadonlyMap<string, Refusal>>(new Map());
  private readonly pulls = signal(0);
  private readonly signedIn = computed(() => this.tokens.accessToken() !== null);
  readonly stories = computed(() => this.all().filter((s) => !s.deleted));
  readonly review = computed(() => reviewBank(this.stories()));
  readonly sync = computed<StorySync>(() => (!this.signedIn() ? 'device' : this.failed() ? 'failed' : 'synced'));
  /** Counts syncs that brought in another device's changes, so an open story can follow them. */
  readonly pulled = this.pulls.asReadonly();
  /** Stories the account refused, and why, until they change on this device. */
  readonly refusals = computed(() =>
    this.stories().flatMap((story) => {
      const refusal = this.refused().get(story.id);
      return refusal?.updatedAt === story.updatedAt ? [{ story, reason: refusal.reason }] : [];
    }),
  );
  private queue = Promise.resolve();
  /** Changes on signing in and out, so a sync that outlives its session writes nothing. */
  private session = 0;
  private sessionSignedIn = this.signedIn();
  /** The account's copy of each story as of the last pull; null when the next sync must pull first. */
  private remote: Map<string, Story> | null = null;
  private syncing: Promise<void> | null = null;
  private next: Promise<void> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private swept = false;

  constructor() {
    if (this.sessionSignedIn) void this.push();
    effect(() => {
      const signedIn = this.signedIn();
      untracked(() => {
        if (signedIn === this.sessionSignedIn) return;
        this.sessionSignedIn = signedIn;
        this.endSession();
        if (signedIn) void this.push();
      });
    });
    let lastVisibleResync = 0;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastVisibleResync < VISIBLE_RESYNC_GAP_MS) return;
      lastVisibleResync = Date.now();
      void this.resync();
    };
    const onOnline = () => void this.resync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.pushTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    });
  }

  /**
   * The first load also drops expired stashes, and stories left blank when the app closed before their page was left,
   * except the story whose page is `open`.
   */
  load(open?: string): Promise<void> {
    if (this.swept) return this.enqueue(() => this.read());
    this.swept = true;
    const now = new Date();
    return this.change((stories) => {
      const blank = stories.filter((s) => s.id !== open && isBlank(s));
      return blank.length ? blank.reduce((rest, s) => this.without(rest, s.id, now), stories) : stories;
    }).then((changed) => {
      if (changed) this.pushSoon();
      return this.enqueue(() => sweepStoryStashes(now));
    });
  }

  get(id: string): Story | undefined {
    return this.stories().find((s) => s.id === id);
  }

  /** Includes a story deleted on another device, which an open page shows as deleted. */
  find(id: string): Story | undefined {
    return this.all().find((s) => s.id === id);
  }

  tagged(competencyId: string): Story[] {
    return this.stories().filter((s) => s.competencyIds.includes(competencyId));
  }

  blank(id: string = crypto.randomUUID()): Story {
    const now = new Date().toISOString();
    return { id, title: '', competencyIds: [], draft: { ...EMPTY_STAR_DRAFT }, updatedAt: now, createdAt: now };
  }

  /**
   * Applies `patch` to the stored story, not to a copy a page holds, so an edit keeps what another device changed
   * meanwhile, and resolves with the story as stored. Editing a deleted story brings it back; the page of a story
   * deleted elsewhere stops editing it instead.
   */
  save(id: string, patch: StoryPatch): Promise<Story> {
    const now = new Date();
    let saved!: Story;
    return this.edit((stories) => {
      const current = stories.find((s) => s.id === id);
      const base = current && !current.deleted ? current : this.blank(id);
      saved = { ...base, ...patch, draft: { ...base.draft, ...patch.draft }, updatedAt: nextChange(current, now) };
      return current ? stories.map((s) => (s.id === id ? saved : s)) : [...stories, saved];
    }).then(() => saved);
  }

  /** Keeps an interview answer as a new story about `competencyId`, titled by its opening sentence or else `fallbackTitle`. */
  saveAnswer(answer: StarDraft, competencyId: string, fallbackTitle: string): Promise<Story> {
    return this.save(this.blank().id, {
      title: (firstSentence(answer.situation) || fallbackTitle).slice(0, STORY_LIMITS.title),
      competencyIds: [competencyId],
      draft: answer,
    });
  }

  /** A story left with no title, tags or text is not kept, the way an empty STAR draft is not. */
  removeIfBlank(id: string): Promise<void> {
    const now = new Date();
    return this.edit((stories) => {
      const current = stories.find((s) => s.id === id);
      return current && isBlank(current) ? this.without(stories, id, now) : stories;
    });
  }

  rehearse(id: string, toldWell: boolean): Promise<void> {
    const now = new Date();
    return this.edit((stories) => stories.map((s) => (s.id === id && !s.deleted ? rehearse(s, toldWell, now) : s)));
  }

  remove(id: string): Promise<void> {
    const now = new Date();
    return this.edit((stories) => this.without(stories, id, now));
  }

  /** Pulls the account's stories again, then uploads what changed here, including stories refused for the limit. */
  resync(): Promise<void> {
    this.remote = null;
    this.forgetLimitRefusals();
    return this.push();
  }

  /** Uploads pending changes now, and resolves with the stories the account still lacks. */
  async flush(): Promise<Unsynced> {
    clearTimeout(this.pushTimer);
    await this.load();
    await this.push();
    const remote = this.remote;
    const unsynced = this.stories().filter((s) => !isBlank(s) && (!remote || isNewer(s, remote.get(s.id))));
    return { stories: unsynced, checked: remote !== null };
  }

  /**
   * Starts the device fresh, queued after every pending change, so none of them can write the old bank back. With a
   * learner, also drops the bank kept aside for that learner, whose data is being removed from this device.
   */
  clear(learnerId?: string): Promise<void> {
    clearTimeout(this.pushTimer);
    this.endSession();
    return this.enqueue(async () => {
      await this.store([]);
      if (learnerId) await Preferences.remove({ key: storyStashKey(learnerId) });
    });
  }

  /** Keeps the bank aside, with any kept before, for a learner whose session ended, until they sign in here again. */
  stash(learnerId: string): Promise<void> {
    return this.enqueue(async () => {
      await this.read();
      if (!this.stories().length) return;
      const now = new Date();
      await writeStoryStash(learnerId, mergeStories(this.all(), await readStoryStash(learnerId, now)), now);
    });
  }

  /** Brings back a bank kept aside for this learner, merged by latest change, and uploads it. */
  async restore(learnerId: string): Promise<void> {
    await this.enqueue(async () => {
      const stashed = await readStoryStash(learnerId, new Date());
      if (!stashed.length) return;
      await this.read();
      await this.store(mergeStories(this.all(), stashed));
      await Preferences.remove({ key: storyStashKey(learnerId) });
    });
    void this.push();
  }

  private endSession() {
    this.session++;
    this.remote = null;
    this.failed.set(false);
    this.refused.set(new Map());
  }

  /** A delete leaves a tombstone only where an account has, or may have, the story; otherwise it simply goes. */
  private without(stories: readonly Story[], id: string, now: Date): readonly Story[] {
    const current = stories.find((s) => s.id === id);
    if (!current || current.deleted) return stories;
    const accountMayHaveIt = this.signedIn() ? !this.remote || this.remote.has(id) : this.tokens.signInRequired();
    return accountMayHaveIt
      ? stories.map((s) => (s.id === id ? deletedStory(id, nextChange(current, now)) : s))
      : stories.filter((s) => s.id !== id);
  }

  private edit(apply: (stories: readonly Story[]) => readonly Story[]): Promise<void> {
    const edited = this.change(apply);
    void edited.then(() => this.pushSoon());
    return edited.then(() => undefined);
  }

  private pushSoon() {
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.push(), PUSH_DELAY_MS);
  }

  /** One sync at a time; a call during one gets the sync after it, which sees every change made meanwhile. */
  private push(): Promise<void> {
    if (!this.signedIn()) return Promise.resolve();
    if (this.syncing) {
      this.next ??= this.syncing.then(() => {
        this.next = null;
        return this.push();
      });
      return this.next;
    }
    const run = this.upload().finally(() => (this.syncing = null));
    this.syncing = run;
    return run;
  }

  /** Never rejects: a story that cannot sync now stays on the device, marked as not synced. */
  private async upload(): Promise<void> {
    const session = this.session;
    let unsynced = false;
    let roomMade = false;
    try {
      let remote = this.remote;
      if (!remote) {
        const { stories } = await this.api.get<{ stories: Story[] }>('/stories');
        if (session !== this.session) return;
        remote = new Map(stories.map((s) => [s.id, s]));
        this.remote = remote;
        if (await this.adopt(stories, remote, session)) this.pulls.update((n) => n + 1);
      }
      for (const story of this.all().filter((s) => !isBlank(s) && isNewer(s, remote.get(s.id)) && !this.isRefused(s))) {
        let stored: Story;
        try {
          stored = (await this.api.put<{ story: Story }>(`/stories/${encodeURIComponent(story.id)}`, story)).story;
        } catch (error) {
          if (!(error instanceof ApiError) || STOP_STATUSES.has(error.status)) throw error;
          if (session !== this.session) return;
          if (REFUSED[error.status]) this.refuse(story, error.status);
          else unsynced = true;
          continue;
        }
        if (session !== this.session) return;
        remote.set(stored.id, stored);
        if (stored.deleted) roomMade = this.forgetLimitRefusals() || roomMade;
        if ((await this.adopt([stored], remote, session, story)) && isNewer(stored, story)) this.pulls.update((n) => n + 1);
      }
    } catch {
      unsynced = true;
    }
    if (session !== this.session) return;
    this.failed.set(unsynced);
    if (roomMade) void this.push();
  }

  private isRefused(story: Story): boolean {
    return this.refused().get(story.id)?.updatedAt === story.updatedAt;
  }

  private refuse(story: Story, status: number) {
    this.refused.update((refused) => new Map(refused).set(story.id, { updatedAt: story.updatedAt, status, reason: REFUSED[status]! }));
  }

  /** A story refused for the limit may fit once another is deleted; true when there were any to retry. */
  private forgetLimitRefusals(): boolean {
    const kept = [...this.refused()].filter(([, refusal]) => refusal.status !== 409);
    if (kept.length === this.refused().size) return false;
    this.refused.set(new Map(kept));
    return true;
  }

  /**
   * Merges the account's copies in. Tombstones stay only for stories the account has, so an open page can tell that one
   * was deleted elsewhere. The copy the account stored for one this device sent replaces it, as the account may have
   * dated it earlier. Nothing is written once the session has ended.
   */
  private adopt(incoming: readonly Story[], remote: ReadonlyMap<string, Story>, session: number, sent?: Story): Promise<boolean> {
    return this.change((stories) => {
      if (session !== this.session || !this.signedIn()) return stories;
      const current = sent ? stories.map((s) => (s.id === sent.id && s.updatedAt === sent.updatedAt ? incoming[0]! : s)) : stories;
      const merged = mergeStories(current, incoming).filter((s) => !s.deleted || remote.has(s.id));
      return merged.length === stories.length && merged.every((s, i) => s === stories[i]) ? stories : merged;
    });
  }

  /**
   * Each change starts from what is stored, not from memory, so erasing the learner's data while a story is open is not
   * undone by the next keystroke; the queue keeps fast keystrokes from overwriting each other. Resolves whether it wrote.
   */
  private change(apply: (stories: readonly Story[]) => readonly Story[]): Promise<boolean> {
    let changed = false;
    return this.enqueue(async () => {
      await this.read();
      const stories = apply(this.all());
      changed = stories !== this.all();
      if (changed) await this.store(stories);
    }).then(() => changed);
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const run = this.queue.then(work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<void> {
    const { value } = await Preferences.get({ key: STORY_BANK_KEY });
    const stories = value ? (JSON.parse(value) as Story[]) : [];
    this.all.set(stories.map((s) => (s.updatedAt ? s : { ...s, updatedAt: BEFORE_SYNC })));
  }

  private async store(stories: readonly Story[]): Promise<void> {
    this.all.set(stories);
    await (stories.length
      ? Preferences.set({ key: STORY_BANK_KEY, value: JSON.stringify(stories) })
      : Preferences.remove({ key: STORY_BANK_KEY }));
  }
}
