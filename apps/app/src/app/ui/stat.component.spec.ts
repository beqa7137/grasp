import { TestBed } from '@angular/core/testing';
import { StatComponent } from './stat.component';

describe('StatComponent', () => {
  it('reads label, then value, then the hint when there is one', () => {
    const fixture = TestBed.createComponent(StatComponent);
    fixture.componentRef.setInput('label', 'Retention (30d)');
    fixture.componentRef.setInput('value', '92%');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(Array.from(el.children).map((c) => c.textContent)).toEqual(['Retention (30d)', '92%']);
    fixture.componentRef.setInput('hint', 'target 90%');
    fixture.detectChanges();
    expect(Array.from(el.children).map((c) => c.textContent)).toEqual(['Retention (30d)', '92%', 'target 90%']);
  });
});
