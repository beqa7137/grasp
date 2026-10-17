import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { buildStudyPlan, emptyProgress, type PlanDay, type PlanSlice } from '@grasp/engine';
import { PlanDaysComponent, dayKind } from './plan-days.component';
import { PlanFormComponent } from './plan-form.component';

const slice = (done: boolean) => ({ done, minutes: 20 }) as PlanSlice;
const day = (slices: PlanSlice[], taper = false): PlanDay => ({ date: '2026-10-20', review: 10, slices, taper });

describe('the plan page', () => {
  it('marks each day by what it holds', () => {
    expect([
      dayKind(day([slice(true), slice(true)])),
      dayKind(day([slice(true), slice(false)])),
      dayKind(day([slice(false)])),
      dayKind(day([])),
      dayKind(day([], true)),
    ]).toEqual(['done', 'partial', 'planned', 'review', 'taper']);
  });

  it('strips every day from today to the interview, today chosen, and shows a chosen day’s list', () => {
    TestBed.configureTestingModule({ imports: [PlanDaysComponent], providers: [provideRouter([])] });
    const now = new Date('2026-10-14T09:00:00Z');
    const plan = buildStudyPlan(
      { interviewDate: '2026-10-24', minutesPerDay: 45, rounds: ['coding', 'design', 'behavioral'], level: 'new' },
      emptyProgress(),
      { now, tzOffsetMinutes: 0 },
    );
    const fixture = TestBed.createComponent(PlanDaysComponent);
    fixture.componentRef.setInput('plan', plan);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const radios = [...el.querySelectorAll('[role="radio"]')];
    expect(radios).toHaveLength(11);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios.at(-1)!.getAttribute('aria-label')).toMatch(/: Interview$/);
    expect(radios.at(-2)!.getAttribute('aria-label')).toMatch(/: Light day/);
    (radios[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('#day-title')!.textContent).toMatch(/^\s*\w{3}, \w{3} \d{1,2}/);

    // The page builds a new plan each minute and on every record; the chosen day holds while today does not move on.
    fixture.componentRef.setInput('plan', { ...plan, days: [...plan.days] });
    fixture.detectChanges();
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    fixture.componentRef.setInput('plan', { ...plan, today: plan.days[1].date, days: plan.days.slice(1) });
    fixture.detectChanges();
    expect(el.querySelector('[role="radio"]')!.getAttribute('aria-checked')).toBe('true');
  });

  it('takes the rounds from the loop instead of asking for them', () => {
    TestBed.configureTestingModule({ imports: [PlanFormComponent] });
    const fixture = TestBed.createComponent(PlanFormComponent);
    fixture.componentRef.setInput('today', '2026-10-14');
    fixture.componentRef.setInput('loop', { level: 'senior', rounds: { coding: 2, design: 0, behavioral: 1 } });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(el.textContent).toContain('Rounds come from your loop (Coding ×2, Behavioral).');
    const saved: unknown[] = [];
    fixture.componentInstance.saved.subscribe((p) => saved.push(p));
    fixture.componentInstance.date.set('2026-11-01');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(saved).toEqual([{ interviewDate: '2026-11-01', minutesPerDay: 30, rounds: ['coding', 'behavioral'], level: 'new' }]);
  });
});
