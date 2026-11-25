import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { OFFERED_COMPANIES, type ReportedItems } from '@grasp/engine';
import { ProgressService } from '../core/progress.service';
import { TargetCompanyService } from './target-company.service';

type ReportsModule = typeof import('./reported-items');

/**
 * What the offered companies' interview reports name on the device's day, the same day the item pages use. The report
 * data loads only once a page asks for it or the Target names an offered company, so other learners never fetch it.
 */
@Injectable({ providedIn: 'root' })
export class ReportedService {
  private readonly progress = inject(ProgressService);
  private readonly module = signal<ReportsModule | null>(null);
  private loading: Promise<void> | null = null;

  readonly company = inject(TargetCompanyService).company;

  private readonly all = computed(() => {
    const m = this.module();
    const day = this.progress.day();
    return m ? OFFERED_COMPANIES.map((c) => m.reportedItems(c, day)) : [];
  });

  /** The Target company's reported items, or null without one (or while the data loads). */
  readonly items = computed<ReportedItems | null>(() => this.all().find((r) => r.company === this.company()) ?? null);

  /** Per offered company, for the libraries' "Reported at" facet. */
  readonly problems = computed(() => Object.fromEntries(this.all().map((r) => [r.company, r.problems])));
  readonly cases = computed(() => Object.fromEntries(this.all().map((r) => [r.company, r.cases])));

  constructor() {
    effect(() => {
      if (this.company()) void this.load();
    });
  }

  load(): Promise<void> {
    this.loading ??= import('./reported-items').then(
      (m) => this.module.set(m),
      () => void (this.loading = null),
    );
    return this.loading;
  }

  /** Settles once the Target company's items are known, at once without one, so a card is chosen with them only once. */
  ready(): Promise<void> {
    return this.company() ? this.load() : Promise.resolve();
  }
}
