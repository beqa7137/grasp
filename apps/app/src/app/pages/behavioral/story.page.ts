import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, NavController } from '@ionic/angular';
import { COMPETENCY_CATALOG, storyTitle, type StarPart, type Story } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';
import { StarEditorComponent } from './star-editor.component';
import { StoryBankService } from './story-bank.service';

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
      @if (story(); as s) {
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
              maxlength="80"
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

          <app-star-editor [draft]="s.draft" (edit)="edit($event.part, $event.text)" />

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
  readonly story = signal<Story | null>(null);
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
        void this.bank.load().then(() => {
          if (this.id() === id) this.story.set(this.bank.get(id) ?? this.bank.blank(id));
        });
      });
    });
  }

  update(change: Partial<Story>) {
    const story = this.story();
    if (!story) return;
    const next = { ...story, ...change };
    this.story.set(next);
    void this.bank.save(next);
  }

  toggle(competencyId: string) {
    const tags = this.story()?.competencyIds ?? [];
    this.update({ competencyIds: tags.includes(competencyId) ? tags.filter((t) => t !== competencyId) : [...tags, competencyId] });
  }

  edit(part: StarPart, text: string) {
    const story = this.story();
    if (story) this.update({ draft: { ...story.draft, [part]: text } });
  }

  async remove() {
    await this.bank.remove(this.id());
    void this.nav.navigateBack('/behavioral/stories', { replaceUrl: true });
  }
}
