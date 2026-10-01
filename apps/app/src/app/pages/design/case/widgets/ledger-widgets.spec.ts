import { type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { getCaseStudy, hotAccountCheckpoint, reconTotals, reconciliationDay } from '@grasp/engine';
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
  it('asks how many entries the ledger posts, shows the attempts once answered, and asks again when the key scheme changes', () => {
    const { el, click, widget, fixture } = mount(RetryWidgetComponent);
    expect(el.querySelector('.steps')).toBeNull();
    click('fieldset button', 'Posted twice');
    expect(marks(el)).toEqual(['your answer, correct']);
    expect(el.querySelectorAll('.steps li')).toHaveLength(2);
    expect(el.textContent).toContain('Not sent: the caller already has its answer.');

    widget.setFate(3, 'lost');
    fixture.detectChanges();
    expect(widget.chosen()).toBe(2);

    click('[role="radio"]', 'One key per payment');
    expect(widget.chosen()).toBeNull();
    click('fieldset button', 'Posted twice');
    expect(marks(el)).toEqual(['correct answer', 'your answer, wrong']);
    expect(el.textContent).toContain('returns the stored entry');
  });
});

describe('hot account widget', () => {
  it('hides the readouts a prediction would give away until it is answered, and keeps the applied answer in view', () => {
    const { el, fixture, widget } = mount(HotAccountWidgetComponent);
    const readout = (name: string) =>
      [...el.querySelectorAll('.readouts div')]
        .find((d) => d.querySelector('dt')!.textContent === name)
        ?.querySelector('dd')!
        .textContent!.trim();
    expect(readout('Capacity')).toBe('200/s');
    expect(readout('Committed')).toBeUndefined();
    expect(readout('Wait per posting')).toBeUndefined();

    const check = hotAccountCheckpoint(widget.settings());
    el.querySelectorAll<HTMLButtonElement>('fieldset button')[check.answer].click();
    fixture.detectChanges();
    expect(marks(el)).toEqual(['your answer, correct']);
    expect(readout('Committed')).toBe('200/s');
    expect(readout('Wait per posting')).toBe('grows without bound');
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Apply the change'))!.click();
    fixture.detectChanges();
    expect(widget.settings()).toEqual(check.change);
    expect(el.querySelector('.last')!.textContent).toContain(check.explain);
    expect(readout('Committed')).toBeUndefined();
    el.querySelector<HTMLButtonElement>('fieldset button')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.last')).toBeNull();
    expect(readout('Committed')).toBe(
      `${Math.round(Math.min(2_300, (check.change.subAccounts * check.change.batch * 1000) / check.change.lockMs)).toLocaleString('en-US')}/s`,
    );
  });

  it('shows the queueing wait with a thousands separator, labels the sliders with units, and announces once input settles', async () => {
    vi.useFakeTimers();
    try {
      const { el, fixture, widget } = mount(HotAccountWidgetComponent);
      expect([...el.querySelectorAll('input[type="range"]')].map((i) => i.getAttribute('aria-valuetext'))).toEqual([
        '2,300 postings a second',
        '5 ms',
        '1 sub-account',
        '1 posting a transaction',
      ]);
      expect(el.querySelector('.readouts')!.hasAttribute('aria-live')).toBe(false);
      const status = el.querySelector('[role="status"]')!;
      expect(status.textContent!.trim()).toBe('');
      widget.set('subAccounts', 16);
      fixture.detectChanges();
      widget.settings.set({ offered: 1_996, lockMs: 5, subAccounts: 10, batch: 1 });
      widget.answer(0);
      fixture.detectChanges();
      expect(widget.latency()).toBe('1,252 ms');
      expect(status.textContent!.trim()).toBe('');
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent).toContain('Capacity 2,000 postings a second, 1,996 committed, 100% busy, wait per posting 1,252 ms.');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('reconcile widget', () => {
  it('scores the day once every order is answered, and starts a fresh day on request', () => {
    const { el, fixture, widget } = mount(ReconcileWidgetComponent);
    const checks = widget.checks();
    expect(checks).toHaveLength(5);
    const status = el.querySelector('[role="status"]')!;
    for (const [i, check] of checks.entries()) {
      expect(status.textContent!.trim()).toBe('');
      const options = el.querySelectorAll('app-widget-check')[i].querySelectorAll<HTMLButtonElement>('fieldset button');
      options[i === 0 ? (check.answer + 1) % 5 : check.answer].click();
      fixture.detectChanges();
    }
    expect(status.textContent).toContain('4 of 5 right.');
    const day = widget.day();
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Another day')!.click();
    fixture.detectChanges();
    expect(widget.day()).not.toEqual(day);
    expect(el.querySelector('[role="status"]')).toBe(status);
    expect(status.textContent!.trim()).toBe('');
    expect(el.querySelectorAll('fieldset')).toHaveLength(5);
  });

  it('says which way the report and the ledger differ, by the sign of the gap', () => {
    const { widget } = mount(ReconcileWidgetComponent);
    const gapOf = (seed: number) => {
      const t = reconTotals(reconciliationDay(seed));
      return t.reportGross - t.ledgerCaptured;
    };
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    widget.seed.set(seeds.find((s) => gapOf(s) < 0)!);
    expect(widget.gap()).toMatch(/^the report shows \$[\d,.]+ less than the ledger/);
    widget.seed.set(seeds.find((s) => gapOf(s) > 0)!);
    expect(widget.gap()).toMatch(/^the report shows \$[\d,.]+ more than the ledger/);
    expect(widget.gap()).not.toContain('-');
  });
});

describe('a case stage with a widget', () => {
  it('keeps the model closed while the estimate is not a number', () => {
    const stage = getCaseStudy('payment-ledger')!.stages.find((s) => s.widget === 'hot-account')!;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CaseStageComponent);
    fixture.componentRef.setInput('stage', stage);
    fixture.componentRef.setInput('caseId', 'payment-ledger');
    fixture.componentRef.setInput('orderSeed', 'payment-ledger:attempt-1:0');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.check('lots');
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('app-hot-account-widget')).toBeNull();
    fixture.componentInstance.check('17');
    fixture.detectChanges();
    expect(el.querySelector('app-hot-account-widget')).not.toBeNull();
  });

  it('opens the model only after the decision is answered', async () => {
    const stage = getCaseStudy('payment-ledger')!.stages.find((s) => s.widget === 'retries')!;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CaseStageComponent);
    fixture.componentRef.setInput('stage', stage);
    fixture.componentRef.setInput('caseId', 'payment-ledger');
    fixture.componentRef.setInput('orderSeed', 'payment-ledger:attempt-1:0');
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
