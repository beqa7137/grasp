import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { crackTime, type PasswordHash } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const HASHES: { hash: PasswordHash; label: string }[] = [
  { hash: 'sha256', label: 'SHA-256' },
  { hash: 'pbkdf2', label: 'PBKDF2 600k' },
  { hash: 'bcrypt', label: 'bcrypt' },
];
const PASSWORDS = [
  { id: 'lower8', label: '8 lowercase letters', alphabet: 26, length: 8 },
  { id: 'mixed8', label: '8 letters and digits', alphabet: 62, length: 8 },
  { id: 'mixed12', label: '12 letters and digits', alphabet: 62, length: 12 },
  { id: 'words4', label: '4 random words', alphabet: 7776, length: 4 },
  { id: 'words6', label: '6 random words', alphabet: 7776, length: 6 },
];
const YEAR = 365.25 * 86_400;
const SCALES: [number, string][] = [
  [1e21, 'sextillion'],
  [1e18, 'quintillion'],
  [1e15, 'quadrillion'],
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
];

function count(n: number): string {
  const scale = SCALES.find(([size]) => n >= size);
  if (!scale) return Math.round(n).toLocaleString('en-US');
  const v = n / scale[0];
  return `${v >= 100 ? Math.round(v) : Number(v.toPrecision(3))} ${scale[1]}`;
}

function duration(seconds: number): string {
  if (seconds < 1) return 'under a second';
  if (seconds < 120) return `${Math.round(seconds)} seconds`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)} hours`;
  if (seconds < YEAR * 2) return `${Math.round(seconds / 86_400)} days`;
  const years = seconds / YEAR;
  if (years < 1e6) return `${Math.round(years).toLocaleString('en-US')} years`;
  if (years < 1e9) return `${Math.round(years / 1e6).toLocaleString('en-US')} million years`;
  return `${(years / 1e9).toLocaleString('en-US', { maximumFractionDigits: 0 })} billion years`;
}

/** An attacker with a stolen, salted hash and some GPUs: how fast they guess and how long every candidate takes. */
@Component({
  selector: 'app-crack-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Password hash">
      @for (h of hashes; track h.hash) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="hash() === h.hash"
          [class.primary]="hash() === h.hash"
          (click)="hash.set(h.hash)"
        >
          {{ h.label }}
        </button>
      }
    </div>
    @if (hash() === 'bcrypt') {
      <label class="slider">
        <span
          >bcrypt cost <strong class="mono">{{ cost() }}</strong></span
        >
        <input type="range" min="8" max="14" step="1" [value]="cost()" (input)="cost.set(+$any($event.target).value)" />
      </label>
    }
    <div class="controls" role="radiogroup" aria-label="Password">
      @for (p of passwords; track p.id) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="password() === p.id"
          [class.primary]="password() === p.id"
          (click)="password.set(p.id)"
        >
          {{ p.label }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >Attacker GPUs <strong class="mono">{{ gpus() | number }}</strong></span
      >
      <input type="range" min="1" max="1000" step="1" [value]="gpus()" (input)="gpus.set(+$any($event.target).value)" />
    </label>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Guesses a second</dt>
        <dd class="word">{{ guesses() }}</dd>
      </div>
      <div>
        <dt>Candidates</dt>
        <dd class="word">{{ candidates() }}</dd>
      </div>
      <div [class.bad]="crack().seconds < 30 * 86_400">
        <dt>Try them all</dt>
        <dd class="word">{{ time() }}</dd>
      </div>
    </dl>
    <p class="muted note">
      One stolen hash with its salt, attacked offline. Rates are rounded from published hashcat benchmarks of one high-end GPU; on average
      the password falls in half the time shown.
    </p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class CrackWidgetComponent {
  readonly hashes = HASHES;
  readonly passwords = PASSWORDS;
  readonly hash = signal<PasswordHash>('bcrypt');
  readonly cost = signal(12);
  readonly password = signal('mixed8');
  readonly gpus = signal(8);
  readonly crack = computed(() => {
    const p = PASSWORDS.find((x) => x.id === this.password())!;
    return crackTime(this.hash(), { alphabet: p.alphabet, length: p.length, gpus: this.gpus(), bcryptCost: this.cost() });
  });
  readonly time = computed(() => duration(this.crack().seconds));
  readonly guesses = computed(() => count(this.crack().guessesPerSecond));
  readonly candidates = computed(() => count(this.crack().space));
}
