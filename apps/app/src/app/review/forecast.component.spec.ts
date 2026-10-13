import { TestBed } from '@angular/core/testing';
import { ForecastComponent } from './forecast.component';

const week = (counts: number[]) => counts.map((count, i) => ({ day: `2026-10-${String(13 + i).padStart(2, '0')}`, count }));

function bars(counts: number[]) {
  const fixture = TestBed.createComponent(ForecastComponent);
  fixture.componentRef.setInput('days', week(counts));
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector('.bars')!;
}

describe('ForecastComponent', () => {
  it('collapses to its row of flat bars when nothing is due all week', () => {
    expect(bars([0, 0, 0, 0, 0, 0, 0]).classList).toContain('empty');
    expect(bars([0, 0, 2, 0, 0, 0, 0]).classList).not.toContain('empty');
  });
});
