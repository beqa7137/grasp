import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, viewChildren } from '@angular/core';

const KEYWORDS = /\b(function|const|let|for|while|if|else|return|new|of|continue|null|true|false)\b/g;

function highlight(line: string): string {
  const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const commentAt = escaped.indexOf('//');
  const code = commentAt >= 0 ? escaped.slice(0, commentAt) : escaped;
  const comment = commentAt >= 0 ? `<span class="cm">${escaped.slice(commentAt)}</span>` : '';
  return (
    code
      .replace(KEYWORDS, '<span class="kw">$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="nu">$1</span>')
      .replace(/(\.\w+)(?=\()/g, '<span class="fn">$1</span>') + comment
  );
}

/** Long lines scroll sideways on a phone, so the panel takes focus for keyboard scrolling. */
@Component({
  selector: 'g-code-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { tabindex: '0', role: 'region', '[attr.aria-label]': 'label()' },
  template: `
    <ol>
      @for (line of html(); track $index) {
        <li #row [class.on]="$index + 1 === active()">
          <span class="n">{{ $index + 1 }}</span>
          <code [innerHTML]="line"></code>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
      overflow: auto;
      max-height: var(--code-max-height, none);
    }
    :host(:focus-visible) {
      outline-offset: -2px;
    }
    ol {
      list-style: none;
      margin: 0;
      padding: 8px 0;
      min-width: max-content;
    }
    li {
      display: flex;
      gap: 14px;
      padding: 2px 14px 2px 10px;
      border-left: 3px solid transparent;
      font: 0.78125rem/1.65 var(--g-font-mono);
      color: var(--g-code-text);
      transition:
        background 0.2s,
        border-color 0.2s;
      white-space: pre;
    }
    li.on {
      background: var(--g-code-line-on);
      border-left-color: var(--g-accent);
      color: var(--g-text);
    }
    li.on .n {
      color: var(--g-muted);
    }
    .n {
      width: 18px;
      text-align: right;
      color: var(--g-faint);
      user-select: none;
    }
    :host ::ng-deep .kw {
      color: var(--g-syntax-keyword);
    }
    :host ::ng-deep .nu {
      color: var(--g-syntax-number);
    }
    :host ::ng-deep .fn {
      color: var(--g-syntax-function);
    }
    :host ::ng-deep .cm {
      color: var(--g-syntax-comment);
      font-style: italic;
    }
  `,
})
export class CodePanelComponent {
  readonly code = input.required<string[]>();
  readonly active = input<number>(0);
  readonly label = input('Code');
  readonly html = computed(() => this.code().map(highlight));
  private readonly rows = viewChildren<ElementRef<HTMLElement>>('row');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // After rendering, not during it: a layout read while the page is half updated can find it shorter than it is and cut
    // the page's scroll position.
    afterRenderEffect(() => {
      const row = this.rows()[this.active() - 1]?.nativeElement;
      const box = this.host.nativeElement;
      if (!row || box.scrollHeight <= box.clientHeight) return;
      const top = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
      box.scrollTo({ top, behavior: 'smooth' });
    });
  }
}
