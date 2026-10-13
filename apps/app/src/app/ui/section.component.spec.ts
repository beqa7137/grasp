import { TestBed } from '@angular/core/testing';
import { alertIcon } from './icons';
import { SectionComponent } from './section.component';

describe('SectionComponent', () => {
  it('is a panel headed by an h2, its icon hidden from screen readers and toned by meaning', () => {
    const fixture = TestBed.createComponent(SectionComponent);
    fixture.componentRef.setInput('heading', 'Pitfalls');
    fixture.componentRef.setInput('icon', alertIcon);
    fixture.componentRef.setInput('tone', 'danger');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.classList).toContain('panel');
    expect(el.querySelector('h2')?.textContent?.trim()).toBe('Pitfalls');
    const icon = el.querySelector('h2 ion-icon')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.classList).toContain('danger');
  });

  it('draws no icon when given none', () => {
    const fixture = TestBed.createComponent(SectionComponent);
    fixture.componentRef.setInput('heading', 'Your data');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('ion-icon')).toBeNull();
  });
});
