import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { SIGN_IN_CALLBACK_PATH, answersPendingSignIn } from './app/core/sign-in-callback';
import { clearPopupMarkers } from './app/core/social-login-storage';

const CALLBACK_FALLBACK_MS = 2_000;

if (location.pathname !== SIGN_IN_CALLBACK_PATH) {
  clearPopupMarkers();
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
} else if (answersPendingSignIn(new URL(location.href))) {
  // The sign-in popup lands here. Importing the plugin finishes the flow, relays the result to the app
  // that opened the popup and closes it. Starting the app here would also refresh the session a second time.
  void import('@capgo/capacitor-social-login');
  setTimeout(() => {
    if (!window.opener) location.replace('/settings');
  }, CALLBACK_FALLBACK_MS);
} else if (window.opener) {
  // A refused callback inside the popup: close it rather than start the app there. The opener sees a cancel.
  window.close();
} else {
  location.replace('/settings');
}
