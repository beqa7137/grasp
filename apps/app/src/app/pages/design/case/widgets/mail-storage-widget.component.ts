import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  MAIL_PARTS,
  MAIL_STORAGE,
  PART_TEXT,
  REPLICATIONS,
  STORAGE_LIMITS,
  mailStorage,
  mailStorageCheckpoint,
  num,
  storageText,
  type MailPart,
  type MailStorageSettings,
  type Replication,
  type WidgetCheckpoint,
} from '@grasp/engine';
import { RovingSelectDirective } from '../../../../core/roving-select.directive';
import { settledAnnouncement } from './settled-announcement';
import { WidgetCheckComponent } from './widget-check.component';

type Slider = keyof typeof STORAGE_LIMITS;

const SLIDERS: { key: Slider; label: string; shown: (v: number) => string; spoken: (v: number) => string }[] = [
  { key: 'usersM', label: 'Mailboxes', shown: (v) => `${num(v)} million`, spoken: (v) => `${num(v)} million mailboxes` },
  { key: 'perDay', label: 'Messages a day each', shown: num, spoken: (v) => `${num(v)} messages a day` },
  { key: 'attachmentPct', label: 'Messages with attachments', shown: (v) => `${v}%`, spoken: (v) => `${v} percent of messages` },
  { key: 'attachmentKb', label: 'Attachments per such message', shown: (v) => `${num(v)} KB`, spoken: (v) => `${num(v)} kilobytes` },
  { key: 'dedupPct', label: 'Attachment bytes already stored', shown: (v) => `${v}%`, spoken: (v) => `${v} percent already stored` },
];

const COPIES: Record<Replication, string> = { 3: 'Three copies', 1.5: 'Erasure code (1.5x)' };
const MARKS: Record<MailPart, string> = { metadata: 'solid', bodies: 'striped', attachments: 'dotted' };

/** A year of mail for the whole service: metadata, bodies and attachments, what compression and dedup save, and the copies on disk. */
@Component({
  selector: 'app-mail-storage-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, WidgetCheckComponent],
  template: `
    <div class="controls" role="radiogroup" aria-label="How stored bytes are kept durable">
      @for (r of replications; track r) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="settings().replication === r"
          [class.primary]="settings().replication === r"
          (click)="set({ replication: r })"
        >
          {{ copies[r] }}
        </button>
      }
    </div>
    @for (s of sliders; track s.key) {
      <label class="slider">
        <span
          >{{ s.label }} <strong class="mono">{{ s.shown(settings()[s.key]) }}</strong></span
        >
        <input
          type="range"
          [min]="limits[s.key].min"
          [max]="limits[s.key].max"
          [step]="limits[s.key].step"
          [value]="settings()[s.key]"
          [attr.aria-valuetext]="s.spoken(settings()[s.key])"
          (input)="slide(s.key, +$any($event.target).value)"
        />
      </label>
    }

    @if (answered()) {
      <div class="split" role="img" [attr.aria-label]="splitLabel()">
        @for (p of shownParts(); track p) {
          <span [class]="'part ' + p" [style.width.%]="shares()[p]"></span>
        }
      </div>
      <ul class="legend-list" aria-hidden="true">
        @for (p of shownParts(); track p) {
          <li>
            <span [class]="'swatch ' + p"></span>{{ partText[p] }} ({{ marks[p] }}) {{ bytes(run().stored[p]) }},
            {{ percent(shares()[p]) }}
          </li>
        }
      </ul>
    }
    <dl class="readouts">
      <div>
        <dt>Messages a year</dt>
        <dd class="mono">{{ messages() }}</dd>
      </div>
      @if (answered()) {
        <div>
          <dt>As they arrive</dt>
          <dd class="mono">{{ bytes(run().rawBytes) }}</dd>
        </div>
        <div>
          <dt>Saved by compression</dt>
          <dd class="mono">{{ bytes(run().compressionSaved) }}</dd>
        </div>
        <div>
          <dt>Saved by dedup</dt>
          <dd class="mono">{{ bytes(run().dedupSaved) }}</dd>
        </div>
        <div>
          <dt>Stored, one copy</dt>
          <dd class="mono">{{ bytes(run().storedBytes) }}</dd>
        </div>
        <div>
          <dt>On disk</dt>
          <dd class="mono">{{ bytes(run().diskBytes) }}</dd>
        </div>
        <div>
          <dt>Per mailbox a year</dt>
          <dd class="mono">{{ bytes(run().perUserBytes) }}</dd>
        </div>
        <div [class.bad]="run().quotaYears < 5">
          <dt>{{ quota }} GB lasts</dt>
          <dd class="mono">{{ years() }}</dd>
        </div>
      }
    </dl>
    @if (!answered()) {
      <p class="muted hidden-note">The split, the savings and the disk show once you answer the prediction below.</p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
    <p class="muted note">
      Assumed for every message: {{ model.metadataKb }} KB of metadata and {{ model.bodyKb }} KB of headers and body, which compress
      {{ model.bodyCompression }} to 1. Attachments are stored decoded from base64 and not compressed again; repeated ones are stored once.
      An erasure code with 6 data and 3 parity pieces stores 1.5 times the bytes.
    </p>

    <app-widget-check [check]="shownCheck()" [chosen]="chosen()" (chosenChange)="answer($event)" />
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .split {
      display: flex;
      gap: 2px;
      height: 28px;
      margin: 4px 0 8px;
      padding: 2px;
      border-radius: var(--g-radius-sm);
      background: var(--g-sunken);
    }
    .part {
      min-width: 2px;
      border-radius: 2px;
    }
    .metadata {
      background: var(--g-text);
    }
    .bodies {
      border: 1.5px solid var(--g-accent);
      background: repeating-linear-gradient(-45deg, var(--g-accent) 0 2px, transparent 2px 6px);
    }
    .attachments {
      border: 1.5px solid var(--g-accent);
      background: radial-gradient(circle, var(--g-accent) 1.6px, transparent 2px) 0 0 / 6px 6px;
    }
    .legend-list {
      list-style: none;
      display: grid;
      gap: 4px;
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
      height: 12px;
      border-radius: 2px;
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(min(128px, 100%), 1fr));
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
export class MailStorageWidgetComponent {
  readonly sliders = SLIDERS;
  readonly replications = REPLICATIONS;
  readonly copies = COPIES;
  readonly partText = PART_TEXT;
  readonly marks = MARKS;
  readonly limits = STORAGE_LIMITS;
  readonly model = MAIL_STORAGE;
  readonly quota = MAIL_STORAGE.quotaGb;
  readonly bytes = storageText;
  readonly settings = signal<MailStorageSettings>({
    usersM: 500,
    perDay: 40,
    attachmentPct: 10,
    attachmentKb: 500,
    dedupPct: 30,
    replication: 3,
  });
  readonly run = computed(() => mailStorage(this.settings()));
  readonly check = computed(() => mailStorageCheckpoint(this.settings(), this.run()));
  /** A new durability scheme asks again; the sliders only move the readouts under an answered question. */
  private readonly asked = computed(() => String(this.settings().replication));
  private readonly answers = signal<{ asked: string; chosen: number; check: WidgetCheckpoint } | null>(null);
  private readonly current = computed(() => {
    const a = this.answers();
    return a?.asked === this.asked() ? a : null;
  });
  readonly chosen = computed(() => this.current()?.chosen ?? null);
  readonly answered = computed(() => this.chosen() !== null);
  readonly shownCheck = computed(() => this.current()?.check ?? this.check());
  readonly messages = computed(() => {
    const m = this.run().messages;
    return m >= 1e12 ? `${Number((m / 1e12).toFixed(2))} trillion` : `${num(m / 1e9)} billion`;
  });
  readonly shares = computed(() => {
    const { stored, storedBytes } = this.run();
    return Object.fromEntries(MAIL_PARTS.map((p) => [p, (stored[p] / storedBytes) * 100])) as Record<MailPart, number>;
  });
  /** Parts holding bytes: a part with none would still draw a sliver at its minimum width. */
  readonly shownParts = computed(() => MAIL_PARTS.filter((p) => this.run().stored[p] > 0));
  readonly years = computed(() => {
    const y = this.run().quotaYears;
    return y < 1 ? `${num(y * 12)} months` : `${y < 10 ? Number(y.toFixed(1)) : num(y)} years`;
  });
  readonly splitLabel = computed(
    () =>
      `Stored a year, one copy: ${this.shownParts()
        .map((p) => `${PART_TEXT[p].toLowerCase()} ${this.percent(this.shares()[p])}`)
        .join(', ')}`,
  );
  readonly announcement = settledAnnouncement(() => this.summary());

  percent(v: number) {
    return `${v < 1 ? Number(v.toFixed(1)) : Math.round(v)}%`;
  }

  private summary(): string {
    const s = this.settings();
    const head = `${num(s.usersM)} million mailboxes, ${s.perDay} messages a day, ${s.attachmentPct}% with ${num(s.attachmentKb)} KB of attachments, ${s.dedupPct}% already stored, ${COPIES[s.replication].toLowerCase()}.`;
    if (!this.answered()) return `${head} Answer the prediction to see the storage.`;
    const run = this.run();
    return `${head} Stored ${storageText(run.storedBytes)} a year, ${storageText(run.diskBytes)} on disk.`;
  }

  set(change: Partial<MailStorageSettings>) {
    const s = this.settings();
    if ((Object.keys(change) as (keyof MailStorageSettings)[]).every((k) => change[k] === s[k])) return;
    this.settings.set({ ...s, ...change });
  }

  slide(key: Slider, value: number) {
    this.set({ [key]: value });
  }

  answer(chosen: number | null) {
    if (chosen !== null) this.answers.set({ asked: this.asked(), chosen, check: this.check() });
  }
}
