import { ChangeDetectionStrategy, Component, ErrorHandler, computed, inject, signal } from '@angular/core';
import { AlertController, IonIcon, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logoGithub, logoGoogle } from 'ionicons/icons';
import { ApiError } from '../../core/api.service';
import { AuthService, SIGN_IN_PROVIDERS, UnsyncedStories, type SignInProvider } from '../../core/auth.service';
import { SIGN_IN_ICONS, SIGN_IN_LABELS, SignInOptionsComponent, signInErrorMessage } from '../../core/sign-in-options.component';
import { SectionComponent } from '../../ui/section.component';

function unsyncedWarning(count: number, checked: boolean): string {
  const stories = count === 1 ? '1 story' : `${count} stories`;
  const them = count === 1 ? 'it' : 'them';
  return checked
    ? `${stories} ${count === 1 ? 'has' : 'have'} not reached your account. Signing out removes ${them} from this device.`
    : `${stories} on this device could not be checked against your account. Signing out removes ${them} from this device.`;
}

@Component({
  selector: 'app-account-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon, SignInOptionsComponent, SectionComponent],
  template: `
    <g-section heading="Account">
      @if (account(); as user) {
        <div class="g-setting g-control-row">
          <div>
            <strong class="action"
              >Signed in as <span class="email">{{ user.email }}</span></strong
            >
            <p class="muted small">Progress and behavioral stories sync across every device where you sign in.</p>
          </div>
          <button class="g-btn" [disabled]="busy()" (click)="confirmSignOut()">Sign out</button>
        </div>
        @if (methods().length) {
          <h3 id="sign-in-methods">Sign-in methods</h3>
          <ul class="methods" aria-labelledby="sign-in-methods">
            @for (method of methods(); track method.provider) {
              <li class="g-setting g-control-row">
                <div class="method">
                  <ion-icon [name]="icons[method.provider]" aria-hidden="true" />
                  <div>
                    <strong>{{ labels[method.provider] }}</strong>
                    @if (method.identity; as identity) {
                      <p class="muted small">Connected{{ identity.email ? ' · ' + identity.email : '' }}</p>
                    }
                  </div>
                </div>
                @if (!method.identity) {
                  <button
                    class="g-btn"
                    [attr.aria-label]="'Connect ' + labels[method.provider]"
                    [disabled]="busy()"
                    (click)="connect(method.provider)"
                  >
                    Connect
                  </button>
                }
              </li>
            }
          </ul>
        }
      } @else {
        @if (auth.signInRequired()) {
          <p class="notice">Your session ended. Sign in again to keep syncing this device's progress.</p>
        }
        <div class="g-setting intro">
          @if (auth.providers()?.length) {
            <strong>Sign in to sync stories across devices</strong>
          }
          <p class="muted">Study and scripted mock rounds work without an account. Sign in to sync progress and use the AI interviewer.</p>
        </div>
        <app-sign-in-options [disabled]="busy()" (busyChange)="signingIn.set($event)" (signedIn)="confirmSignedIn()" />
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </g-section>
  `,
  styles: `
    h3 {
      font-size: var(--g-text-body);
      line-height: 1.2;
      color: var(--g-muted);
      margin: var(--g-space-3) 0 var(--g-space-2);
    }
    .g-setting .g-btn {
      flex: none;
    }
    .email {
      overflow-wrap: anywhere;
    }
    .intro {
      line-height: 1.5;
    }
    .methods {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .method {
      display: flex;
      align-items: center;
      gap: var(--g-space-3);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .method ion-icon {
      flex: none;
      width: 20px;
      height: 20px;
    }
    .notice {
      padding: var(--g-space-2) var(--g-space-3);
      border-radius: var(--g-radius-sm);
      background: var(--g-warn-soft);
      color: var(--g-warn-ink);
      font-size: var(--g-text-body);
    }
    .error {
      color: var(--g-danger-ink);
      font-size: var(--g-text-body);
      line-height: 1.45;
      margin: 0 0 var(--g-space-3);
    }
  `,
})
export class AccountSettingsComponent {
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  private readonly errors = inject(ErrorHandler);
  readonly auth = inject(AuthService);
  readonly busy = signal(false);
  readonly signingIn = signal(false);
  readonly account = computed(() => (this.signingIn() ? null : this.auth.user()));
  readonly error = signal<string | null>(null);
  readonly labels = SIGN_IN_LABELS;
  readonly icons = SIGN_IN_ICONS;

  /** Linked providers, plus the ones this device could connect. Empty until the account's identities load. */
  readonly methods = computed(() => {
    const identities = this.auth.identities();
    if (!identities) return [];
    const available = this.auth.providers() ?? [];
    return SIGN_IN_PROVIDERS.map((provider) => ({ provider, identity: identities.find((i) => i.provider === provider) ?? null })).filter(
      (method) => method.identity || available.includes(method.provider),
    );
  });

  constructor() {
    addIcons({ logoGoogle, logoGithub });
    if (this.auth.signedIn()) void this.auth.loadProviders();
    void this.auth.loadIdentities();
  }

  confirmSignedIn() {
    return this.toast('Signed in. Your progress is now synced to your account.');
  }

  async connect(provider: SignInProvider) {
    this.error.set(null);
    this.busy.set(true);
    try {
      if (await this.auth.connect(provider)) await this.toast(`You can now sign in with ${SIGN_IN_LABELS[provider]} too.`);
    } catch (e) {
      this.error.set(signInErrorMessage(e));
      // API errors are reported by the server; plugin failures (such as a misconfigured client) are only visible here.
      if (!(e instanceof ApiError)) this.errors.handleError(e);
    } finally {
      this.busy.set(false);
    }
  }

  async confirmSignOut() {
    this.busy.set(true);
    let unsynced;
    try {
      unsynced = await this.auth.unsyncedStories();
    } catch {
      await this.toast('Could not check your stories before signing out. Please try again.');
      return;
    } finally {
      this.busy.set(false);
    }
    const alert = await this.alerts.create({
      header: 'Sign out?',
      message: unsynced.count
        ? unsyncedWarning(unsynced.count, unsynced.checked)
        : 'Your progress stays in your account. This device starts fresh until you sign in again.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Sign out', role: 'destructive', handler: () => void this.signOut(unsynced.count > 0) },
      ],
    });
    await alert.present();
  }

  private async signOut(discardUnsyncedStories: boolean) {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.signOut(discardUnsyncedStories);
    } catch (e) {
      await this.toast(
        e instanceof UnsyncedStories
          ? 'Some stories have not reached your account yet, so nothing was removed. Try signing out again.'
          : 'Could not finish signing out. Please try again.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async toast(message: string) {
    const toast = await this.toasts.create({ message, duration: 3500, position: 'bottom' });
    await toast.present();
  }
}
