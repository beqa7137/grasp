import { type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { getCaseStudy, hotAccountCheckpoint } from '@grasp/engine';
import { CaseStageComponent } from '../case-stage.component';
import { HotAccountWidgetComponent } from './hot-account-widget.component';
import { ReconcileWidgetComponent } from './reconcile-widget.component';
import { RetryWidgetComponent } from './retry-widget.component';

function mount<T>(component: Type<T>) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (selector: string, text: string) => {
    const button = [...el.querySelectorAll<HTMLButtonElement>(selector)].find((b) => b.textContent!.trim() === text);
    if (!button) throw new Error(`No ${selector} reading ${text}`);
    button.click();
    fixture.detectChanges();
  };
  return { fixture, el, click, widget: fixture.componentInstance };
}

const marks = (el: HTMLElement) => [...el.querySelectorAll('.g-answer-mark')].map((m) => m.getAttribute('aria-label'));

describe('retry widget', () => {
  it('asks how often the card is charged, shows the attempts once answered, and asks again when the key scheme changes', () => {
    const { el, click, widget, fixture } = mount(RetryWidgetComponent);
    expect(el.querySelector('.steps')).toBeNull();
    click('fieldset button', 'Charged twice');
    expect(marks(el)).toEqual(['your answer, correct']);
    expect(el.querySelectorAll('.steps li')).toHaveLength(2);
    expect(el.textContent).toContain('Not sent: the client already has its answer.');

    widget.setFate(3, 'lost');
    fixture.detectChanges();
    expect(widget.chosen()).toBe(2);

    click('[role="radio"]', 'One key per payment');
    expect(widget.chosen()).toBeNull();
    click('fieldset button', 'Charged twice');
    expect(marks(el)).toEqual(['correct answer', 'your answer, wrong']);
    expect(el.textContent).toContain('returns the stored result');
  });
});

describe('hot account widget', () => {
  it('reads out the one-row limit, and applying the predicted change moves the readouts to the answer', () => {
    const { el, fixture, widget } = mount(HotAccountWidgetComponent);
    const readout = (name: string) =>
      [...el.querySelectorAll('.readouts div')]
        .find((d) => d.querySelector('dt')!.textContent === name)!
        .querySelector('dd')!
        .textContent!.trim();
    expect(readout('Capacity')).toBe('200/s');
    expect(readout('Commit wait')).toBe('keeps growing');

    const check = hotAccountCheckpoint(widget.settings());
    el.querySelectorAll<HTMLButtonElement>('fieldset button')[check.answer].click();
    fixture.detectChanges();
    expect(marks(el)).toEqual(['your answer, correct']);
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Apply the change'))!.click();
    fixture.detectChanges();
    expect(widget.settings()).toEqual(check.change);
    expect(readout('Committed')).toBe(check.choices[check.answer].replace(' postings/s', '/s'));
    expect(el.querySelector('fieldset')).not.toBeNull();
  });
});

describe('reconcile widget', () => {
  it('scores the day once every order is answered, and starts a fresh day on request', () => {
    const { el, fixture, widget } = mount(ReconcileWidgetComponent);
    const checks = widget.checks();
    expect(checks).toHaveLength(5);
    for (const [i, check] of checks.entries()) {
      expect(el.querySelector('[role="status"]')).toBeNull();
      const options = el.querySelectorAll('app-widget-check')[i].querySelectorAll<HTMLButtonElement>('fieldset button');
      options[i === 0 ? (check.answer + 1) % 5 : check.answer].click();
      fixture.detectChanges();
    }
    expect(el.querySelector('[role="status"]')!.textContent).toContain('4 of 5 right.');
    const day = widget.day();
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Another day')!.click();
    fixture.detectChanges();
    expect(widget.day()).not.toEqual(day);
    expect(el.querySelector('[role="status"]')).toBeNull();
    expect(el.querySelectorAll('fieldset')).toHaveLength(5);
  });
});

describe('a case stage with a widget', () => {
  it('opens the model only after the decision is answered', async () => {
    const stage = getCaseStudy('payment-ledger')!.stages.find((s) => s.widget === 'retries')!;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CaseStageComponent);
    fixture.componentRef.setInput('stage', stage);
    fixture.componentRef.setInput('caseId', 'payment-ledger');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-retry-widget')).toBeNull();
    el.querySelector<HTMLButtonElement>('fieldset button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('section.widget h3')!.textContent).toBe('Try it: retries with and without idempotency keys');
    expect(el.querySelector('app-retry-widget')).not.toBeNull();
  });
});
