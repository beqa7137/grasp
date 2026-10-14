import { ChangeDetectionStrategy, booleanAttribute, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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
 * pips, minutes, status text) under it. With `inline`, the pips and status text sit at the row's end and the meta is one
 * note under the title. Put it on the link or button it opens: `<a g-entry-row routerLink="…">`. Content marked `lead`
 * replaces the status glyph; content marked `end` goes last.
 */
@Component({
  selector: 'a[g-entry-row], button[g-entry-row], g-entry-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, NgTemplateOutlet],
  host: { '[class.inline]': 'inline()' },
  template: `
    <ng-content select="[lead]" />
    @if (status(); as s) {
      <ion-icon class="status" [class]="s.tone ?? 'neutral'" [icon]="s.icon" role="img" [attr.aria-label]="s.label" />
    }
    @if (kind(); as kind) {
      <ion-icon class="kind" [icon]="kind" aria-hidden="true" />
    }
    <span class="text">
      <span class="title">{{ heading() }}</span>
      @if (inline()) {
        @if (meta().length) {
          <span class="note">{{ meta().join(' · ') }}</span>
        }
      } @else if (meta().length || level() || after().length) {
        <span class="meta">
          @for (m of meta(); track $index) {
            <span>{{ m }}</span>
          }
          <ng-container *ngTemplateOutlet="tail" />
        </span>
      }
    </span>
    @if (inline() && (level() || after().length)) {
      <span class="end"><ng-container *ngTemplateOutlet="tail" /></span>
    }
    <ng-template #tail>
      @if (level(); as level) {
        <span class="pips" role="img" [attr.aria-label]="levelLabel() ?? 'Level ' + level + ' of ' + levels()">
          @for (p of pips(); track $index) {
            <i [class.on]="p"></i>
          }
        </span>
      }
      @for (m of after(); track $index) {
        <span>{{ m }}</span>
      }
    </ng-template>
    <ng-content select="[end]" />
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
    /* One shape for every row: the title with an optional note under it, then the pips and status text at the row's end. */
    .note {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
    .end {
      flex: none;
      display: flex;
      align-items: center;
      gap: var(--g-space-2);
      white-space: nowrap;
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
    }
    .meta > span + span::before {
      content: '·';
      margin-right: var(--g-space-2);
    }
    .pips {
      display: inline-flex;
      align-items: center;
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
  /** Meta after the level pips: status text such as "best 2/5". */
  readonly after = input<string[]>([]);
  readonly kind = input<string>();
  readonly status = input<EntryStatus>();
  readonly level = input<number>();
  readonly levels = input(3);
  /** Read in place of "Level 2 of 3", as "Medium" for a difficulty. */
  readonly levelLabel = input<string>();
  /** The meta line after the title, on the title's line while both fit. */
  readonly inline = input(false, { transform: booleanAttribute });
  /** A trailing arrow, for a row that opens a page. */
  readonly go = input(false);
  readonly goIcon = goIcon;
  readonly pips = computed(() => Array.from({ length: this.levels() }, (_, i) => i < (this.level() ?? 0)));
}
