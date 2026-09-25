import { TestBed } from '@angular/core/testing';
import type { Language } from '@grasp/engine';
import { LanguagePickerComponent } from './language-picker.component';

function render(language: Language) {
  const fixture = TestBed.createComponent(LanguagePickerComponent);
  fixture.componentRef.setInput('language', language);
  fixture.detectChanges();
  const picked: Language[] = [];
  fixture.componentInstance.languageChange.subscribe((l) => picked.push(l));
  const radios = Array.from(fixture.nativeElement.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
  return { radios, picked };
}

describe('LanguagePickerComponent', () => {
  it('checks the current language and makes it the only Tab stop', () => {
    const { radios } = render('javascript');
    expect(radios.map((r) => r.textContent!.trim())).toEqual(['Python', 'JavaScript', 'TypeScript']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('picks a language with a click or the arrow keys', () => {
    const { radios, picked } = render('python');
    radios[2].click();
    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(picked).toEqual(['typescript', 'javascript']);
  });
});
