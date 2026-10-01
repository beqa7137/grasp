import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { getCaseStudy, optionOrder } from '@grasp/engine';
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
const labels = (i: number) => study.stages[i].decision!.options.map((o) => o.label.replace(/`/g, ''));
const shown = (stage: HTMLElement, selector: string) =>
  [...stage.querySelectorAll<HTMLElement>(selector)].map((o) => o.querySelector('.label')?.textContent?.trim() ?? o.textContent!.trim());
/** The button for the option authored at `index`, wherever the shuffle shows it. */
const optionButton = (stage: HTMLElement, i: number, index: number) =>
  [...stage.querySelectorAll<HTMLButtonElement>('fieldset button')].find((b) => b.textContent!.trim() === labels(i)[index])!;
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
  await vi.waitFor(() => expect(fixture.componentInstance.loaded()).toBe(true));
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
    optionButton(stage(0), 0, 2).click();
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

  it('shows each decision in an order shuffled per run and stage, the same after a reload', async () => {
    const draft = answeredDraft();
    const decided = study.stages.flatMap((s, i) => (s.decision ? [i] : []));
    const order = (attempt: string, i: number) => optionOrder(`url-shortener:${attempt}:${i}`, labels(i).length).map((k) => labels(i)[k]);
    const { stage } = await open(JSON.stringify({ ...draft, stages: [] }));
    for (const i of decided) expect(shown(stage(i), 'fieldset button')).toEqual(order('attempt-1', i));
    expect(new Set(decided.map((i) => order('attempt-1', i).indexOf(labels(i)[0]))).size).toBeGreaterThan(1);
    expect(decided.some((i) => order('attempt-1', i).join() !== order('attempt-2', i).join())).toBe(true);

    TestBed.resetTestingModule();
    const reloaded = await open(JSON.stringify(draft));
    for (const i of decided) expect(shown(reloaded.stage(i), 'li.option')).toEqual(order('attempt-1', i));
  });

  it('restores the option a draft saved before options were shuffled, which named it by its authored index', async () => {
    const { stage } = await open('{"attempt":"a-1","reached":0,"stages":[{"chosen":1}]}');
    expect(stage(0).querySelector('li.option.wrong .label')?.textContent?.trim()).toBe(labels(0)[1]);
    expect(stage(0).querySelector('li.option.right .label')?.textContent?.trim()).toBe(labels(0)[0]);
    expect(stage(0).querySelector('li.option.wrong ion-icon')?.getAttribute('aria-label')).toBe('your answer, wrong');
    expect(stored()?.stages[0]).toEqual({ chosen: 1 });
  });

  it('renders no stage until the saved draft has loaded, so neither the order nor a tap can disturb it', async () => {
    const saved: CaseDraft = { attempt: 'a-1', reached: 1, stages: [{ revealed: 2 }] };
    localStorage.setItem(KEY, JSON.stringify(saved));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const read = vi.mocked(Preferences.get).getMockImplementation()!;
    vi.mocked(Preferences.get).mockImplementationOnce(async (options) => {
      await gate;
      return read(options);
    });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ProgressService, useValue: { record: vi.fn(), cleared: signal(0) } }],
    });
    const fixture = TestBed.createComponent(CaseStudyPage);
    fixture.componentRef.setInput('id', 'url-shortener');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('URL Shortener');
    expect(el.querySelectorAll('app-case-stage')).toHaveLength(0);
    expect(el.querySelectorAll('fieldset button')).toHaveLength(0);

    release();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelectorAll('app-case-stage')).toHaveLength(2);
    });
    expect(shown(el.querySelector('app-case-stage')!, 'fieldset button')).toEqual(
      optionOrder('url-shortener:a-1:0', labels(0).length).map((k) => labels(0)[k]),
    );
    expect(stored()).toEqual(saved);
  });

  it('gives a furthest stage saved before answers were saved one attempt, kept across reloads', async () => {
    const first = await open('3');
    const attempt = first.page.draft().attempt;
    expect(stored()).toEqual({ attempt, reached: 3, stages: [] });
    const order = shown(first.stage(0), 'fieldset button');

    TestBed.resetTestingModule();
    const again = await open();
    expect(again.page.draft().attempt).toBe(attempt);
    expect(shown(again.stage(0), 'fieldset button')).toEqual(order);
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

    optionButton(stage(0), 0, 0).click();
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
