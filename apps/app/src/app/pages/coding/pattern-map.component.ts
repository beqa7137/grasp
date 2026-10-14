import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PATTERN_CATALOG, PATTERN_TRACKS, type Track } from '@grasp/engine';
import { ChipComponent } from '../../ui/chip.component';
import { EntryRowComponent } from '../../ui/entry-row.component';
import { SkillStateComponent, type SkillGlyph } from '../../ui/skill-state.component';

export interface PatternMapRow {
  glyph: SkillGlyph;
  meta?: string[];
  startHere?: boolean;
  flagged?: boolean;
  stretch?: boolean;
}

const BLURBS: Record<Track, string> = {
  foundations: 'The four patterns behind a third of all interview questions.',
  core: 'Stacks, sweeps and heaps: where O(n²) becomes O(n).',
  graphs: 'Traversal, ordering, connectivity, shortest paths.',
  advanced: 'Dynamic programming, tries, greedy proofs, bits.',
};

/**
 * The 23 patterns in their four tracks, each a row with its state's shape and marks: the Coding hub's Skill map and the
 * placement check's results (REDESIGN.md 2.8, 4.10). The page gives each pattern its row; this only lays them out.
 */
@Component({
  selector: 'app-pattern-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChipComponent, EntryRowComponent, SkillStateComponent],
  template: `
    <ul class="legend" aria-label="Key">
      @for (k of legend(); track k.glyph) {
        <li><g-skill-state aria-hidden="true" [state]="k.glyph" />{{ k.label }}</li>
      }
    </ul>
    <p class="key-note"><ng-content /></p>
    @for (t of tracks; track t.id) {
      <section class="track" [attr.aria-labelledby]="'track-' + t.id">
        <div class="track-head">
          <h2 [id]="'track-' + t.id">{{ t.name }}</h2>
          <p>{{ t.blurb }}</p>
        </div>
        <ul class="patterns">
          @for (p of t.patterns; track p.id) {
            @let row = rows()[p.id];
            <li>
              <a g-entry-row [heading]="p.name" [meta]="row.meta ?? []" [routerLink]="['/coding/patterns', p.id]">
                <g-skill-state lead [state]="row.glyph" />
                @if (row.startHere || row.flagged || row.stretch) {
                  <span end class="marks">
                    @if (row.startHere) {
                      <g-chip tone="accent">Start here</g-chip>
                    }
                    @if (row.flagged) {
                      <g-chip tone="warn">Flagged</g-chip>
                    }
                    @if (row.stretch) {
                      <g-chip>Stretch</g-chip>
                    }
                  </span>
                }
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--g-space-1) var(--g-space-4);
      margin: 0 0 var(--g-space-2);
      padding: 0;
      list-style: none;
      font-size: var(--g-text-body-s);
      color: var(--g-muted);
      li {
        display: inline-flex;
        align-items: center;
        gap: var(--g-space-1);
      }
    }
    .key-note {
      max-width: 70ch;
      margin: 0 0 var(--g-space-4);
      font-size: var(--g-text-body-s);
      line-height: 1.5;
      color: var(--g-muted);
    }
    .key-note:empty {
      margin-bottom: var(--g-space-3);
    }
    .track + .track {
      margin-top: var(--g-space-5);
    }
    .track-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--g-space-1) var(--g-space-3);
      margin-bottom: var(--g-space-2);
      h2 {
        margin: 0;
        font-size: var(--g-text-title-l);
      }
      p {
        margin: 0;
        color: var(--g-muted);
        font-size: var(--g-text-body-s);
      }
    }
    .patterns {
      display: grid;
      gap: var(--g-space-2);
      grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li,
    a {
      height: 100%;
    }
    .marks {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--g-space-1);
    }
  `,
})
export class PatternMapComponent {
  /** What each shape means, since a row names its state only to screen readers. */
  readonly legend = input.required<readonly { glyph: SkillGlyph; label: string }[]>();
  /** Each pattern's row, by pattern id. */
  readonly rows = input.required<Readonly<Record<string, PatternMapRow>>>();
  readonly tracks = PATTERN_TRACKS.map((t) => ({ ...t, blurb: BLURBS[t.id], patterns: PATTERN_CATALOG.filter((p) => p.track === t.id) }));
}
