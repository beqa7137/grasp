import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AlertController, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { ApiError, ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LearnerService } from '../../core/learner.service';
import { MotionPreferenceService } from '../../core/motion-preference.service';
import { type MotionPreference } from '../../core/motion';
import { RuntimeConfigService } from '../../core/runtime-config.service';
import { ShortcutsService } from '../../core/shortcuts.service';
import { type ThemePreference, ThemeService } from '../../core/theme.service';
import { AI_DISCLOSURE } from '../../core/ai-disclosure';
import { PilotService } from '../../pilot/pilot.service';
import { AccountSettingsComponent } from './account-settings.component';
import { LoopSettingsComponent } from './loop-settings.component';
import { StudySettingsComponent } from './study-settings.component';
import { BackComponent } from '../../ui/back.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { SectionComponent } from '../../ui/section.component';
import { SegmentedComponent, type SegmentOption } from '../../ui/segmented.component';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    AccountSettingsComponent,
    LoopSettingsComponent,
    StudySettingsComponent,
    PageHeaderComponent,
    SectionComponent,
    SegmentedComponent,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back href="/today" /></ion-buttons>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <g-page-header heading="Settings" />

        <app-loop-settings />

        <app-study-settings />

        <g-section heading="Appearance">
          <div class="g-setting">
            <strong id="theme-label">Theme</strong>
            <p class="muted small" id="theme-hint">System follows your device's light or dark mode. On this device only.</p>
            <g-segmented
              [options]="themes"
              [value]="theme.preference()"
              (valueChange)="theme.setPreference($event!)"
              labelledby="theme-label"
              describedby="theme-hint"
            />
          </div>
          <div class="g-setting">
            <strong id="motion-label">Motion</strong>
            <p class="muted small" id="motion-hint">
              System follows your device's reduce motion setting. Page transitions follow this after the app restarts. On this device only.
            </p>
            <g-segmented
              [options]="motions"
              [value]="motion.preference()"
              (valueChange)="motion.setPreference($event!)"
              labelledby="motion-label"
              describedby="motion-hint"
            />
          </div>
        </g-section>

        <g-section heading="Keyboard">
          <div class="g-setting g-control-row">
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
        </g-section>

        <app-account-settings />

        <g-section heading="Pilot">
          <div class="g-setting g-control-row">
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
        </g-section>

        <g-section heading="Your data">
          <p class="muted">
            Grasp stores your learning events, interview sessions and feedback
            {{
              auth.signedIn()
                ? 'in your account, and syncs your behavioral stories there too'
                : 'under an anonymous id; your behavioral stories stay on this device until you sign in'
            }}. {{ aiDisclosure }}
          </p>
          <div class="g-setting g-control-row">
            <div>
              <strong>Export</strong>
              <p class="muted small">Download everything we store about you as JSON{{ auth.signedIn() ? ', stories included' : '' }}.</p>
            </div>
            <button class="g-btn" [disabled]="busy()" (click)="exportData()">Export</button>
          </div>
          <div class="g-setting g-control-row">
            <div>
              <strong>Delete</strong>
              <p class="muted small">
                Erase your data{{ auth.signedIn() ? ' and your account' : '' }} on our server and on this device, and start fresh.
              </p>
            </div>
            <button class="g-btn danger" [disabled]="busy()" (click)="confirmDelete()">Delete…</button>
          </div>
        </g-section>
      </div>
    </ion-content>
  `,
  styles: `
    g-segmented {
      margin-top: var(--g-space-3);
    }
    .g-btn.danger {
      color: var(--g-danger-ink);
      border-color: var(--g-danger-line);
    }
  `,
})
export class SettingsPage {
  readonly aiDisclosure = AI_DISCLOSURE;
  private readonly api = inject(ApiService);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  readonly learner = inject(LearnerService);
  readonly runtime = inject(RuntimeConfigService);
  readonly pilot = inject(PilotService);
  readonly auth = inject(AuthService);
  readonly shortcuts = inject(ShortcutsService);
  readonly theme = inject(ThemeService);
  readonly themes: SegmentOption<ThemePreference>[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
  readonly motion = inject(MotionPreferenceService);
  readonly motions: SegmentOption<MotionPreference>[] = [
    { value: 'system', label: 'System' },
    { value: 'reduced', label: 'Reduced' },
    { value: 'full', label: 'Full' },
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
      message: `Your progress, interviews, feedback and stories${this.auth.signedIn() ? ', and your account,' : ''} will be erased from our server and this device. This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive', handler: () => void this.deleteData() },
      ],
    });
    await alert.present();
  }

  private async deleteData() {
    let erasedOnServer = false;
    await this.run(
      async () => {
        await this.api.delete('/me');
        erasedOnServer = true;
        await this.auth.startFreshAfterDeletion();
        await this.toast('Your data was deleted. You are starting fresh.');
      },
      () =>
        erasedOnServer
          ? 'Your server data was deleted, but this device could not finish clearing it. Try Delete again.'
          : 'Could not delete your data. Nothing was removed; please try again.',
    );
  }

  private async run(action: () => Promise<void>, failure: string | (() => string)) {
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        const message = typeof failure === 'string' ? failure : failure();
        await this.toast(e instanceof ApiError ? `${message} (${e.message})` : message);
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async toast(message: string) {
    const toast = await this.toasts.create({ message, duration: 3500, position: 'bottom' });
    await toast.present();
  }
}
