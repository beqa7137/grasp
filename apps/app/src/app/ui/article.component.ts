import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Article type for lesson pages (REDESIGN.md 3.2): the paragraphs, lists, definition lists and follow-up disclosures the
 * pattern and design lesson pages each style today. Its rules reach projected content, so they are scoped by the element
 * instead of Angular's emulation.
 */
@Component({
  selector: 'g-article',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  styles: `
    g-article {
      display: block;
      font-size: var(--g-text-body);
      line-height: 1.6;

      p {
        margin: 0 0 var(--g-space-3);
      }
      ul,
      ol {
        margin: 0 0 var(--g-space-3);
        padding-left: var(--g-space-5);
      }
      li {
        margin-bottom: var(--g-space-1);
      }
      dl {
        display: grid;
        gap: var(--g-space-1);
        margin: 0;
      }
      dt {
        margin-top: var(--g-space-2);
        font-weight: 600;
      }
      dd {
        margin: 0;
      }
      details {
        padding: var(--g-space-3) 0;
        border-top: 1px solid var(--g-line);
      }
      details:first-of-type {
        padding-top: 0;
        border-top: 0;
      }
      summary {
        cursor: pointer;
        font-weight: 600;
      }
      details > p {
        margin: var(--g-space-2) 0 0;
      }
    }
  `,
})
export class ArticleComponent {}
