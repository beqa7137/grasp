import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY_STAR_DRAFT, replay, reviewBank, type Story } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { QuestionLibraryPage } from './question-library.page';
import { StarDraftsService } from './star-drafts.service';
import { StoryBankService } from './story-bank.service';

const story: Story = {
  id: 's1',
  title: 'The cart argument',
  competencyIds: ['conflict'],
  draft: { ...EMPTY_STAR_DRAFT },
  updatedAt: '2026-10-16T09:00:00.000Z',
};

const microsoft = replay([
  {
    id: 't',
    at: '2026-10-16T09:00:00.000Z',
    type: 'target.set',
    target: { level: 'mid', rounds: { coding: 2, design: 1, behavioral: 1 }, company: 'microsoft' },
  },
]);

function render(params: Record<string, string> = {}, state = replay([])) {
  TestBed.resetTestingModule();
  const drafted = new Set(['conflict-2', 'ownership-1']);
  const all = signal([story]);
  const progress = signal(state);
  TestBed.configureTestingModule({
    imports: [QuestionLibraryPage],
    providers: [
      provideRouter([]),
      { provide: ProgressService, useValue: { state: progress } },
      {
        provide: StoryBankService,
        useValue: { stories: all, review: computed(() => reviewBank(all())), loaded: signal(true), load: async () => undefined },
      },
      {
        provide: StarDraftsService,
        useValue: {
          count: signal(drafted.size),
          loaded: signal(true),
          isDrafted: (id: string) => drafted.has(id),
          load: async () => undefined,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(QuestionLibraryPage);
  for (const [name, value] of Object.entries(params)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const rows = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLAnchorElement>('.rows a')].map((a) => ({
    href: a.getAttribute('href'),
    status: a.querySelector('.status')!.getAttribute('aria-label'),
    story: a.textContent!.includes('Covered by a story'),
  }));

describe('the Questions library', () => {
  it('lists all 91 questions under their 13 competencies, each linking its practice page with its status', () => {
    const host = render();
    expect(host.querySelectorAll('.group')).toHaveLength(13);
    expect(rows(host)).toHaveLength(91);
    expect(host.querySelector('[role="status"]')!.textContent).toBe('91 questions');
    expect(host.querySelector('.summary')!.textContent!.trim()).toBe('2 of 91 drafted on this device');
    expect(host.querySelector('.drill a')!.getAttribute('href')).toBe('/behavioral/drill');
    expect(rows(host)[0]).toEqual({ href: '/behavioral/question/ownership-1', status: 'Drafted on this device', story: false });
  });

  it('opens a deep link to a competency and a search, and says which questions a story covers', () => {
    const host = render({ competency: 'conflict', q: 'disagree' });
    expect(host.querySelector('[role="status"]')!.textContent).toBe('4 questions of 91');
    expect(rows(host).map((r) => r.href)).toEqual(
      ['conflict-1', 'conflict-2', 'conflict-3', 'conflict-6'].map((id) => `/behavioral/question/${id}`),
    );
    expect(rows(host).every((r) => r.story)).toBe(true);
    expect(rows(host)[1].status).toBe('Drafted on this device');
    const chip = [...host.querySelectorAll('button[g-chip]')].find((b) => b.textContent!.includes('Conflict & Disagreement'))!;
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.textContent!.replace(/\s+/g, ' ').trim()).toBe('Conflict & Disagreement 4');
  });

  it('filters by status and says when nothing matches', () => {
    expect(rows(render({ status: 'drafted' })).map((r) => r.href)).toEqual([
      '/behavioral/question/ownership-1',
      '/behavioral/question/conflict-2',
    ]);
    TestBed.resetTestingModule();
    const host = render({ q: 'zebra' });
    expect(host.querySelector('g-empty-state')!.textContent).toContain('No question matches "zebra".');
  });

  it('offers a Culture facet and culture chips only for an offered Target company', () => {
    const plain = render();
    expect(plain.querySelector('#question-culture')).toBeNull();
    expect(plain.querySelector('.rows .marks')).toBeNull();
    const host = render({}, microsoft);
    const chips = [...host.querySelectorAll('[aria-labelledby="question-culture"] button')].map((b) =>
      b.textContent!.replace(/\s+/g, ' ').trim(),
    );
    expect(chips).toEqual([
      'Growth mindset 18',
      'Customer obsessed 7',
      'Diverse and inclusive 2',
      'One Microsoft 15',
      'Making a difference 9',
    ]);
    const learning = host.querySelector<HTMLElement>('a[href="/behavioral/question/learning-1"]')!;
    expect(learning.querySelector('.marks')!.textContent!.trim()).toBe('Growth mindset');
  });

  it('filters by a culture attribute, from a link even without a Target company', () => {
    for (const host of [render({ culture: 'diverse-inclusive' }, microsoft), render({ culture: 'diverse-inclusive' })]) {
      expect(rows(host).map((r) => r.href)).toEqual(['/behavioral/question/collaboration-4', '/behavioral/question/leadership-6']);
      expect(host.querySelector('[aria-labelledby="question-culture"] [aria-pressed="true"]')!.textContent).toContain(
        'Diverse and inclusive',
      );
    }
  });
});
