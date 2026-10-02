import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  CACHE_STOPS,
  DISTRIBUTION,
  HOSTS_STOPS,
  ORIGIN_STOPS,
  SIZE_STOPS,
  TIERS,
  TIER_TEXT,
  distribution,
  distributionCheckpoint,
  num,
  secondsSpan,
  storageText,
  type DistributionSettings,
  type Tier,
  type WidgetCheckpoint,
} from '@grasp/engine';
import { RovingSelectDirective } from '../../../../core/roving-select.directive';
import { settledAnnouncement } from './settled-announcement';
import { WidgetCheckComponent } from './widget-check.component';

type Slider = 'sizeMb' | 'hosts' | 'originGbps' | 'caches';
type Toggle = 'p2p' | 'delta';

const SLIDERS: { key: Slider; label: string; stops: readonly number[]; shown: (v: number) => string; spoken: (v: number) => string }[] = [
  { key: 'sizeMb', label: 'Artifact size', stops: SIZE_STOPS, shown: (v) => `${num(v)} MB`, spoken: (v) => `${num(v)} megabytes` },
  { key: 'hosts', label: 'Hosts', stops: HOSTS_STOPS, shown: num, spoken: (v) => `${num(v)} hosts` },
  { key: 'originGbps', label: "Origin's link", stops: ORIGIN_STOPS, shown: (v) => `${v} Gbit/s`, spoken: (v) => `${v} gigabits a second` },
  {
    key: 'caches',
    label: 'Regional caches',
    stops: CACHE_STOPS,
    shown: (v) => (v === 0 ? 'none' : num(v)),
    spoken: (v) => (v === 0 ? 'no caches' : `${v} cache${v === 1 ? '' : 's'}`),
  },
];

const TOGGLES: { key: Toggle; label: string; off: string; on: string }[] = [
  { key: 'p2p', label: 'How hosts download', off: 'Each on its own', on: 'Peer to peer' },
  { key: 'delta', label: 'What is sent', off: 'The whole artifact', on: 'A delta' },
];

const ROW_TEXT: Record<Tier, string> = { origin: "Origin's uplink", caches: "Regional caches' links", hosts: "Hosts' own links" };

/** One release fanned out to the fleet through an origin, regional caches and peers: the time, the origin's bytes and the slowest tier. */
@Component({
  selector: 'app-artifact-distribution-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, WidgetCheckComponent],
  template: `
    @for (t of toggles; track t.key) {
      <div class="controls" role="radiogroup" [attr.aria-label]="t.label">
        <span class="group-label muted" aria-hidden="true">{{ t.label }}</span>
        @for (on of [false, true]; track on) {
          <button
            class="g-btn"
            role="radio"
            [attr.aria-checked]="settings()[t.key] === on"
            [class.primary]="settings()[t.key] === on"
            (click)="toggle(t.key, on)"
          >
            {{ on ? t.on : t.off }}
          </button>
        }
      </div>
    }
    @for (s of sliders; track s.key) {
      <label class="slider">
        <span
          >{{ s.label }} <strong class="mono">{{ s.shown(settings()[s.key]) }}</strong></span
        >
        <input
          type="range"
          min="0"
          [max]="s.stops.length - 1"
          step="1"
          [value]="s.stops.indexOf(settings()[s.key])"
          [attr.aria-valuetext]="s.spoken(settings()[s.key])"
          (input)="slide(s.key, s.stops[+$any($event.target).value])"
        />
      </label>
    }

    @if (answered()) {
      <div class="tiers" role="img" [attr.aria-label]="tiersLabel()">
        @for (t of rows(); track t.tier) {
          <div class="tier">
            <span class="name">{{ rowText[t.tier] }}{{ t.tier === run().bottleneck ? ', bottleneck' : '' }}</span>
            <span class="time mono">{{ span(t.seconds) }}</span>
            <span class="track"
              ><span class="bar" [class.slowest]="t.tier === run().bottleneck" [class.thin]="t.width < 2" [style.width.%]="t.width"></span
            ></span>
          </div>
        }
      </div>
      <ul class="legend-list" aria-hidden="true">
        <li><span class="swatch slowest"></span>Bottleneck (solid bar)</li>
        <li><span class="swatch other"></span>Other tiers (outlined bar)</li>
      </ul>
    }
    <dl class="readouts">
      <div>
        <dt>Each host gets</dt>
        <dd class="mono">{{ bytes(run().bytesPerHost) }}</dd>
      </div>
      @if (answered()) {
        <div>
          <dt>Every host has it</dt>
          <dd class="mono">{{ span(run().seconds) }}</dd>
        </div>
        <div>
          <dt>Leaves the origin</dt>
          <dd class="mono">{{ bytes(run().originBytes) }}</dd>
        </div>
        <div>
          <dt>Reaches hosts in all</dt>
          <dd class="mono">{{ bytes(settings().hosts * run().bytesPerHost) }}</dd>
        </div>
      }
    </dl>
    @if (!answered()) {
      <p class="muted hidden-note">The time, the origin's bytes and the bottleneck show once you answer the prediction below.</p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
    <p class="muted note">
      The ideal fluid model: data streams through every tier at once, so the slowest sets the time. A deploy agent may use
      {{ model.hostDownGbps }} Gbit/s down and {{ model.hostUpGbps }} up, each cache has {{ model.cacheGbps }} Gbit/s and serves an equal
      share of the hosts, and a delta is {{ model.deltaShare * 100 }}% of the artifact. Peers trade pieces, checked against the digest; the
      origin or a cache sends each piece to the swarm about once. Real fleets add piece hops, verification and stragglers.
    </p>

    <app-widget-check [check]="shownCheck()" [chosen]="chosen()" (chosenChange)="answer($event)" />
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .group-label {
      font-size: 0.875rem;
    }
    .tiers {
      display: grid;
      gap: 8px;
      margin: 4px 0 8px;
      padding: 8px 10px;
      border-radius: var(--g-radius-sm);
      background: var(--g-raised);
    }
    .tier {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 2px 10px;
      font-size: 0.8125rem;
    }
    .name {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .time {
      justify-self: end;
    }
    .track {
      grid-column: 1 / -1;
      display: block;
      height: 12px;
      min-width: 0;
    }
    .bar {
      display: block;
      height: 100%;
      min-width: 3px;
      box-sizing: border-box;
      border: 1.5px solid var(--g-accent);
      border-radius: 2px;
      &.slowest {
        background: var(--g-accent);
      }
      &.thin {
        min-width: 6px;
        border-width: 1px;
      }
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
      min-width: 0;
    }
    .swatch {
      display: inline-block;
      flex: none;
      width: 16px;
      height: 10px;
      box-sizing: border-box;
      border: 1.5px solid var(--g-accent);
      border-radius: 2px;
      &.slowest {
        background: var(--g-accent);
      }
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(min(132px, 100%), 1fr));
    }
    .hidden-note {
      font-size: 0.8125rem;
      margin: 8px 0 0;
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 16px;
      line-height: 1.5;
    }
  `,
})
export class ArtifactDistributionWidgetComponent {
  readonly sliders = SLIDERS;
  readonly toggles = TOGGLES;
  readonly rowText = ROW_TEXT;
  readonly model = DISTRIBUTION;
  readonly bytes = storageText;
  readonly span = secondsSpan;
  readonly settings = signal<DistributionSettings>({ sizeMb: 500, hosts: 20_000, originGbps: 10, caches: 5, p2p: false, delta: false });
  readonly run = computed(() => distribution(this.settings()));
  readonly check = computed(() => distributionCheckpoint(this.settings(), this.run()));
  /** Turning peers or the delta on or off asks again; the sliders only move the readouts under an answered question. */
  private readonly asked = computed(() => `${this.settings().p2p} ${this.settings().delta}`);
  private readonly answers = signal<{ asked: string; chosen: number; check: WidgetCheckpoint } | null>(null);
  private readonly current = computed(() => {
    const a = this.answers();
    return a?.asked === this.asked() ? a : null;
  });
  readonly chosen = computed(() => this.current()?.chosen ?? null);
  readonly answered = computed(() => this.chosen() !== null);
  readonly shownCheck = computed(() => this.current()?.check ?? this.check());
  /** Tiers present, each as a share of the slowest; a tier missing (no caches) is left out. */
  readonly rows = computed(() => {
    const { tierSeconds, seconds } = this.run();
    return TIERS.filter((t) => tierSeconds[t] !== undefined).map((tier) => ({
      tier,
      seconds: tierSeconds[tier]!,
      width: (tierSeconds[tier]! / seconds) * 100,
    }));
  });
  readonly tiersLabel = computed(
    () =>
      `Time each tier needs: ${this.rows()
        .map((r) => `${TIER_TEXT[r.tier].toLowerCase()} ${secondsSpan(r.seconds)}`)
        .join(', ')}; the bottleneck is ${TIER_TEXT[this.run().bottleneck].toLowerCase()}`,
  );
  readonly announcement = settledAnnouncement(() => this.summary());

  private summary(): string {
    const s = this.settings();
    const head = `${num(s.sizeMb)} megabytes${s.delta ? ' as a delta' : ''} to ${num(s.hosts)} hosts, origin ${s.originGbps} gigabits a second, ${s.caches === 0 ? 'no caches' : `${s.caches} cache${s.caches === 1 ? '' : 's'}`}, ${s.p2p ? 'peer to peer' : 'each host on its own'}.`;
    if (!this.answered()) return `${head} Answer the prediction to see the time.`;
    const run = this.run();
    return `${head} Every host has it in ${secondsSpan(run.seconds)}; ${storageText(run.originBytes)} leaves the origin; the bottleneck is ${TIER_TEXT[run.bottleneck].toLowerCase()}.`;
  }

  set(change: Partial<DistributionSettings>) {
    const s = this.settings();
    if ((Object.keys(change) as (keyof DistributionSettings)[]).every((k) => change[k] === s[k])) return;
    this.settings.set({ ...s, ...change });
  }

  toggle(key: Toggle, on: boolean) {
    this.set({ [key]: on });
  }

  slide(key: Slider, value: number) {
    this.set({ [key]: value });
  }

  answer(chosen: number | null) {
    if (chosen !== null) this.answers.set({ asked: this.asked(), chosen, check: this.check() });
  }
}
