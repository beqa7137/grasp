import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProgressService } from '../core/progress.service';
import { InterviewReportsComponent } from './interview-reports.component';

function setup(kind: 'problem' | 'case', itemId: string, day = '2026-10-17') {
  const today = signal(day);
  TestBed.configureTestingModule({ providers: [{ provide: ProgressService, useValue: { day: today } }] });
  const fixture = TestBed.createComponent(InterviewReportsComponent);
  fixture.componentRef.setInput('kind', kind);
  fixture.componentRef.setInput('itemId', itemId);
  fixture.detectChanges();
  return { fixture, today, el: fixture.nativeElement as HTMLElement };
}

const lines = (el: HTMLElement) =>
  [...el.querySelectorAll('li')].map((li) => li.querySelector('.line')!.textContent!.replace(/\s+/g, ' ').trim());

describe('InterviewReportsComponent', () => {
  it('lists the reports of a problem by company with the date and its kind, closed by default', () => {
    const { el } = setup('problem', 'lowest-common-ancestor');
    const details = el.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(el.querySelector('summary')!.textContent!.trim()).toBe('Reported in interviews: Google, Meta, Amazon');
    expect(lines(el)).toEqual(['Google Interview Jan 2025', 'Meta Interview Aug 2025', 'Amazon Updated May 2025']);
    expect(el.querySelector('.footer')!.textContent).toContain('not affiliated with these companies or publishers');
    expect(el.textContent).not.toMatch(/\b(frequency|frequently|most asked|popular|top|hot)\b|%/i);
  });

  it('links each source in a new tab without an opener, naming the publisher and the write-up', () => {
    const { el } = setup('case', 'chat');
    const links = [...el.querySelectorAll('a')];
    expect(links).toHaveLength(3);
    for (const a of links) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
      expect(a.href).toMatch(/^https:\/\/roundz\.substack\.com\/p\//);
    }
    expect(links[0].textContent).toBe('Roundz Newsletter ↗');
    expect(links[0].getAttribute('aria-label')).toMatch(
      /^Roundz Newsletter: Interview Experience - 136 - Microsoft .*\(opens in a new tab\)$/,
    );
    expect(lines(el)).toEqual(['Microsoft Published Jul 2025', 'Uber Published Jul 2025', 'Uber Published May 2025']);
  });

  it('shows a year-only interview date as the year', () => {
    const { el } = setup('problem', 'jump-game');
    expect(lines(el)).toEqual(['Apple Interview 2024']);
  });

  it('renders nothing for an untagged item', () => {
    const { el } = setup('problem', 'house-robber');
    expect(el.querySelector('g-disclosure')).toBeNull();
    expect(el.hidden).toBe(true);
    expect(getComputedStyle(el).display).toBe('none');
  });

  it('hides itself once the device day passes the last recheck', () => {
    const { fixture, today, el } = setup('problem', 'two-sum');
    expect(lines(el)).toEqual(['Microsoft Published Jun 2025']);
    expect(el.hidden).toBe(false);
    today.set('2027-01-26');
    fixture.detectChanges();
    expect(el.querySelector('g-disclosure')).toBeNull();
    expect(el.hidden).toBe(true);
  });
});
