import { TestBed } from '@angular/core/testing';
import { CodePanelComponent } from './code-panel.component';

describe('CodePanelComponent', () => {
  it('escapes markup in code and highlights the active line', () => {
    const fixture = TestBed.createComponent(CodePanelComponent);
    fixture.componentRef.setInput('code', ['const x = "<img src=x onerror=alert(1)>";', 'return x; // done']);
    fixture.componentRef.setInput('active', 2);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('img')).toBeNull();
    const lines = el.querySelectorAll('li');
    expect(lines[1].classList.contains('on')).toBe(true);
    expect(lines[1].querySelector('.cm')!.textContent).toBe('// done');
    expect(lines[0].querySelector('.kw')!.textContent).toBe('const');
  });

  it('takes keyboard focus as a named region, so its long lines can be scrolled without a pointer', () => {
    const fixture = TestBed.createComponent(CodePanelComponent);
    fixture.componentRef.setInput('code', ['return x;']);
    fixture.componentRef.setInput('label', 'Template');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.tabIndex).toBe(0);
    expect(host.getAttribute('role')).toBe('region');
    expect(host.getAttribute('aria-label')).toBe('Template');
  });
});
