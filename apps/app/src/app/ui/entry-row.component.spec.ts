import { TestBed } from '@angular/core/testing';
import { EntryRowComponent } from './entry-row.component';
import { designIcon, doneStateIcon } from './icons';

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(EntryRowComponent);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('EntryRowComponent', () => {
  it('names its status for screen readers and hides the kind glyph', () => {
    const el = render({ heading: 'Two Sum', status: { icon: doneStateIcon, label: 'Solved', tone: 'success' }, kind: designIcon });
    const status = el.querySelector('ion-icon.status')!;
    expect(status.getAttribute('role')).toBe('img');
    expect(status.getAttribute('aria-label')).toBe('Solved');
    expect(status.classList).toContain('success');
    expect(el.querySelector('ion-icon.kind')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.title')?.textContent).toBe('Two Sum');
  });

  it('reads its level pips as text and keeps the meta in order', () => {
    const el = render({ heading: 'Two Sum', meta: ['Problem', 'Arrays'], level: 2 });
    expect(Array.from(el.querySelectorAll('.meta > span:not(.pips)')).map((s) => s.textContent)).toEqual(['Problem', 'Arrays']);
    const pips = el.querySelector('.pips')!;
    expect(pips.getAttribute('aria-label')).toBe('Level 2 of 3');
    expect(pips.querySelectorAll('i.on')).toHaveLength(2);
    expect(pips.querySelectorAll('i')).toHaveLength(3);
  });

  it('leaves out the meta line, glyphs and arrow it was not given', () => {
    const el = render({ heading: 'URL Shortener' });
    expect(el.querySelector('.meta, ion-icon')).toBeNull();
  });
});
