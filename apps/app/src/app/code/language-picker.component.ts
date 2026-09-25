import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LANGUAGES, type Language } from '@grasp/engine';
import { RovingSelectDirective } from '../core/roving-select.directive';

export const LANGUAGE_LABELS: Record<Language, string> = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript' };

@Component({
  selector: 'app-language-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective],
  template: `
    <div class="langs" role="radiogroup" aria-label="Language">
      @for (l of languages; track l) {
        <button role="radio" [attr.aria-checked]="language() === l" [class.on]="language() === l" (click)="languageChange.emit(l)">
          {{ labels[l] }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
      max-width: 100%;
    }
    .langs {
      display: inline-flex;
      flex-wrap: wrap;
      max-width: 100%;
      border: 1px solid var(--g-line-strong);
      border-radius: 10px;
      overflow: hidden;
    }
    button {
      appearance: none;
      border: none;
      background: transparent;
      color: var(--g-muted);
      padding: 8px 12px;
      font: 500 0.8125rem/1 var(--ion-font-family);
      cursor: pointer;
    }
    button.on {
      background: var(--g-accent-soft);
      color: var(--g-accent);
    }
    button:focus-visible {
      outline-offset: -2px;
    }
  `,
})
export class LanguagePickerComponent {
  readonly language = input.required<Language>();
  readonly languageChange = output<Language>();
  readonly languages = LANGUAGES;
  readonly labels = LANGUAGE_LABELS;
}
