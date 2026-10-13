import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TextareaDirective } from './textarea.directive';

@Component({
  imports: [TextareaDirective, FormsModule],
  template: `<textarea gTextarea [ngModel]="text()" (ngModelChange)="text.set($event)"></textarea>`,
})
class HostComponent {
  readonly text = signal('');
}

/** jsdom lays nothing out: the field's scroll height here is 20px a line of its value. */
async function setup() {
  const fixture = TestBed.createComponent(HostComponent);
  const textarea = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
  Object.defineProperty(textarea, 'scrollHeight', { get: () => textarea.value.split('\n').length * 20 });
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, textarea, text: fixture.componentInstance.text };
}

describe('TextareaDirective', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('takes the skin class, which drops the resize grip', async () => {
    const { textarea } = await setup();
    expect(textarea.classList).toContain('g-textarea');
  });

  describe('where the browser cannot size the field', () => {
    beforeEach(() => vi.stubGlobal('CSS', { supports: () => false }));

    it('fits its text once rendered and as it is typed', async () => {
      const { textarea } = await setup();
      expect(textarea.style.height).toBe('20px');
      textarea.value = 'one\ntwo';
      textarea.dispatchEvent(new Event('input'));
      expect(textarea.style.height).toBe('40px');
    });

    it('fits a value its form control writes, as after a reset', async () => {
      const { fixture, textarea, text } = await setup();
      text.set('one\ntwo\nthree');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(textarea.value).toBe('one\ntwo\nthree');
      expect(textarea.style.height).toBe('60px');
    });
  });

  it('leaves the height to the browser where it supports field-sizing', async () => {
    vi.stubGlobal('CSS', { supports: (property: string, value: string) => property === 'field-sizing' && value === 'content' });
    const { textarea } = await setup();
    textarea.value = 'one\ntwo';
    textarea.dispatchEvent(new Event('input'));
    expect(textarea.style.height).toBe('');
  });
});
