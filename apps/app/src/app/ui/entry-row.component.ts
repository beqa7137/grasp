import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { goIcon } from './icons';
import { type Tone } from './tone';

export interface EntryStatus {
  icon: string;
  /** Read by screen readers in place of the glyph, as "Done" or "Not started". */
  label: string;
  tone?: Extract<Tone, 'neutral' | 'success' | 'danger'>;
}

/**
 * One row of a library list (REDESIGN.md 3.2): status and kind glyphs, the title, then one meta line (kind, shelf, level
 * pips, minutes, status text). Put it on the link or button it opens: `<a g-entry-row routerLink="…">`.
 */
@Component({
  selector: 'a[g-entry-row], button[g-entry-row], g-entry-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    @if (status(); as s) {
      <ion-icon class="status" [class]="s.tone ?? 'neutral'" [icon]="s.icon" role="img" [attr.aria-label]="s.label" />
    }
    @if (kind(); as kind) {
      <ion-icon class="kind" [icon]="kind" aria-hidden="true" />
    }
    <span class="text">
      <span class="title">{{ heading() }}</span>
      @if (meta().length || level()) {
        <span class="meta">
          @for (m of meta(); track $index) {
            <span>{{ m }}</span>
          }
          @if (level(); as level) {
            <span class="pips" role="img" [attr.aria-label]="'Level ' + level + ' of ' + levels()">
              @for (p of pips(); track $index) {
                <i [class.on]="p"></i>
              }
            </span>
          }
        </span>
      }
    </span>
    @if (go()) {
      <ion-icon class="go" [icon]="goIcon" aria-hidden="true" />
    }
  `,
  styles: `
    @use '../../breakpoints' as *;
    @use '../../tone' as *;

    :host {
      display: flex;
      align-items: center;
      gap: var(--g-space-3);
      min-height: 48px;
      padding: var(--g-space-2) var(--g-space-3);
      border-radius: var(--g-radius-sm);
      background: var(--g-sunken);
      color: var(--g-text);
      text-decoration: none;
      text-align: left;
      font: inherit;
      border: 0;
      width: 100%;
    }
    :host(a),
    :host(button) {
      cursor: pointer;
    }
    @include desktop {
      :host {
        min-height: 52px;
      }
    }
    ion-icon {
      flex: none;
      width: 1.15em;
      height: 1.15em;
    }
    .kind,
    .go,
    .status {
      color: var(--g-muted);
    }
    .status {
      @include tone-ink;
    }
    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--g-space-1);
    }
    .title {
      font-weight: 600;
      font-size: var(--g-text-title-s);
      line-height: 1.3;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--g-space-1) var(--g-space-2);
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
    .meta > span + span::before {
      content: '·';
      margin-right: var(--g-space-2);
    }
    .pips {
      display: inline-flex;
      gap: var(--g-space-1);
    }
    .pips i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      border: 1px solid var(--g-stroke);
    }
    .pips i.on {
      background: var(--g-stroke);
    }
  `,
})
export class EntryRowComponent {
  readonly heading = input.required<string>();
  readonly meta = input<string[]>([]);
  readonly kind = input<string>();
  readonly status = input<EntryStatus>();
  readonly level = input<number>();
  readonly levels = input(3);
  /** A trailing arrow, for a row that opens a page. */
  readonly go = input(false);
  readonly goIcon = goIcon;
  readonly pips = computed(() => Array.from({ length: this.levels() }, (_, i) => i < (this.level() ?? 0)));
}
