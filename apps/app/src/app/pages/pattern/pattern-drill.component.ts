import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DrillSessionComponent } from '../drill/drill-session.component';

/** A pattern hub's Drill segment: the pattern's cards, outside the review schedule, under the hub's header. */
@Component({
  selector: 'app-pattern-drill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DrillSessionComponent],
  template: `<app-drill-session [pattern]="id" [embedded]="true" />`,
})
export class PatternDrillComponent {
  // A hub shows one pattern, so its segments read the hub's id once.
  readonly id = inject(ActivatedRoute).parent?.snapshot.paramMap.get('id') ?? '';
  private readonly session = viewChild.required(DrillSessionComponent);

  /** The hub passes on its page's entry, which the session uses to start a fresh round. */
  ionViewWillEnter() {
    this.session().ionViewWillEnter();
  }
}
