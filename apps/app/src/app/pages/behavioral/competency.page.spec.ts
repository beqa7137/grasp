import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { emptyProgress, examplesFor, type ProgressState } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { CompetencyPage } from './competency.page';
import { StarDraftsService } from './star-drafts.service';

describe('a competency page', () => {
  it("starts at the Target's level and keeps a level picked for the view through any other change of progress", () => {
    const senior: ProgressState = { ...emptyProgress(), target: { level: 'senior', rounds: { coding: 2, design: 2, behavioral: 1 } } };
    const state = signal(senior);
    TestBed.configureTestingModule({
      providers: [
        { provide: ProgressService, useValue: { state } },
        { provide: StarDraftsService, useValue: { load: async () => undefined, isDrafted: () => false } },
      ],
    });
    TestBed.overrideComponent(CompetencyPage, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(CompetencyPage);
    fixture.componentRef.setInput('id', 'leadership');
    const page = fixture.componentInstance;
    expect(page.level()).toBe('senior');
    expect(page.lookFor()).toBe(examplesFor('leadership')!.strong.find((s) => s.level === 'senior')!.lookFor);

    page.level.set('early');
    // A sync or any record replaces the state; the Target is the same, so the picked level stays.
    state.set({ ...senior, introduced: { ...senior.introduced, 'sd-caching': '2026-10-16T09:00:00.000Z' } });
    expect(page.level()).toBe('early');
    expect(page.lookFor()).toContain('Raising a standard');

    state.set({ ...senior, target: { level: 'mid', rounds: { coding: 2, design: 1, behavioral: 1 } } });
    expect(page.level()).toBe('mid');
    expect(page.assumed()).toBe(false);
  });
});
