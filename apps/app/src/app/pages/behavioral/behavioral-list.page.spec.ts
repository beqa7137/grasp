import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY_STAR_DRAFT, emptyProgress, reviewBank, type ProgressState, type Story } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { BehavioralListPage } from './behavioral-list.page';
import { StarDraftsService } from './star-drafts.service';
import { StoryBankService } from './story-bank.service';

const NOW = new Date('2026-10-16T09:00:00Z');

const story = (competencyIds: string[], rehearsal?: Story['rehearsal']): Story => ({
  id: competencyIds.join('-'),
  title: 'The billing export',
  competencyIds,
  draft: { ...EMPTY_STAR_DRAFT, action: 'I rotated the credential and added an alert.' },
  rehearsal,
  updatedAt: NOW.toISOString(),
});

function render(state: ProgressState, stories: Story[], drafted: string[] = []) {
  TestBed.resetTestingModule();
  const all = signal(stories);
  TestBed.configureTestingModule({
    imports: [BehavioralListPage],
    providers: [
      provideRouter([]),
      { provide: ProgressService, useValue: { state: signal(state), now: signal(NOW) } },
      {
        provide: StoryBankService,
        useValue: { stories: all, review: computed(() => reviewBank(all())), loaded: signal(true), load: async () => undefined },
      },
      {
        provide: StarDraftsService,
        useValue: {
          count: signal(drafted.length),
          loaded: signal(true),
          draftedIn: (id: string) => drafted.filter((q) => q.startsWith(`${id}-`)).length,
          load: async () => undefined,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BehavioralListPage);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const row = (name: string) =>
    [...host.querySelectorAll<HTMLElement>('.rows a')].find((a) => a.querySelector('.title')!.textContent === name)!;
  const meta = (name: string) => [...row(name).querySelectorAll('.meta > span')].map((m) => m.textContent).join(' · ');
  return { host, row, meta, text: (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim() };
}

describe('the Behavioral hub Competencies', () => {
  it('sums up stories, drafts and what is due, and offers rehearsal only when a story is due', () => {
    const { host, text } = render(emptyProgress(), [story(['ownership', 'delivery'])], ['ownership-1', 'conflict-2']);
    expect(text(host.querySelector('.summary')!)).toBe(
      '2 of 13 competencies have a story · 2 of 91 questions drafted on this device · 1 story due',
    );
    expect(host.querySelector('a.rehearse')!.getAttribute('href')).toBe('/behavioral/rehearse');
    expect(text(host.querySelector('a.rehearse')!)).toContain('Rehearse 1 story');
    expect(host.querySelector('.guide a')!.getAttribute('href')).toBe('/behavioral/guide');

    const told = story(['ownership'], { step: 0, told: 1, due: new Date(NOW.getTime() + 86_400_000).toISOString() });
    const later = render(emptyProgress(), [told]);
    expect(later.text(later.host.querySelector('.summary')!)).toBe(
      '1 of 13 competencies has a story · 0 of 91 questions drafted on this device',
    );
    expect(later.host.querySelector('a.rehearse')).toBeNull();
  });

  it('gives each of the 13 rows its state, questions, drafts and stories, and marks a flag', () => {
    const state = emptyProgress();
    state.behavioral['conflict'] = { lastAt: NOW.toISOString(), verdict: 'lean-no-hire', weakSince: NOW.toISOString() } as never;
    const told = story(['ownership'], { step: 0, told: 1, due: NOW.toISOString() });
    const { host, row, meta, text } = render(state, [told], ['ownership-1', 'ownership-3']);
    expect(host.querySelectorAll('.rows li')).toHaveLength(13);
    expect(meta('Ownership')).toBe('7 questions · 2 drafted · 1 story');
    expect(row('Ownership').querySelector('g-skill-state')!.getAttribute('aria-label')).toBe('Practiced');
    expect(meta('Delivering Results')).toBe('7 questions · 0 stories');
    expect(row('Delivering Results').querySelector('g-skill-state')!.getAttribute('aria-label')).toBe('New');
    expect(text(row('Conflict & Disagreement'))).toContain('Flagged');
    expect(row('Conflict & Disagreement').querySelector('g-skill-state')!.getAttribute('aria-label')).toBe('Learning');
    expect(host.textContent).not.toContain('Senior focus');
  });

  it("counts a story for its first three tags only, as the competency's state does", () => {
    const four = story(['ownership', 'delivery', 'ambiguity', 'conflict'], { step: 0, told: 1, due: NOW.toISOString() });
    const { host, row, meta, text } = render(emptyProgress(), [four]);
    expect(meta('Ambiguity')).toBe('7 questions · 1 story');
    expect(row('Ambiguity').querySelector('g-skill-state')!.getAttribute('aria-label')).toBe('Practiced');
    expect(meta('Conflict & Disagreement')).toBe('7 questions · 0 stories');
    expect(row('Conflict & Disagreement').querySelector('g-skill-state')!.getAttribute('aria-label')).toBe('New');
    expect(text(host.querySelector('.summary')!)).toMatch(/^3 of 13 competencies have a story/);
  });

  it('marks the five double-weight competencies as Senior focus in a Senior loop', () => {
    const state: ProgressState = { ...emptyProgress(), target: { level: 'senior', rounds: { coding: 2, design: 2, behavioral: 1 } } };
    const { host, text } = render(state, []);
    const focus = [...host.querySelectorAll('.rows a')]
      .filter((a) => text(a).includes('Senior focus'))
      .map((a) => a.querySelector('.title')!.textContent);
    expect(focus).toEqual([
      'Ambiguity',
      'Influence Without Authority',
      'Leadership & Mentoring',
      'Prioritization & Trade-offs',
      'Technical Depth',
    ]);
  });
});
