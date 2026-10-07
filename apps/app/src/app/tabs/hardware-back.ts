import { isOnHiddenPage } from '../core/page-keys';

export interface HardwareBack {
  /** The URL shown now. */
  url: string;
  goToday(): void;
  /** Leaves the app, as Android's back button does on the first screen. */
  leave(): void;
}

/**
 * Android's back button (REDESIGN.md 2.5): on a page it does what the page's back button does, so it clicks that; on a hub
 * it goes to Today, and on Today it leaves the app.
 */
export function hardwareBack(doc: Document, { url, goToday, leave }: HardwareBack): void {
  const back = [...doc.querySelectorAll<HTMLElement>('ion-router-outlet app-back ion-back-button')].find((b) => !isOnHiddenPage(b));
  if (back) back.click();
  else if (url.split(/[?#]/)[0] !== '/today') goToday();
  else leave();
}
