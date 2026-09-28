import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { ANSWER_FLAWS, type AnswerFlaw, type WeakExample } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { alertCircle, checkmarkCircle, closeCircle } from 'ionicons/icons';
import { ExampleAnswerComponent } from './example-answer.component';

type Verdict = 'found' | 'missed' | 'wrong' | 'clear';

/** A weak answer the learner diagnoses: pick the problems, then see which were real and why. */
@Component({
  selector: 'app-spot-flaws',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, ExampleAnswerComponent],
  template: `
    <app-example-answer [answer]="example()" />
    <fieldset>
      <legend>What is wrong with this answer? Pick every problem you see.</legend>
      @for (f of flaws; track f.id) {
        @let v = verdict(f.id);
        <label class="flaw" [attr.data-verdict]="checked() ? v : null">
          <input type="checkbox" [checked]="picked().has(f.id)" [disabled]="checked()" (change)="toggle(f.id)" />
          <span class="text">
            <span>{{ f.label }}</span>
            @if (checked() && v !== 'clear') {
              <span class="why">
                <ion-icon [name]="icons[v]" aria-hidden="true" />
                {{ v === 'wrong' ? 'Not a problem in this answer.' : (v === 'missed' ? 'Missed: ' : '') + (example().why[f.id] ?? '') }}
              </span>
            }
          </span>
        </label>
      }
    </fieldset>
    @if (checked()) {
      <p class="score" role="status">{{ summary() }}</p>
      <div class="fix">
        <p class="fix-title">How it reads once fixed</p>
        <p>{{ example().fix }}</p>
      </div>
      <button class="g-btn" (click)="reset()">Try again</button>
    } @else {
      <button class="g-btn primary" [disabled]="!picked().size" (click)="checked.set(true)">Check</button>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    fieldset {
      border: 0;
      margin: 16px 0 12px;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    legend {
      font-weight: 600;
      font-size: 0.9375rem;
      margin-bottom: 8px;
      padding: 0;
    }
    .flaw {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      border: 1px solid var(--g-line);
      border-radius: var(--g-radius-sm);
      cursor: pointer;
      font-size: 0.90625rem;
      line-height: 1.45;
      input {
        margin: 3px 0 0;
        width: 18px;
        height: 18px;
        accent-color: var(--g-accent);
        flex: none;
      }
      &[data-verdict='found'] {
        border-color: var(--g-found-ink);
      }
      &[data-verdict='missed'] {
        border-color: var(--g-warn-ink);
      }
      &[data-verdict='wrong'] {
        border-color: var(--g-danger-ink);
      }
    }
    .text {
      display: grid;
      gap: 6px;
    }
    .why {
      display: flex;
      gap: 6px;
      font-size: 0.875rem;
      color: var(--g-muted);
      ion-icon {
        flex: none;
        margin-top: 2px;
      }
    }
    [data-verdict='found'] .why ion-icon {
      color: var(--g-found-ink);
    }
    [data-verdict='missed'] .why ion-icon {
      color: var(--g-warn-ink);
    }
    [data-verdict='wrong'] .why ion-icon {
      color: var(--g-danger-ink);
    }
    .score {
      font-weight: 600;
      margin: 0 0 10px;
    }
    .fix {
      padding: 12px 14px;
      border-radius: var(--g-radius-sm);
      background: var(--g-raised);
      margin-bottom: 12px;
      p {
        margin: 0;
        line-height: 1.55;
        font-size: 0.90625rem;
      }
      .fix-title {
        font-weight: 600;
        margin-bottom: 4px;
      }
    }
  `,
})
export class SpotFlawsComponent {
  readonly example = input.required<WeakExample>();
  readonly flaws = ANSWER_FLAWS;
  readonly icons: Record<Exclude<Verdict, 'clear'>, string> = { found: 'checkmark-circle', missed: 'alert-circle', wrong: 'close-circle' };
  readonly picked = signal<ReadonlySet<AnswerFlaw>>(new Set());
  readonly checked = signal(false);
  readonly summary = computed(() => {
    const real = this.example().flaws;
    const found = real.filter((f) => this.picked().has(f)).length;
    const wrong = [...this.picked()].filter((f) => !real.includes(f)).length;
    const base = `You found ${found} of ${real.length} problems`;
    return wrong ? `${base}, and flagged ${wrong} that ${wrong === 1 ? 'is' : 'are'} fine here.` : `${base}.`;
  });

  constructor() {
    addIcons({ checkmarkCircle, alertCircle, closeCircle });
  }

  verdict(flaw: AnswerFlaw): Verdict {
    const real = this.example().flaws.includes(flaw);
    const picked = this.picked().has(flaw);
    return real ? (picked ? 'found' : 'missed') : picked ? 'wrong' : 'clear';
  }

  toggle(flaw: AnswerFlaw) {
    this.picked.update((set) => {
      const next = new Set(set);
      if (!next.delete(flaw)) next.add(flaw);
      return next;
    });
  }

  reset() {
    this.picked.set(new Set());
    this.checked.set(false);
  }
}
