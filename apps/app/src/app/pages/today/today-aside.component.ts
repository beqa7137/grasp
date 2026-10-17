import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { loopReadiness, weakSpots } from '@grasp/engine';
import { ProgressService } from '../../core/progress.service';
import { StoryBankService } from '../behavioral/story-bank.service';
import { DeviceWorkService } from './device-work.service';
import { ReadinessCardComponent } from './readiness-card.component';
import { TodayService } from './today.service';
import { WeakSpotListComponent } from './weak-spot-list.component';
import { WorkListComponent } from './work-list.component';

/** Continue shows this many on Today; Progress lists every one. */
const CONTINUE_LIMIT = 3;

/**
 * Today's second column (REDESIGN.md 4.1): loop readiness, Continue and Weak spots. It loads with Up next at the first
 * idle period. Readiness waits for the story bank and Continue for this device's drafts, so neither shows a wrong number
 * first; both follow the log and the calendar day, not the minute clock.
 */
@Component({
  selector: 'app-today-aside',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReadinessCardComponent, WorkListComponent, WeakSpotListComponent],
  template: `
    @if (readiness(); as r) {
      <app-readiness-card [readiness]="r" />
    }
    @if (work().length) {
      <section class="block continue" aria-labelledby="continue-heading">
        <h2 id="continue-heading" class="eyebrow">Continue</h2>
        <app-work-list [items]="work()" [limit]="continueLimit" />
      </section>
    }
    @if (spots().length) {
      <section class="block" aria-labelledby="weak-heading">
        <h2 id="weak-heading" class="eyebrow">Weak spots</h2>
        <app-weak-spot-list [spots]="spots()" />
      </section>
    }
  `,
  styles: `
    @use '../../../breakpoints' as *;

    :host {
      display: grid;
      gap: var(--g-space-4);
      align-content: start;
    }
    // In one column Continue comes first, so it starts within 1.5 Pixel 7 screens (REDESIGN.md 2.14, journey 4).
    @include container-narrow(today) {
      .continue {
        order: -1;
      }
    }
    .block {
      display: grid;
      gap: var(--g-space-2);
    }
    h2 {
      margin: 0;
    }
  `,
})
export class TodayAsideComponent {
  private readonly progress = inject(ProgressService);
  private readonly bank = inject(StoryBankService);
  private readonly device = inject(DeviceWorkService);
  private readonly today = inject(TodayService);
  private readonly storiesLoaded = signal(false);
  readonly continueLimit = CONTINUE_LIMIT;

  readonly readiness = computed(() => {
    this.today.day();
    const state = this.progress.state();
    if (!this.storiesLoaded()) return null;
    return loopReadiness(state, this.bank.stories(), untracked(this.progress.now));
  });
  readonly work = computed(() => (this.device.loaded() ? this.device.items(this.progress.state(), this.progress.state().plan?.level) : []));
  readonly spots = computed(() => {
    this.today.day();
    return weakSpots(this.progress.state(), untracked(this.progress.now));
  });

  constructor() {
    void this.bank
      .load()
      .catch(() => undefined)
      .then(() => this.storiesLoaded.set(true));
    // Drafts change on other pages, so each visit to Today reads them again.
    effect(() => {
      this.today.visit();
      untracked(() => void this.device.load().catch(() => undefined));
    });
  }
}
