import { TestBed } from '@angular/core/testing';
import { StarDraftsService } from './star-drafts.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    keys: vi.fn(async () => ({
      keys: [
        'grasp.behavioral.draft.ownership-1',
        'grasp.behavioral.draft.conflict-7',
        'grasp.behavioral.draft.conflict-8',
        'grasp.behavioral.draft.retired-1',
        'grasp.theme',
      ],
    })),
    get: vi.fn(async () => ({ value: null })),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  },
}));

describe('STAR drafts on this device', () => {
  it('counts drafts of current questions only, so a stale key never reads "92 of 91"', async () => {
    const drafts = TestBed.inject(StarDraftsService);
    expect(drafts.loaded()).toBe(false);
    await drafts.load();
    expect(drafts.loaded()).toBe(true);
    expect(drafts.count()).toBe(2);
    expect(drafts.draftedIn('conflict')).toBe(1);
    expect(drafts.isDrafted('retired-1')).toBe(false);
  });
});
