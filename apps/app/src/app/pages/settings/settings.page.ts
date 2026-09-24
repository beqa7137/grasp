import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { ApiError, ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LearnerService } from '../../core/learner.service';
import { ProgressService } from '../../core/progress.service';
import { RuntimeConfigService } from '../../core/runtime-config.service';
import { PilotService } from '../../pilot/pilot.service';
import { StudySettingsComponent } from './study-settings.component';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, StudySettingsComponent],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/learn" text="" /></ion-buttons>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <div class="page narrow">
        <section class="panel block account">
          <h2>Account</h2>
          @if (auth.user(); as user) {
            <div class="row">
              <div>
                <strong>{{ user.email }}</strong>
                <p class="muted small">Progress syncs across every device where you sign in.</p>
              </div>
              <button class="g-btn" [disabled]="busy()" (click)="confirmSignOut()">Sign out</button>
            </div>
          } @else {
            @if (auth.signInRequired()) {
              <p class="notice">Your session ended. Sign in again to keep syncing this device's progress.</p>
            }
            @if (auth.emailAvailable() === false) {
              <p class="muted">Sign-in isn't available on this server yet.</p>
            } @else if (step() === 'email') {
              <p class="muted">
                Optional. Sign in to sync across devices and keep your progress if you lose this one. What you have learned so far comes
                with you.
              </p>
              <form class="signin" (ngSubmit)="sendCode()">
                <input
                  type="email"
                  name="email"
                  autocomplete="email"
                  inputmode="email"
                  placeholder="you@example.com"
                  aria-label="Email address"
                  [ngModel]="email()"
                  (ngModelChange)="email.set($event)"
                  required
                />
                <button class="g-btn primary" type="submit" [disabled]="busy() || !validEmail()">Email me a code</button>
              </form>
            } @else {
              <p class="muted">
                We sent a 6-digit code to <strong>{{ email() }}</strong
                >. It expires in 10 minutes.
              </p>
              <form class="signin" (ngSubmit)="verify()">
                <input
                  class="code mono"
                  name="code"
                  autocomplete="one-time-code"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="123456"
                  aria-label="Sign-in code"
                  [ngModel]="code()"
                  (ngModelChange)="code.set($event.replace(/D/g, ''))"
                />
                <button class="g-btn primary" type="submit" [disabled]="busy() || code().length !== 6">Sign in</button>
              </form>
              <p class="small links">
                <button class="link" type="button" (click)="sendCode()" [disabled]="busy()">Send a new code</button> ·
                <button class="link" type="button" (click)="step.set('email')">Use a different email</button>
              </p>
            }
            @if (authError(); as e) {
              <p class="error" role="alert">{{ e }}</p>
            }
          }
        </section>

        <app-study-settings />

        <section class="panel block">
          <h2>Your data</h2>
          <p class="muted">
            Grasp stores your learning events, interview sessions and feedback
            {{ auth.signedIn() ? 'in your account' : 'under an anonymous id' }}. Interview transcripts are sent to Anthropic's Claude API to
            run and score interviews.
          </p>
          <div class="row">
            <div>
              <strong>Export</strong>
              <p class="muted small">Download everything we store about you as JSON.</p>
            </div>
            <button class="g-btn" [disabled]="busy()" (click)="exportData()">Export</button>
          </div>
          <div class="row">
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
          <div class="row">
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
      font: 600 17px/1.2 var(--g-font-display);
      margin: 0 0 8px;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 0;
      border-top: 1px solid var(--g-line);
    }
    .row p {
      margin: 2px 0 0;
    }
    .small {
      font-size: 13px;
    }
    .account .muted {
      margin: 0 0 12px;
      line-height: 1.5;
    }
    .signin {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .signin input {
      flex: 1;
      min-width: 200px;
      background: var(--g-raised);
      color: var(--g-text);
      border: 1px solid var(--g-line-strong);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 15px;
    }
    .signin input:focus {
      outline: 2px solid var(--g-accent);
      outline-offset: 1px;
    }
    .signin .code {
      letter-spacing: 0.4em;
      max-width: 180px;
      min-width: 0;
    }
    .links {
      margin: 0 0 10px;
      color: var(--g-muted);
    }
    .link {
      appearance: none;
      border: none;
      background: none;
      color: var(--g-accent);
      padding: 0;
      font: inherit;
      cursor: pointer;
    }
    .notice {
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(255, 181, 71, 0.12);
      color: var(--g-warn);
      font-size: 14px;
    }
    .error {
      color: var(--g-danger);
      font-size: 14px;
    }
    .g-btn.danger {
      color: var(--g-danger);
      border-color: color-mix(in srgb, var(--g-danger) 45%, transparent);
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
  readonly busy = signal(false);

  readonly step = signal<'email' | 'code'>('email');
  readonly email = signal('');
  readonly code = signal('');
  readonly authError = signal<string | null>(null);
  readonly validEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim()));

  constructor() {
    void this.auth.loadAvailability();
  }

  async sendCode() {
    if (!this.validEmail()) return;
    await this.authStep(async () => {
      await this.auth.startEmail(this.email().trim());
      this.code.set('');
      this.step.set('code');
    });
  }

  async verify() {
    await this.authStep(async () => {
      await this.auth.verifyEmail(this.email().trim(), this.code());
      this.step.set('email');
      this.code.set('');
      await this.toast('Signed in. Your progress is now synced to your account.');
    });
  }

  async confirmSignOut() {
    const alert = await this.alerts.create({
      header: 'Sign out?',
      message: 'Your progress stays in your account. This device starts fresh until you sign in again.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Sign out', role: 'destructive', handler: () => void this.run(() => this.auth.signOut(), 'Could not sign out.') },
      ],
    });
    await alert.present();
  }

  private async authStep(action: () => Promise<void>) {
    this.authError.set(null);
    this.busy.set(true);
    try {
      await action();
    } catch (e) {
      this.authError.set(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

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
