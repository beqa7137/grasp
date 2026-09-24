import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PATTERNS, emptyProgress, getReviewItem } from '@grasp/engine';
import { type NewEvent, ProgressService } from '../../core/progress.service';
import { DiagnosticPage } from './diagnostic.page';

function setup() {
  const recorded: NewEvent[] = [];
  TestBed.configureTestingModule({
    imports: [DiagnosticPage],
    providers: [
      provideRouter([]),
      { provide: ProgressService, useValue: { state: signal(emptyProgress()), record: async (e: NewEvent) => recorded.push(e) } },
    ],
  });
  const fixture = TestBed.createComponent(DiagnosticPage);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, recorded };
}

const press = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key }));

describe('DiagnosticPage', () => {
  it('asks one question per pattern, in curriculum order', () => {
    const { page, fixture, el } = setup();
    expect(el.textContent).toContain('Find your starting point');
    page.start();
    fixture.detectChanges();
    expect(page.slots().map((s) => getReviewItem(s.itemId)!.topic)).toEqual(PATTERNS.map((p) => p.id));
    expect(el.querySelector('g-question-card .reason')!.textContent).toContain('Placement check');
    expect(el.querySelector('.count')!.textContent).toContain(`1/${PATTERNS.length}`);
  });

  it('moves on after each answer without revealing it', () => {
    const { page, fixture, el } = setup();
    page.start();
    fixture.detectChanges();
    (el.querySelector('g-question-card .choice') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(page.answers()).toHaveLength(1);
    expect(el.querySelector('.reveal')).toBeNull();
    expect(el.querySelector('.count')!.textContent).toContain(`2/${PATTERNS.length}`);
    expect(el.querySelector('[role=progressbar]')!.getAttribute('aria-valuetext')).toBe(`1 of ${PATTERNS.length} answered`);
  });

  it('records every outcome once the last question is answered, then shows the placement', async () => {
    const { page, fixture, el, recorded } = setup();
    page.start();
    const [first, second] = page.slots().map((s) => s.question);
    page.choose(first.answer);
    page.choose((second.answer + 1) % second.choices.length);
    while (page.current()) page.skip();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(recorded).toHaveLength(1);
    const event = recorded[0];
    if (event.type !== 'diagnostic.completed') throw new Error(`recorded ${event.type}`);
    expect(event.answers.map((a) => a.outcome)).toEqual(['correct', 'wrong', ...Array(PATTERNS.length - 2).fill('skipped')]);
    expect(event.answers.every((a) => a.durationMs >= 0)).toBe(true);
    expect(page.placed().strong.map((p) => p.id)).toEqual([PATTERNS[0].id]);
    expect(el.textContent).toContain('Start with these');
    expect(el.textContent).toContain(`Learn ${PATTERNS[1].name} first`);
  });

  it('calls it a fresh start when no pattern was spotted', async () => {
    const { page, fixture, el } = setup();
    page.start();
    while (page.current()) page.skip();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('A fresh start');
    expect(el.textContent).not.toContain('Start with these');
  });

  it('answers with number keys and skips with S, only while the page is in view', () => {
    const { page, el } = setup();
    press('1');
    expect(page.answers()).toHaveLength(0);
    page.start();
    press('1');
    press('s');
    press('9');
    expect(page.answers().map((a) => a.outcome)).toEqual([expect.stringMatching(/correct|wrong/), 'skipped']);

    el.classList.add('ion-page-hidden');
    press('1');
    expect(page.answers()).toHaveLength(2);
  });

  it('leaves keys typed into a field alone', () => {
    const { page } = setup();
    page.start();
    const note = document.body.appendChild(document.createElement('textarea'));
    for (const key of ['s', '1']) note.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    note.remove();
    expect(page.answers()).toHaveLength(0);
  });

  it('keeps a check in progress when the learner steps away, but opens on the intro after the results', () => {
    const { page, fixture, el } = setup();
    page.start();
    page.skip();
    page.ionViewDidLeave();
    expect(page.answers()).toHaveLength(1);

    while (page.current()) page.skip();
    page.ionViewDidLeave();
    fixture.detectChanges();
    expect(page.phase()).toBe('intro');
    expect(el.textContent).toContain('Find your starting point');
  });
});
