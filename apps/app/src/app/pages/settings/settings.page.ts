import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AlertController, IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { ApiError, ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LearnerService } from '../../core/learner.service';
import { ProgressService } from '../../core/progress.service';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { RuntimeConfigService } from '../../core/runtime-config.service';
import { ShortcutsService } from '../../core/shortcuts.service';
import { type ThemePreference, ThemeService } from '../../core/theme.service';
import { PilotService } from '../../pilot/pilot.service';
import { AccountSettingsComponent } from './account-settings.component';
import { type Choice, StudySettingsComponent } from './study-settings.component';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    AccountSettingsComponent,
    StudySettingsComponent,
    RovingSelectDirective,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/learn" text="" /></ion-buttons>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <h1 class="visually-hidden">Settings</h1>
        <app-account-settings />

        <app-study-settings />

        <section class="panel block">
          <h2>Appearance</h2>
          <div class="row" role="radiogroup" aria-labelledby="theme-label" aria-describedby="theme-hint">
            <strong id="theme-label">Theme</strong>
            <p class="muted small" id="theme-hint">System follows your device's light or dark mode. On this device only.</p>
            <div class="g-chip-radios">
              @for (t of themes; track t.value) {
                <button role="radio" [attr.aria-checked]="theme.preference() === t.value" (click)="theme.setPreference(t.value)">
                  {{ t.label }}
                </button>
              }
            </div>
          </div>
        </section>

        <section class="panel block">
          <h2>Keyboard</h2>
          <div class="row g-control-row">
            <div>
              <strong>Single-key shortcuts</strong>
              <p class="muted small" id="character-keys-hint">
                Keys such as 1–4 to answer and G or E to grade. Turn them off if you use speech input. On this device only.
              </p>
            </div>
            <label class="g-switch">
              <input
                type="checkbox"
                aria-label="Single-key shortcuts"
                aria-describedby="character-keys-hint"
                [checked]="shortcuts.characterKeys()"
                (change)="shortcuts.setCharacterKeys($any($event.target).checked)"
              />
              <span class="track"><span class="knob"></span></span>
            </label>
          </div>
        </section>

        <section class="panel block">
          <h2>Your data</h2>
          <p class="muted">
            Grasp stores your learning events, interview sessions and feedback
            {{ auth.signedIn() ? 'in your account' : 'under an anonymous id' }}. Interview transcripts are sent to Anthropic's Claude API to
            run and score interviews.
          </p>
          <div class="row g-control-row">
            <div>
              <strong>Export</strong>
              <p class="muted small">Download everything we store about you as JSON.</p>
            </div>
            <button class="g-btn" [disabled]="busy()" (click)="exportData()">Export</button>
          </div>
          <div class="row g-control-row">
            <div>
              <strong>Delete</strong>
              <p class="muted small">
                Erase your data{{ auth.signedIn() ? ' and your account' : '' }} on our server and on this device, and start fresh.
              </p>
            </div>
            <button class="g-btn danger" [disabled]="busy()" (click)="confirmDelete()">Delete…</button>
          </div>
        </section>

        <section class="panel block">
          <h2>Pilot</h2>
          <div class="row g-control-row">
            <div>
              <strong>Send feedback</strong>
              <p class="muted small">Bugs, confusing bits and ideas all help.</p>
            </div>
            <button class="g-btn" (click)="pilot.feedbackOpen.set(true)">Feedback</button>
          </div>
          <p class="muted small mono">
            Learner {{ learner.id().slice(0, 8) }} · {{ runtime.config().environment
            }}{{ runtime.config().release ? ' · ' + runtime.config().release : '' }}
          </p>
        </section>
      </div>
    </ion-content>
  `,
  styles: `
    .narrow {
      max-width: 640px;
    }
    .block {
      padding: 18px 18px 8px;
      margin-bottom: 16px;
    }
    h2 {
      font: 600 1.0625rem/1.2 var(--g-font-display);
      margin: 0 0 8px;
    }
    .row {
      padding: 12px 0;
      border-top: 1px solid var(--g-line);
    }
    .row p {
      margin: 2px 0 0;
    }
    .g-chip-radios {
      margin-top: 10px;
    }
    .small {
      font-size: 0.8125rem;
    }
    .g-btn.danger {
      color: var(--g-danger);
      border-color: rgba(var(--g-danger-rgb), 0.45);
    }
  `,
})
export class SettingsPage {
  private readonly api = inject(ApiService);
  private readonly progress = inject(ProgressService);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  readonly learner = inject(LearnerService);
  readonly runtime = inject(RuntimeConfigService);
  readonly pilot = inject(PilotService);
  readonly auth = inject(AuthService);
  readonly shortcuts = inject(ShortcutsService);
  readonly theme = inject(ThemeService);
  readonly themes: Choice<ThemePreference>[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  readonly busy = signal(false);

  async exportData() {
    await this.run(async () => {
      const data = await this.api.get<unknown>('/me/export');
      const file = new File([JSON.stringify(data, null, 2)], 'grasp-data.json', { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Grasp data export' });
        return;
      }
      const url = URL.createObjectURL(file);
      const link = Object.assign(document.createElement('a'), { href: url, download: file.name });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }, 'Could not export your data.');
  }

  async confirmDelete() {
    const alert = await this.alerts.create({
      header: 'Delete all your data?',
      message: `Your progress, interviews and feedback${this.auth.signedIn() ? ', and your account,' : ''} will be erased from our server and this device. This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => void this.deleteData() },
      ],
    });
    await alert.present();
  }

  private async deleteData() {
    await this.run(async () => {
      await this.api.delete('/me');
      await this.auth.forget();
      await this.progress.clearLocal();
      await this.learner.reset();
      await this.toast('Your data was deleted. You are starting fresh.');
    }, 'Could not delete your data. Nothing was removed; please try again.');
  }

  private async run(action: () => Promise<void>, failure: string) {
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        await this.toast(e instanceof ApiError ? `${failure} (${e.message})` : failure);
    } finally {
      this.busy.set(false);
    }
  }

  private async toast(message: string) {
    const toast = await this.toasts.create({ message, duration: 3500, position: 'bottom' });
    await toast.present();
  }
}
