import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type Tone } from './tone';

export type ChipKind = 'pattern' | 'difficulty' | 'complexity';
export type ChipTone = Extract<Tone, 'neutral' | 'success' | 'warn' | 'danger'>;

const ORDER: Record<ChipKind, number> = { pattern: 0, difficulty: 1, complexity: 2 };

/** Chips always read pattern, then difficulty, then complexity (REDESIGN.md 3.2), whatever order the data lists them in. */
export function orderChips<T extends { kind: ChipKind }>(chips: readonly T[]): T[] {
  return [...chips].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

/** A small label, or a link or button when put on one: `<a g-chip routerLink="…">`. Tones colour the text only. */
@Component({
  selector: 'g-chip, a[g-chip], button[g-chip]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'tone()' },
  template: `<ng-content />`,
  styles: `
    @use '../../tone' as *;

    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--g-space-1);
      max-width: 100%;
      padding: var(--g-space-1) var(--g-space-3);
      border-radius: var(--g-radius-pill);
      border: 1px solid var(--g-line);
      background: var(--g-raised);
      color: var(--g-muted);
      font: 500 var(--g-text-body-s) / 1.3 var(--ion-font-family);
      text-decoration: none;
    }
    :host(a),
    :host(button) {
      min-height: 32px;
      border-color: var(--g-line-strong);
      box-shadow: var(--g-shadow-raised);
      color: var(--g-text);
      cursor: pointer;
    }
    :host {
      @include tone-ink;
    }
  `,
})
export class ChipComponent {
  readonly tone = input<ChipTone>('neutral');
}
