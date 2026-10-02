import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  FIRST_RETRY_STOPS,
  LIFETIME_STOPS,
  LONGEST_STOPS,
  OUTAGE_STOPS,
  SMTP_RETRY,
  durationSpoken,
  durationText,
  messagesText,
  num,
  smtpRetry,
  smtpRetryCheckpoint,
  type SmtpReply,
  type SmtpRetrySettings,
  type WidgetCheckpoint,
} from '@grasp/engine';
import { RovingSelectDirective } from '../../../../core/roving-select.directive';
import { settledAnnouncement } from './settled-announcement';
import { WidgetCheckComponent } from './widget-check.component';

type Slider = 'outageMin' | 'firstRetryMin' | 'longestMin' | 'lifetimeMin';

const SLIDERS: { key: Slider; label: string; stops: readonly number[] }[] = [
  { key: 'outageMin', label: 'Remote server broken for', stops: OUTAGE_STOPS },
  { key: 'firstRetryMin', label: 'First retry after', stops: FIRST_RETRY_STOPS },
  { key: 'longestMin', label: 'Longest wait between attempts', stops: LONGEST_STOPS },
  { key: 'lifetimeMin', label: 'Queue lifetime', stops: LIFETIME_STOPS },
];

const REPLIES: { reply: SmtpReply; label: string }[] = [
  { reply: 'temporary', label: '451: try again later (4xx)' },
  { reply: 'permanent', label: '550: no such user (5xx)' },
];

/** Timeline drawing, in viewBox units. */
const LEFT = 8;
const WIDTH = 284;
const TOP = 8;
const BOTTOM = 40;
const HATCH = 7;
/** The narrowest outage band drawn, so even a 5-minute outage shows its hatching. */
const MIN_BAND = 4;
/** Ticks closer than this merge into a bar, so only the first few and the last are drawn, with a gap between. */
const MIN_TICK_GAP = 2;
const FIRST_TICKS = 5;

/** One message sent to a broken server, retried on a doubling schedule: when it is delivered or bounced, and the queue behind it. */
@Component({
  selector: 'app-smtp-retry-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, WidgetCheckComponent],
  template: `
    <div class="controls" role="radiogroup" aria-label="While broken, the remote server answers">
      @for (r of replies; track r.reply) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="settings().reply === r.reply"
          [class.primary]="settings().reply === r.reply"
          (click)="set({ reply: r.reply })"
        >
          {{ r.label }}
        </button>
      }
    </div>
    @for (s of sliders; track s.key) {
      <label class="slider">
        <span
          >{{ s.label }} <strong class="mono">{{ duration(settings()[s.key]) }}</strong></span
        >
        <input
          type="range"
          min="0"
          [max]="s.stops.length - 1"
          step="1"
          [value]="s.stops.indexOf(settings()[s.key])"
          [attr.aria-valuetext]="spoken(settings()[s.key])"
          (input)="slide(s.key, s.stops[+$any($event.target).value])"
        />
      </label>
    }

    <svg class="timeline" viewBox="0 0 300 48" role="img" [attr.aria-label]="timelineLabel()">
      <rect class="band" [attr.x]="drawing().band.x" [attr.y]="top" [attr.width]="drawing().band.w" [attr.height]="bottom - top" />
      <path class="hatch" [attr.d]="drawing().hatch" />
      <path class="axis" [attr.d]="axis" />
      @if (drawing().lifetimeX !== null) {
        <path class="lifetime" [attr.d]="'M' + drawing().lifetimeX + ' 2V46'" />
      }
      @if (answered()) {
        <path class="tick" [attr.d]="drawing().failed" />
        @if (drawing().gap) {
          <path class="gap" [attr.d]="drawing().gap" />
        }
        @if (run().outcome === 'delivered') {
          <circle class="delivered" [attr.cx]="drawing().endX" [attr.cy]="(top + bottom) / 2" r="4" />
        } @else {
          <rect class="bounced" [attr.x]="drawing().endX - 4" [attr.y]="(top + bottom) / 2 - 4" width="8" height="8" />
        }
      }
    </svg>
    <div class="axis-labels" aria-hidden="true">
      <span>0</span>
      <span>{{ duration(drawing().endMin) }}</span>
    </div>
    <ul class="legend-list" aria-hidden="true">
      <li><span class="swatch band"></span>Server broken (hatched)</li>
      <li><span class="swatch lifetime"></span>Queue lifetime (dashed){{ drawing().lifetimeX === null ? ', past the right edge' : '' }}</li>
      @if (answered()) {
        <li><span class="swatch tick"></span>Failed attempt (tick)</li>
        @if (drawing().gap) {
          <li><span class="swatch gap"></span>More attempts (dotted line)</li>
        }
        @if (run().outcome === 'delivered') {
          <li><span class="swatch delivered"></span>Delivered (circle)</li>
        } @else {
          <li><span class="swatch bounced"></span>Bounced (square)</li>
        }
      }
    </ul>

    @if (answered()) {
      <dl class="readouts">
        <div [class.bad]="run().outcome === 'bounced'">
          <dt>Outcome</dt>
          <dd class="mono">{{ outcome() }}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd class="mono">{{ format(run().attempts.length) }}</dd>
        </div>
        <div>
          <dt>Waited after recovery</dt>
          <dd class="mono">{{ run().afterRecoveryMin === null ? 'bounced' : duration(run().afterRecoveryMin!) }}</dd>
        </div>
        <div>
          <dt>Queued at recovery</dt>
          <dd class="mono">{{ format(run().queued) }}</dd>
        </div>
        <div [class.bad]="run().bounced > 0">
          <dt>Bounced</dt>
          <dd class="mono">{{ format(run().bounced) }}</dd>
        </div>
        <div>
          <dt>Queue empty after</dt>
          <dd class="mono">{{ run().queued ? duration(run().drainMin) : 'none queued' }}</dd>
        </div>
      </dl>
    } @else {
      <p class="muted hidden-note">The attempts, the outcome and the queue show once you answer the prediction below.</p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
    <p class="muted note">
      One message is sent as the outage begins, and {{ perMinute }} more a minute follow it to the same domain. Each failed attempt doubles
      the wait before the next, up to the longest wait; in this model, as in Postfix by default, nothing tells the queue the server is back,
      so a message waits for its own next attempt. The first failed attempt at or past the queue lifetime bounces the message to its sender.
    </p>

    <app-widget-check [check]="shownCheck()" [chosen]="chosen()" (chosenChange)="answer($event)" />
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .timeline {
      max-width: 520px;
      margin: 4px auto 0;
      border-radius: var(--g-radius-sm);
      background: var(--g-raised);
    }
    .band {
      fill: var(--g-accent-soft);
      stroke: var(--g-stroke);
      stroke-width: 0.6;
    }
    .hatch {
      stroke: var(--g-muted);
      stroke-width: 0.8;
    }
    .gap {
      stroke: var(--g-accent);
      stroke-width: 1.2;
      stroke-dasharray: 1 2;
    }
    .axis {
      stroke: var(--g-text);
      stroke-width: 0.8;
    }
    .lifetime {
      stroke: var(--g-text);
      stroke-width: 1;
      stroke-dasharray: 3 2;
    }
    .tick {
      stroke: var(--g-accent);
      stroke-width: 1;
    }
    .delivered {
      fill: var(--g-accent);
      stroke: var(--g-raised);
      stroke-width: 1;
    }
    .bounced {
      fill: var(--g-danger-ink);
      stroke: var(--g-raised);
      stroke-width: 1;
    }
    .axis-labels {
      display: flex;
      justify-content: space-between;
      max-width: 520px;
      margin: 2px auto 6px;
      font: 0.75rem var(--g-font-mono);
      color: var(--g-muted);
    }
    .legend-list {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px 14px;
      margin: 0 0 12px;
      padding: 0;
      font-size: 0.8125rem;
    }
    .legend-list li {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .swatch {
      display: inline-block;
      flex: none;
      width: 12px;
      height: 12px;
      &.band {
        border: 1px solid var(--g-stroke);
        background: repeating-linear-gradient(-60deg, var(--g-muted) 0 1.5px, transparent 1.5px 4px), var(--g-accent-soft);
      }
      &.lifetime {
        width: 2px;
        border-left: 2px dashed var(--g-text);
      }
      &.tick {
        width: 2px;
        background: var(--g-accent);
      }
      &.gap {
        height: 2px;
        background: repeating-linear-gradient(90deg, var(--g-accent) 0 2px, transparent 2px 4px);
      }
      &.delivered {
        border-radius: 50%;
        background: var(--g-accent);
      }
      &.bounced {
        width: 10px;
        height: 10px;
        background: var(--g-danger-ink);
      }
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(min(132px, 100%), 1fr));
    }
    .hidden-note {
      font-size: 0.8125rem;
      margin: 0;
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 16px;
      line-height: 1.5;
    }
  `,
})
export class SmtpRetryWidgetComponent {
  readonly sliders = SLIDERS;
  readonly replies = REPLIES;
  readonly format = num;
  readonly duration = durationText;
  readonly spoken = durationSpoken;
  readonly perMinute = SMTP_RETRY.perMinute;
  readonly top = TOP;
  readonly bottom = BOTTOM;
  readonly axis = `M${LEFT} ${BOTTOM}H${LEFT + WIDTH}`;
  readonly settings = signal<SmtpRetrySettings>({
    outageMin: 360,
    firstRetryMin: 5,
    longestMin: 60,
    lifetimeMin: 7_200,
    reply: 'temporary',
  });
  readonly run = computed(() => smtpRetry(this.settings()));
  readonly check = computed(() => smtpRetryCheckpoint(this.settings(), this.run()));
  /** A new reply asks again; the sliders only move the readouts under an answered question. */
  private readonly asked = computed(() => this.settings().reply);
  private readonly answers = signal<{ asked: string; chosen: number; check: WidgetCheckpoint } | null>(null);
  private readonly current = computed(() => {
    const a = this.answers();
    return a?.asked === this.asked() ? a : null;
  });
  readonly chosen = computed(() => this.current()?.chosen ?? null);
  readonly answered = computed(() => this.chosen() !== null);
  readonly shownCheck = computed(() => this.current()?.check ?? this.check());
  readonly outcome = computed(() => {
    const run = this.run();
    if (run.outcome === 'delivered') return `Delivered at ${durationText(run.atMin)}`;
    return run.atMin === 0 ? 'Bounced at once' : `Bounced at ${durationText(run.atMin)}`;
  });
  readonly drawing = computed(() => this.draw());
  readonly timelineLabel = computed(() => {
    const s = this.settings();
    const head = `Timeline of a ${durationText(s.outageMin)} outage, with a ${durationText(s.lifetimeMin)} queue lifetime`;
    if (!this.answered()) return `${head}; the attempts show once you answer`;
    const run = this.run();
    return `${head}: ${num(run.attempts.length)} attempt${run.attempts.length === 1 ? '' : 's'}, ${this.outcome().toLowerCase()}`;
  });
  readonly announcement = settledAnnouncement(() => this.summary());

  /** The chart runs to where the outcome can fall, from the settings alone, so before an answer it gives nothing away. */
  private draw() {
    const s = this.settings();
    const run = this.run();
    const endMin = Math.min(s.outageMin, s.lifetimeMin) + s.longestMin;
    const x = (t: number) => LEFT + (Math.min(t, endMin) / endMin) * WIDTH;
    const bandW = Math.max(x(s.outageMin) - LEFT, MIN_BAND);
    const hatch: string[] = [];
    for (let h = LEFT; h + HATCH / 2 <= LEFT + bandW; h += HATCH)
      hatch.push(`M${h.toFixed(2)} ${BOTTOM}L${(h + HATCH / 2).toFixed(2)} ${TOP}`);
    const xs = run.attempts.slice(0, -1).map(x);
    const crowded = xs.length > FIRST_TICKS + 1 && xs.some((v, i) => i > 0 && v - xs[i - 1] < MIN_TICK_GAP);
    const shown = crowded ? [...xs.slice(0, FIRST_TICKS), xs.at(-1)!] : xs;
    const failed = shown.map((v) => `M${v.toFixed(2)} ${TOP + 6}V${BOTTOM - 6}`);
    const mid = (TOP + BOTTOM) / 2;
    const gap = crowded ? `M${(xs[FIRST_TICKS - 1] + 1.5).toFixed(2)} ${mid}H${(xs.at(-1)! - 1.5).toFixed(2)}` : '';
    return {
      endMin,
      band: { x: LEFT, w: bandW },
      hatch: hatch.join(''),
      lifetimeX: s.lifetimeMin <= endMin ? Number(x(s.lifetimeMin).toFixed(2)) : null,
      failed: failed.join(''),
      gap,
      endX: x(run.atMin),
    };
  }

  private summary(): string {
    const s = this.settings();
    const head = `${s.reply === 'temporary' ? '451' : '550'} for ${durationSpoken(s.outageMin)}; retries from ${durationSpoken(s.firstRetryMin)} up to ${durationSpoken(s.longestMin)}; lifetime ${durationSpoken(s.lifetimeMin)}.`;
    if (!this.answered()) return `${head} Answer the prediction to see the attempts.`;
    const run = this.run();
    return `${head} ${this.outcome()} after ${run.attempts.length} attempt${run.attempts.length === 1 ? '' : 's'}; ${messagesText(run.queued)} queued at recovery, ${num(run.bounced)} bounced.`;
  }

  set(change: Partial<SmtpRetrySettings>) {
    const s = this.settings();
    if ((Object.keys(change) as (keyof SmtpRetrySettings)[]).every((k) => change[k] === s[k])) return;
    this.settings.set({ ...s, ...change });
  }

  slide(key: Slider, value: number) {
    this.set({ [key]: value });
  }

  answer(chosen: number | null) {
    if (chosen !== null) this.answers.set({ asked: this.asked(), chosen, check: this.check() });
  }
}
