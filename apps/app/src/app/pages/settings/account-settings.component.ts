import { ChangeDetectionStrategy, Component, ErrorHandler, computed, inject, signal } from '@angular/core';
import { AlertController, IonIcon, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logoGithub, logoGoogle } from 'ionicons/icons';
import { ApiError } from '../../core/api.service';
import { AuthService, SIGN_IN_PROVIDERS, type SignInProvider } from '../../core/auth.service';

const LABELS: Record<SignInProvider, string> = { google: 'Google', github: 'GitHub' };
const ICONS: Record<SignInProvider, string> = { google: 'logo-google', github: 'logo-github' };
const GENERIC_ERROR = "Sign-in didn't complete. Please try again.";
/** Errors whose wording the API owns and the person can act on. */
const EXPLAINED_ERRORS = new Set(['account_exists', 'email_unverified', 'identity_in_use', 'rate_limited']);

@Component({
  selector: 'app-account-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  template: `
    <section class="panel block">
      <h2>Account</h2>
      @if (auth.user(); as user) {
        <div class="row">
          <div>
            <strong>{{ user.email }}</strong>
            <p class="muted small">Progress syncs across every device where you sign in.</p>
          </div>
          <button class="g-btn" [disabled]="busy()" (click)="confirmSignOut()">Sign out</button>
        </div>
        @if (methods().length) {
          <h3 id="sign-in-methods">Sign-in methods</h3>
          <ul class="methods" aria-labelledby="sign-in-methods">
            @for (method of methods(); track method.provider) {
              <li class="row">
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
        @if (auth.providers(); as providers) {
          @if (providers.length) {
            <p class="muted intro">Optional. Sign in to sync your progress across devices and keep it if you lose this one.</p>
            <div class="sign-in">
              @for (provider of providers; track provider) {
                <button class="g-btn" [disabled]="busy()" (click)="signIn(provider)">
                  <ion-icon [name]="icons[provider]" aria-hidden="true" />
                  Continue with {{ labels[provider] }}
                </button>
              }
            </div>
          } @else {
            <p class="muted intro">Sign-in isn't available on this server yet.</p>
          }
        } @else if (auth.providersFailed()) {
          <div class="load-failed">
            <p class="muted">Couldn't load sign-in options.</p>
            <button class="g-btn" (click)="auth.loadProviders()">Try again</button>
          </div>
        }
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </section>
  `,
  styles: `
    .block {
      padding: 18px 18px 8px;
      margin-bottom: 16px;
    }
    h2 {
      font: 600 1.0625rem/1.2 var(--g-font-display);
      margin: 0 0 8px;
    }
    h3 {
      font: 600 0.875rem/1.2 var(--g-font-display);
      color: var(--g-muted);
      margin: 12px 0 8px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 0;
      border-top: 1px solid var(--g-line);
    }
    .row p {
      margin: 2px 0 0;
    }
    .row .g-btn {
      flex: none;
    }
    .small {
      font-size: 0.8125rem;
    }
    .intro {
      margin: 0 0 12px;
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
      gap: 12px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .method ion-icon {
      flex: none;
      font-size: 20px;
    }
    .load-failed {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
    }
    .load-failed p {
      margin: 0;
    }
    .load-failed .g-btn {
      flex: none;
    }
    .sign-in {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .sign-in .g-btn {
      flex: 1 1 220px;
      padding: 12px 14px;
    }
    .notice {
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(var(--g-warn-rgb), 0.12);
      color: var(--g-warn);
      font-size: 0.875rem;
    }
    .error {
      color: var(--g-danger);
      font-size: 0.875rem;
      line-height: 1.45;
      margin: 0 0 12px;
    }
  `,
})
export class AccountSettingsComponent {
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  private readonly errors = inject(ErrorHandler);
  readonly auth = inject(AuthService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly labels = LABELS;
  readonly icons = ICONS;

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
    void this.auth.loadProviders();
    void this.auth.loadIdentities();
  }

  signIn(provider: SignInProvider) {
    return this.attempt(() => this.auth.signIn(provider), 'Signed in. Your progress is now synced to your account.');
  }

  connect(provider: SignInProvider) {
    return this.attempt(() => this.auth.connect(provider), `You can now sign in with ${LABELS[provider]} too.`);
  }

  async confirmSignOut() {
    const alert = await this.alerts.create({
      header: 'Sign out?',
      message: 'Your progress stays in your account. This device starts fresh until you sign in again.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Sign out', role: 'destructive', handler: () => void this.signOut() },
      ],
    });
    await alert.present();
  }

  private async signOut() {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.signOut();
    } catch {
      await this.toast('Could not finish signing out. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  private async attempt(action: () => Promise<boolean>, success: string) {
    this.error.set(null);
    this.busy.set(true);
    try {
      if (await action()) await this.toast(success);
    } catch (e) {
      this.error.set(errorMessage(e));
      // API errors are reported by the server; plugin failures (such as a misconfigured client) are only visible here.
      if (!(e instanceof ApiError)) this.errors.handleError(e);
    } finally {
      this.busy.set(false);
    }
  }

  private async toast(message: string) {
    const toast = await this.toasts.create({ message, duration: 3500, position: 'bottom' });
    await toast.present();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError && error.code !== undefined && EXPLAINED_ERRORS.has(error.code) ? error.message : GENERIC_ERROR;
}
