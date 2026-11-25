import { Injectable, computed, inject } from '@angular/core';
import { offeredCompany } from '@grasp/engine';
import { ProgressService } from '../core/progress.service';

/** The Target's company when this client offers it. Kept off `ProgressService`, so first paint loads no company rule. */
@Injectable({ providedIn: 'root' })
export class TargetCompanyService {
  private readonly progress = inject(ProgressService);

  /** Only a set Target holds one, so `currentTarget` is not needed. */
  readonly company = computed(() => offeredCompany(this.progress.state().target?.company));
}
