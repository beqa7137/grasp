import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { getCaseStudy } from '@grasp/engine';
import { ProgressService } from '../../../core/progress.service';
import { CaseDraftsService, readCaseDraft, type CaseDraft } from './case-drafts.service';
import { CaseStudyPage } from './case-study.page';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: localStorage.getItem(`CapacitorStorage.${key}`) })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => localStorage.setItem(`CapacitorStorage.${key}`, value)),
    remove: vi.fn(async ({ key }: { key: string }) => localStorage.removeItem(`CapacitorStorage.${key}`)),
    keys: vi.fn(async () => ({ keys: Object.keys(localStorage).map((k) => k.replace(/^CapacitorStorage\./, '')) })),
  },
}));

const study = getCaseStudy('url-shortener')!;
const KEY = 'CapacitorStorage.grasp.case.url-shortener';
const stored = () => readCaseDraft(localStorage.getItem(KEY));
const all = (i: number) => study.stages[i].points.length;
/** Every stage answered as recommended, with every point open, the last stage still ahead. */
const answeredDraft = (): CaseDraft => ({
  attempt: 'attempt-1',
  reached: study.stages.length - 1,
  stages: study.stages.map((s, i) => ({
    ...(s.decision ? { chosen: 0 } : {}),
    ...(s.estimate ? { guess: String(s.estimate.answer) } : {}),
    revealed: all(i),
  })),
});

async function open(draft?: string) {
  if (draft !== undefined) localStorage.setItem(KEY, draft);
  const record = vi.fn(async () => undefined);
  const cleared = signal(0);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ProgressService, useValue: { record, cleared } }] });
  const fixture = TestBed.createComponent(CaseStudyPage);
  fixture.componentRef.setInput('id', 'url-shortener');
  fixture.detectChanges();
  const fresh = fixture.componentInstance.draft();
  if (draft !== undefined) await vi.waitFor(() => expect(fixture.componentInstance.draft()).not.toBe(fresh));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const stage = (i: number) => el.querySelectorAll('app-case-stage')[i] as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { page: fixture.componentInstance, el, stage, settle, record, cleared };
}

describe('CaseStudyPage answers', () => {
  beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('saves each decision, estimate and opened point as the learner goes', async () => {
    const { page, stage, settle } = await open();
    const options = stage(0).querySelectorAll<HTMLButtonElement>('fieldset button');
    options[2].click();
    await settle();
    expect(stored()?.stages[0]).toEqual({ chosen: 2 });

    (stage(0).querySelector('.controls button') as HTMLButtonElement).click();
    await settle();
    expect(stored()?.stages[0]).toEqual({ chosen: 2, revealed: 1 });

    page.answer(0, { chosen: 2, revealed: all(0) });
    page.advance();
    await settle();
    const input = stage(1).querySelector('input')!;
    input.value = '120k';
    stage(1).querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    expect(stored()).toMatchObject({ reached: 1, stages: [{ chosen: 2, revealed: all(0) }, { guess: '120k' }] });
  });

  it('restores every stage after a reload, including a typed estimate and its verdict', async () => {
    const saved: CaseDraft = { attempt: 'a-1', reached: 1, stages: [{ chosen: 1, revealed: 2 }, { guess: '120k' }] };
    const { stage } = await open(JSON.stringify(saved));
    expect(stage(0).querySelector('fieldset')).toBeNull();
    expect(stage(0).querySelector('li.option.wrong')?.textContent).toContain(study.stages[0].decision!.options[1].label.slice(0, 20));
    expect(stage(0).querySelectorAll('.points li')).toHaveLength(2);
    const input = stage(1).querySelector('input')!;
    expect(input.value).toBe('120k');
    expect(input.disabled).toBe(true);
    expect(stage(1).querySelector('.result')?.textContent).toContain('Spot on.');
  });

  it('reads the furthest stage a case saved before answers were saved, and ignores unreadable drafts', async () => {
    expect(readCaseDraft('3')).toMatchObject({ reached: 3, stages: [] });
    expect(readCaseDraft('{"attempt":"bad id!","reached":1,"stages":[]}')).toBeNull();
    expect(readCaseDraft('{oops')).toBeNull();
    expect(readCaseDraft('{"attempt":"a-1","reached":0,"stages":[null,{"chosen":-1,"guess":7,"revealed":2}]}')?.stages).toEqual([
      {},
      { revealed: 2 },
    ]);
    const { el } = await open('3');
    expect(el.querySelectorAll('app-case-stage')).toHaveLength(4);
  });

  it('records one completion event, with a stable id, once the last stage is reached with every stage answered', async () => {
    const { page, record, settle, el } = await open(JSON.stringify(answeredDraft()));
    expect(record).not.toHaveBeenCalled();
    page.advance();
    await settle();
    const event = { id: 'case-url-shortener-attempt-1', type: 'case.completed', caseId: 'url-shortener' };
    const topics = ['sd-estimation', 'sd-caching', 'sd-sharding'];
    expect(record).toHaveBeenCalledExactlyOnceWith({ ...event, topics, bestChoices: 3, decisions: 3, closeEstimates: 2, estimates: 2 });
    expect(el.querySelector('.outcome')?.textContent).toContain('Decisions as recommended: 3 of 3');

    page.answer(0, { chosen: 0, revealed: all(0) });
    await settle();
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining(event));
  });

  it('records a finished run found on load, so a run whose event was never written is recovered', async () => {
    const { record, settle } = await open(JSON.stringify({ ...answeredDraft(), reached: study.stages.length }));
    await settle();
    expect(record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'case-url-shortener-attempt-1', bestChoices: 3 }));
  });

  it('moves focus to the outcome when the case is finished', async () => {
    const { page, settle, el } = await open(JSON.stringify(answeredDraft()));
    page.advance();
    await settle();
    await vi.waitFor(() => expect(document.activeElement).toBe(el.querySelector('.outcome')));
  });

  it('records nothing while a decision is open at the end, until it is answered', async () => {
    const draft = answeredDraft();
    draft.stages[3] = { revealed: all(3) };
    const { page, record, settle, el } = await open(JSON.stringify(draft));
    page.advance();
    await settle();
    expect(record).not.toHaveBeenCalled();
    const outcome = el.querySelector<HTMLElement>('.outcome')!;
    await vi.waitFor(() => expect(document.activeElement).toBe(outcome));
    expect(outcome.textContent).toContain('still open above');
    const go = outcome.querySelector('button')!;
    expect(go.textContent).toContain('Go to stage 4: ' + study.stages[3].title);
    go.click();
    expect(document.activeElement).toBe(el.querySelectorAll('li.stage h2')[3]);

    page.answer(3, { chosen: 1, revealed: all(3) });
    await settle();
    expect(record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ bestChoices: 2, decisions: 3 }));
  });

  it('treats a saved option the decision no longer has as unanswered, so the case can still be finished', async () => {
    const draft = answeredDraft();
    draft.stages[0] = { chosen: study.stages[0].decision!.options.length, revealed: all(0) };
    const { page, stage, settle, record } = await open(JSON.stringify(draft));
    expect(stage(0).querySelector('fieldset')).not.toBeNull();
    page.advance();
    await settle();
    expect(record).not.toHaveBeenCalled();

    stage(0).querySelectorAll<HTMLButtonElement>('fieldset button')[0].click();
    await settle();
    expect(stored()?.stages[0]).toEqual({ chosen: 0, revealed: all(0) });
    expect(record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ bestChoices: 3, decisions: 3 }));
  });

  it('keeps drafts loaded before its first change detection', async () => {
    localStorage.setItem(KEY, JSON.stringify({ attempt: 'a-1', reached: 1, stages: [] }));
    TestBed.configureTestingModule({ providers: [{ provide: ProgressService, useValue: { cleared: signal(0) } }] });
    const drafts = TestBed.inject(CaseDraftsService);
    await drafts.load();
    TestBed.tick();
    expect(drafts.draft('url-shortener')?.reached).toBe(1);
  });

  it('drops the drafts it holds when local data is cleared, so the previous learner is not written back', async () => {
    const { page, cleared, settle } = await open(JSON.stringify({ attempt: 'a-1', reached: 1, stages: [{ chosen: 1 }] }));
    const drafts = TestBed.inject(CaseDraftsService);
    await drafts.load();
    expect(drafts.draft('url-shortener')).toBeDefined();
    localStorage.clear();
    cleared.set(1);
    await settle();
    expect(drafts.draft('url-shortener')).toBeUndefined();
    expect(page.draft()).toMatchObject({ reached: 0, stages: [] });
    expect(page.draft().attempt).not.toBe('a-1');
  });

  it('starting over clears only this case and starts a new attempt', async () => {
    localStorage.setItem('CapacitorStorage.grasp.case.news-feed', JSON.stringify({ attempt: 'other', reached: 2, stages: [] }));
    const { page, settle } = await open(JSON.stringify({ ...answeredDraft(), reached: study.stages.length }));
    page.restart();
    await settle();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem('CapacitorStorage.grasp.case.news-feed')).not.toBeNull();
    expect(page.draft()).toMatchObject({ reached: 0, stages: [] });
    expect(page.draft().attempt).not.toBe('attempt-1');
  });
});
