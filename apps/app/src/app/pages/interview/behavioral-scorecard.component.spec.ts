import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { EMPTY_STAR_DRAFT, rehearse, type StarDraft, type Story } from '@grasp/engine';
import { ApiError, ApiService } from '../../core/api.service';
import { ProgressService } from '../../core/progress.service';
import { StoryBankService } from '../behavioral/story-bank.service';
import { BehavioralScorecardComponent } from './behavioral-scorecard.component';
import type { InterviewSession, Scorecard } from './interview.types';

const STAR: StarDraft = { ...EMPTY_STAR_DRAFT, situation: 'Our export failed for a week. Finance noticed.', action: 'We fixed it.' };
const told = (id: string, competencyIds: string[]): Story =>
  rehearse(
    { id, title: id, competencyIds, draft: { ...EMPTY_STAR_DRAFT, action: 'I fixed it.' }, updatedAt: '2026-09-01T00:00:00Z' },
    true,
    new Date(Date.now() - 60_000),
  );

function render(card: Partial<Scorecard> = {}, options: { fromStory?: boolean; stories?: Story[]; weakSince?: string } = {}) {
  const session: InterviewSession = {
    id: 'session',
    track: 'behavioral',
    problem: { id: 'conflict-1', title: 'Conflict & Disagreement', track: 'behavioral', patternIds: [], competencyId: 'conflict' },
    messages: [
      { role: 'interviewer', content: 'Tell me about a disagreement.', at: '2026-09-29T00:00:00Z' },
      { role: 'candidate', content: '[STAR ANSWER]', at: '2026-09-29T00:01:00Z', star: STAR },
    ],
    hintsUsed: 0,
    status: 'scored',
    createdAt: '2026-09-29T00:00:00Z',
    mode: 'ai',
    aiAccess: 'available',
    scorecard: {
      verdict: 'lean-no-hire',
      summary: 'Say what you did.',
      dimensions: [],
      strengths: [],
      improvements: [],
      weakPatterns: [],
      mode: 'ai',
      flaws: [
        { id: 'we-not-i', quote: 'We fixed it.', fix: 'I rolled back the deploy and [step].' },
        { id: 'no-result', quote: null, fix: 'It cut failures from [number] to [number].' },
      ],
      weakCompetencies: ['conflict', 'ownership'],
      ...card,
    },
  };
  const stories = signal<Story[]>(options.stories ?? []);
  const bank = {
    load: vi.fn(async () => undefined),
    stories,
    tagged: (id: string) => stories().filter((s) => s.competencyIds.includes(id)),
    saveAnswer: vi.fn(async () => ({}) as Story),
  };
  const since = options.weakSince ?? new Date().toISOString();
  const progress = { state: signal({ behavioral: { conflict: { lastAt: since, verdict: 'lean-no-hire', weakSince: since } } }) };
  const api = { post: vi.fn(async () => ({ id: 'next' })) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: StoryBankService, useValue: bank },
      { provide: ProgressService, useValue: progress },
      { provide: ApiService, useValue: api },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(BehavioralScorecardComponent);
  fixture.componentRef.setInput('session', session);
  fixture.componentRef.setInput('fromStory', options.fromStory ?? false);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;
  return { fixture, el, button, bank, api, navigate, stories };
}

describe('BehavioralScorecardComponent', () => {
  it('lists each flaw by its label, with the quote when there is one and the fix to say instead', () => {
    const { el } = render();
    const items = [...el.querySelectorAll('.flaws li')];
    expect(items.map((li) => li.querySelector('.flaw')?.textContent?.trim())).toEqual([
      'Says "we", so what the candidate did is unclear',
      'No measurable result',
    ]);
    expect(items[0].querySelector('blockquote')?.textContent).toBe('We fixed it.');
    expect(items[1].querySelector('blockquote')).toBeNull();
    expect(items[1].querySelector('.fix')?.textContent?.trim()).toBe('Say it like this: It cut failures from [number] to [number].');
  });

  it('points a flagged competency at the stories now due for it, or at writing one', () => {
    const { el } = render({}, { stories: [told('a', ['conflict']), told('b', ['conflict', 'tradeoffs'])] });
    const lines = [...el.querySelectorAll('.flagged')];
    expect(lines[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Conflict & Disagreement is flagged: 2 stories that cover it are due for rehearsal now',
    );
    expect(lines[0].querySelector('a')?.getAttribute('href')).toBe('/behavioral/rehearse');
    expect(lines[1].textContent?.replace(/\s+/g, ' ').trim()).toBe('No story covers Ownership yet: write one');
    expect(lines[1].querySelector('a')?.getAttribute('href')).toBe('/behavioral/stories');
  });

  it('keeps an answer that did not start from a story in the bank, once', async () => {
    const { fixture, button, bank } = render();
    button('Add to story bank')!.click();
    await fixture.whenStable();
    expect(bank.saveAnswer).toHaveBeenCalledExactlyOnceWith(STAR, 'conflict', 'Conflict & Disagreement');
    expect(button('In your story bank')!.disabled).toBe(true);
  });

  it('does not offer to keep an answer started from a story or already in the bank', () => {
    expect(render({}, { fromStory: true }).button('Add to story bank')).toBeUndefined();
    TestBed.resetTestingModule();
    const inBank: Story = {
      id: 's',
      title: 'Kept',
      competencyIds: ['conflict'],
      draft: { ...STAR, action: ' We fixed it. ' },
      updatedAt: '',
    };
    expect(render({}, { stories: [inBank] }).button('Add to story bank')).toBeUndefined();
  });

  it('says when a flagged competency has nothing due, and counts only stories with something to tell', () => {
    const blank: Story = { id: 'blank', title: 'Blank', competencyIds: ['ownership'], draft: { ...EMPTY_STAR_DRAFT }, updatedAt: '' };
    const { el } = render({}, { stories: [told('a', ['conflict']), blank], weakSince: new Date(Date.now() - 3_600_000).toISOString() });
    const lines = [...el.querySelectorAll('.flagged')].map((l) => l.textContent?.replace(/\s+/g, ' ').trim());
    expect(lines).toEqual([
      'Conflict & Disagreement is flagged: nothing to rehearse right now.',
      'No story covers Ownership yet: write one',
    ]);
  });

  it('offers sign-in and scripted practice when the AI interviewer is refused', async () => {
    const { fixture, el, button, api } = render();
    api.post.mockRejectedValueOnce(new ApiError(403, 'Sign in to use the AI interviewer.', 'ai_sign_in_required'));
    button('Try another question')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('app-sign-in-options')).not.toBeNull();
    const scripted = [...el.querySelectorAll('a')].find((a) => a.textContent?.includes('scripted follow-ups'));
    expect(scripted?.getAttribute('href')).toMatch(/^\/behavioral\/drill\?question=conflict-\d+$/);
    expect(scripted?.getAttribute('href')).not.toContain('conflict-1');
  });

  it('starts another AI question on the same competency, never this one, and links to practising this one', async () => {
    const { fixture, el, button, api, navigate } = render();
    button('Try another question')!.click();
    await fixture.whenStable();
    const [path, body] = api.post.mock.calls[0] as unknown as [string, { track: string; problemId: string; mode: string }];
    expect(path).toBe('/interview/sessions');
    expect(body).toMatchObject({ track: 'behavioral', mode: 'ai' });
    expect(body.problemId).toMatch(/^conflict-\d+$/);
    expect(body.problemId).not.toBe('conflict-1');
    expect(navigate).toHaveBeenCalledWith('/mock/next', expect.anything());
    expect([...el.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Practice this question')?.getAttribute('href')).toBe(
      '/behavioral/question/conflict-1',
    );
  });
});
