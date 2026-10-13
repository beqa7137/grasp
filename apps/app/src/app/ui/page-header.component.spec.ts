import { TestBed } from '@angular/core/testing';
import { PageHeaderComponent } from './page-header.component';

function render(inputs: Record<string, string>) {
  const fixture = TestBed.createComponent(PageHeaderComponent);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PageHeaderComponent', () => {
  it("puts the page's one h1 in Ionic's condense header, as the large title", () => {
    const el = render({ heading: 'Settings' });
    const header = el.querySelector('ion-header');
    expect(header?.getAttribute('collapse')).toBe('condense');
    const title = header?.querySelector('ion-toolbar ion-title');
    expect(title?.getAttribute('size')).toBe('large');
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(title?.querySelector('h1')?.textContent).toBe('Settings');
  });

  it('shows the eyebrow and lede only when given', () => {
    expect(render({ heading: 'Settings' }).querySelector('.eyebrow, .lede')).toBeNull();
    const el = render({ heading: 'Problems', eyebrow: 'Coding', lede: 'Write it. Run it.' });
    expect(el.querySelector('.eyebrow')?.textContent).toBe('Coding');
    expect(el.querySelector('.lede')?.textContent).toBe('Write it. Run it.');
  });
});
