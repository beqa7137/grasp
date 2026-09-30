import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';
import { COMPETENCY_CATALOG, STORY_LIMITS, storyTitle, type StarPart, type Story } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';
import { StarEditorComponent } from './star-editor.component';
import { STORY_SYNC_NOTES, StoryBankService, type StoryPatch } from './story-bank.service';

@Component({
  selector: 'app-story',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonIcon, StarEditorComponent],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/behavioral/stories" text="" /></ion-buttons>
        <ion-title>{{ heading() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      @if (story()?.deleted) {
        <div class="page narrow">
          <p class="eyebrow">Story bank</p>
          <h1>Story deleted</h1>
          <p>This story was deleted.</p>
        </div>
      } @else if (story(); as s) {
        <div class="page narrow">
          <p class="eyebrow">Story bank</p>
          <h1 class="visually-hidden">{{ heading() }}</h1>
          <label class="field title">
            <span class="label">Title</span>
            <input
              type="text"
              [value]="s.title"
              (input)="update({ title: $any($event.target).value })"
              placeholder="A name you will recognize, like 'The checkout timeouts'"
              [maxLength]="titleLength"
            />
          </label>

          <fieldset class="tags">
            <legend>Competencies it answers <span class="muted">(pick up to three)</span></legend>
            <div class="g-chip-radios">
              @for (c of competencies; track c.id) {
                <button type="button" [attr.aria-pressed]="s.competencyIds.includes(c.id)" (click)="toggle(c.id)">{{ c.name }}</button>
              }
            </div>
          </fieldset>

          <app-star-editor [draft]="s.draft" [saved]="saved()" (edit)="edit($event.part, $event.text)" />

          <button type="button" class="g-btn ghost delete" (click)="remove()">
            <ion-icon name="trash-outline" aria-hidden="true" />Delete story
          </button>
        </div>
      }
    </ion-content>
  `,
  styles: `
    .field {
      display: grid;
      gap: 6px;
      margin: 4px 0 18px;
    }
    .label,
    legend {
      font-weight: 600;
      font-size: 0.9375rem;
    }
    legend {
      padding: 0;
      margin-bottom: 8px;
      .muted {
        font-weight: 400;
        font-size: 0.8125rem;
      }
    }
    input {
      width: 100%;
      background: var(--g-surface);
      color: var(--g-text);
      border: 1px solid var(--g-stroke);
      border-radius: var(--g-radius-sm);
      padding: 12px;
      font: 1rem/1.4 var(--ion-font-family);
    }
    .tags {
      border: 0;
      padding: 0;
      margin: 0 0 20px;
      button {
        font: 500 0.8125rem var(--ion-font-family);
      }
      button[aria-pressed='true'] {
        background: var(--g-accent);
        border-color: var(--g-accent);
        color: var(--g-on-fill);
      }
    }
    .delete {
      margin-top: 20px;
    }
  `,
})
export class StoryPage {
  readonly id = input.required<string>();
  private readonly bank = inject(StoryBankService);
  private readonly nav = inject(NavController);
  readonly competencies = COMPETENCY_CATALOG;
  readonly titleLength = STORY_LIMITS.title;
  readonly saved = computed(() => {
    const refusal = this.bank.refusals().find((r) => r.story.id === this.id());
    return refusal ? `Saved on this device only: the account refused it, as ${refusal.reason}.` : STORY_SYNC_NOTES[this.bank.sync()];
  });
  readonly story = signal<Story | null>(null);
  /** When the stored story the page shows last changed, so it follows other changes but not its own saves. */
  private shownAt: string | null = null;
  private saving = 0;
  readonly heading = computed(() => {
    const story = this.story();
    return story?.title.trim() ? storyTitle(story) : 'New story';
  });

  constructor() {
    addIcons({ trashOutline });
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.story.set(null);
        void this.bank.load(id).then(() => {
          if (this.id() === id) this.show(this.bank.find(id) ?? this.bank.blank(id));
        });
      });
    });
    effect(() => {
      this.bank.pulled();
      untracked(() => this.follow());
    });
  }

  ionViewWillLeave() {
    void this.bank.removeIfBlank(this.id());
  }

  update(patch: StoryPatch) {
    const story = this.story();
    if (!story || story.deleted) return;
    this.story.set({ ...story, ...patch, draft: { ...story.draft, ...patch.draft } });
    this.saving++;
    void this.bank.save(story.id, patch).finally(() => {
      if (--this.saving === 0) this.follow();
    });
  }

  toggle(competencyId: string) {
    const tags = this.story()?.competencyIds ?? [];
    this.update({ competencyIds: tags.includes(competencyId) ? tags.filter((t) => t !== competencyId) : [...tags, competencyId] });
  }

  edit(part: StarPart, text: string) {
    this.update({ draft: { [part]: text } });
  }

  /** Shows the stored story once it changed from what the page last showed, and no save of the page's is pending. */
  private follow() {
    const stored = this.story() && !this.saving ? this.bank.find(this.id()) : undefined;
    if (stored && stored.updatedAt !== this.shownAt) this.show(stored);
  }

  private show(story: Story) {
    this.shownAt = story.updatedAt;
    this.story.set(story);
  }

  async remove() {
    await this.bank.remove(this.id());
    void this.nav.navigateBack('/behavioral/stories', { replaceUrl: true });
  }
}
