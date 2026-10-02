import { ApplicationRef, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  LIFETIME_STOPS,
  MAIL_PARTS,
  OUTAGE_STOPS,
  getCaseStudy,
  mailStorage,
  mailStorageCheckpoint,
  smtpRetryCheckpoint,
  storageText,
} from '@grasp/engine';
import { CaseStageComponent } from '../case-stage.component';
import { MailStorageWidgetComponent } from './mail-storage-widget.component';
import { SmtpRetryWidgetComponent } from './smtp-retry-widget.component';

function mount<T>(component: Type<T>) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (text: string) => {
    const button = [...el.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent!.trim() === text);
    if (!button) throw new Error(`No radio reading ${text}`);
    button.click();
    fixture.detectChanges();
  };
  const readout = (name: string) =>
    [...el.querySelectorAll('.readouts div')]
      .find((d) => d.querySelector('dt')!.textContent!.trim() === name)
      ?.querySelector('dd')!
      .textContent!.trim();
  const answer = (index: number) => {
    el.querySelectorAll<HTMLButtonElement>('app-widget-check fieldset button')[index].click();
    fixture.detectChanges();
  };
  const slider = (i: number) => el.querySelectorAll<HTMLInputElement>('input[type="range"]')[i];
  const slide = (i: number, value: number) => {
    const input = slider(i);
    input.value = String(value);
    input.dispatchEvent(new Event('input'));
    TestBed.inject(ApplicationRef).tick();
  };
  return { fixture, el, click, readout, answer, slider, slide, widget: fixture.componentInstance };
}

const marks = (el: HTMLElement) => [...el.querySelectorAll('.g-answer-mark')].map((m) => m.getAttribute('aria-label'));
const legend = (el: HTMLElement) => [...el.querySelectorAll('.legend-list li')].map((li) => li.textContent!.trim().replace(/\s+/g, ' '));

describe('SMTP retry widget', () => {
  it('hides the attempts and the outcome until the prediction is answered, then shows what the model gives', () => {
    const { el, readout, answer, widget } = mount(SmtpRetryWidgetComponent);
    expect(el.querySelector('.readouts')).toBeNull();
    expect(el.querySelector('path.tick')).toBeNull();
    expect(el.querySelector('svg.timeline')!.getAttribute('aria-label')).toBe(
      'Timeline of a 6 h outage, with a 5 d queue lifetime; the attempts show once you answer',
    );
    expect(legend(el)).toEqual(['Server broken (hatched)', 'Queue lifetime (dashed), past the right edge']);
    const check = smtpRetryCheckpoint(widget.settings());
    answer(check.answer);
    expect(marks(el)).toEqual(['your answer, correct']);
    expect(readout('Outcome')).toBe('Delivered at 6 h 15 min');
    expect(readout('Attempts')).toBe('10');
    expect(readout('Waited after recovery')).toBe('15 min');
    expect(readout('Queued at recovery')).toBe('7,200');
    expect(readout('Queue empty after')).toBe('1 h');
    expect(el.querySelector('path.tick')!.getAttribute('d')!.match(/M/g)).toHaveLength(9);
    expect(el.querySelector('circle.delivered')).not.toBeNull();
    expect(legend(el)).toEqual([
      'Server broken (hatched)',
      'Queue lifetime (dashed), past the right edge',
      'Failed attempt (tick)',
      'Delivered (circle)',
    ]);
  });

  it('keeps the answer while the sliders move, and asks again for a different reply', () => {
    const { el, click, readout, answer, slide, widget } = mount(SmtpRetryWidgetComponent);
    const asked = widget.check();
    answer(asked.answer);
    slide(0, OUTAGE_STOPS.indexOf(8_640));
    expect(widget.chosen()).toBe(asked.answer);
    expect(widget.shownCheck()).toBe(asked);
    expect(readout('Outcome')).toBe('Bounced at 5 d 15 min');
    expect(readout('Bounced')).toBe('28,500');
    expect(el.querySelector('rect.bounced')).not.toBeNull();
    click('550: no such user (5xx)');
    expect(widget.chosen()).toBeNull();
    expect(el.querySelector('.readouts')).toBeNull();
    expect(widget.check().prompt).toContain('What happens to a message sent as the outage begins?');
    answer(widget.check().answer);
    expect(readout('Outcome')).toBe('Bounced at once');
    expect(readout('Attempts')).toBe('1');
    expect(readout('Queue empty after')).toBe('none queued');
  });

  it('speaks durations on its sliders, keeps the drawing out of live regions, and announces once input settles', async () => {
    vi.useFakeTimers();
    try {
      const { el, fixture, slide, slider } = mount(SmtpRetryWidgetComponent);
      expect([0, 1, 2, 3].map((i) => slider(i).getAttribute('aria-valuetext'))).toEqual(['6 hours', '5 minutes', '1 hour', '5 days']);
      expect(el.querySelector('[aria-live]')).toBeNull();
      const status = el.querySelector('[role="status"]')!;
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe('');
      slide(0, 5);
      slide(0, 4);
      fixture.detectChanges();
      expect(slider(0).getAttribute('aria-valuetext')).toBe('2 hours');
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe(
        '451 for 2 hours; retries from 5 minutes up to 1 hour; lifetime 5 days. Answer the prediction to see the attempts.',
      );
      expect(el.querySelector('[role="status"]')).toBe(status);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('SMTP retry timeline', () => {
  it('hatches even the shortest outage', () => {
    const { el, slide } = mount(SmtpRetryWidgetComponent);
    slide(0, 0);
    slide(2, 4);
    const band = el.querySelector('rect.band')!;
    expect(Number(band.getAttribute('width'))).toBeGreaterThanOrEqual(4);
    expect(el.querySelector('path.hatch')!.getAttribute('d')!.match(/M/g)!.length).toBeGreaterThanOrEqual(1);
  });

  it('draws the first and last attempts with a gap marker when ticks would merge', () => {
    const { el, answer, slide, widget } = mount(SmtpRetryWidgetComponent);
    slide(0, OUTAGE_STOPS.length - 1);
    slide(1, 0);
    slide(2, 0);
    slide(3, LIFETIME_STOPS.length - 1);
    answer(widget.check().answer);
    expect(widget.run().attempts.length).toBeGreaterThan(300);
    expect(el.querySelector('path.tick')!.getAttribute('d')!.match(/M/g)).toHaveLength(6);
    expect(el.querySelector('path.gap')).not.toBeNull();
    expect(legend(el)).toContain('More attempts (dotted line)');
  });

  it('draws every attempt when they are far enough apart', () => {
    const { el, answer, widget } = mount(SmtpRetryWidgetComponent);
    answer(widget.check().answer);
    expect(el.querySelector('path.gap')).toBeNull();
    expect(legend(el)).not.toContain('More attempts (dotted line)');
  });
});

describe('mail storage split', () => {
  it('leaves out a part with no bytes', () => {
    const { el, answer, slide, widget } = mount(MailStorageWidgetComponent);
    answer(widget.check().answer);
    slide(2, 0);
    expect([...el.querySelectorAll('.split > span')].map((p) => MAIL_PARTS.find((m) => p.classList.contains(m)))).toEqual([
      'metadata',
      'bodies',
    ]);
    expect(legend(el).map((l) => l.split(' (')[0])).toEqual(['Message metadata', 'Message bodies']);
  });
});

describe('mail storage widget', () => {
  it('hides the split, savings and disk until answered, then shows what the model gives', () => {
    const { el, readout, answer, widget } = mount(MailStorageWidgetComponent);
    expect(readout('Messages a year')).toBe('7.3 trillion');
    expect(readout('On disk')).toBeUndefined();
    expect(el.querySelector('.split')).toBeNull();
    const check = mailStorageCheckpoint(widget.settings());
    expect(check.choices[check.answer]).toBe('Attachments');
    answer(check.answer);
    expect(marks(el)).toEqual(['your answer, correct']);
    const run = mailStorage(widget.settings());
    expect(readout('Stored, one copy')).toBe(storageText(run.storedBytes));
    expect(readout('On disk')).toBe('934 PB');
    expect(readout('Saved by dedup')).toBe('110 PB');
    expect(readout('15 GB lasts')).toBe('14 years');
    expect(el.querySelector('.split')!.getAttribute('aria-label')).toBe(
      'Stored a year, one copy: message metadata 2%, message bodies 16%, attachments 82%',
    );
    expect(legend(el)).toEqual([
      'Message metadata (solid) 7.3 PB, 2%',
      'Message bodies (striped) 48.7 PB, 16%',
      'Attachments (dotted) 256 PB, 82%',
    ]);
  });

  it('keeps the answer while the sliders move, and asks again for a different durability scheme', () => {
    const { click, readout, answer, slide, widget } = mount(MailStorageWidgetComponent);
    const asked = widget.check();
    answer(asked.answer);
    slide(2, 0);
    expect(widget.chosen()).toBe(asked.answer);
    expect(widget.shownCheck()).toBe(asked);
    expect(readout('Saved by dedup')).toBe('0 bytes');
    click('Erasure code (1.5x)');
    expect(widget.chosen()).toBeNull();
    expect(readout('On disk')).toBeUndefined();
    answer(widget.check().answer);
    expect(readout('On disk')).toBe(storageText(mailStorage(widget.settings()).diskBytes));
  });

  it('labels its sliders with units and announces one summary once input settles', async () => {
    vi.useFakeTimers();
    try {
      const { el, fixture, slide, slider } = mount(MailStorageWidgetComponent);
      expect([0, 1, 2, 3, 4].map((i) => slider(i).getAttribute('aria-valuetext'))).toEqual([
        '500 million mailboxes',
        '40 messages a day',
        '10 percent of messages',
        '500 kilobytes',
        '30 percent already stored',
      ]);
      expect(el.querySelector('[aria-live]')).toBeNull();
      const status = el.querySelector('[role="status"]')!;
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe('');
      for (const v of [600, 700]) slide(0, v);
      await vi.advanceTimersByTimeAsync(700);
      fixture.detectChanges();
      expect(status.textContent!.trim()).toBe(
        '700 million mailboxes, 40 messages a day, 10% with 500 KB of attachments, 30% already stored, three copies. Answer the prediction to see the storage.',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('an email stage with a widget', () => {
  it('opens the retry model only after the decision is answered', async () => {
    const stage = getCaseStudy('email-service')!.stages.find((s) => s.widget === 'smtp-retry')!;
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CaseStageComponent);
    fixture.componentRef.setInput('stage', stage);
    fixture.componentRef.setInput('caseId', 'email-service');
    fixture.componentRef.setInput('orderSeed', 'email-service:attempt-1:7');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-smtp-retry-widget')).toBeNull();
    el.querySelector<HTMLButtonElement>('fieldset button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('section.widget h3')!.textContent).toBe('Try it: retry a message through an outage');
    expect(el.querySelector('app-smtp-retry-widget')).not.toBeNull();
  });
});
