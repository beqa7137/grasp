import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

export interface RuntimeConfig {
  /** Absolute API base URL; null means the platform default. */
  apiUrl: string | null;
  sentryDsn: string | null;
  environment: string;
  release: string | null;
  /** Where the Python runtime is downloaded from; null means `pyodide/` next to the app. */
  pyodideUrl: string | null;
}

const DEFAULTS: RuntimeConfig = { apiUrl: null, sentryDsn: null, environment: 'development', release: null, pyodideUrl: null };
const LOAD_TIMEOUT_MS = 3_000;

/**
 * Settings that differ per deployment, read from `config.json` at startup so one build serves every
 * environment. The API generates it for the hosted web app; native builds get it written at `cap:sync`.
 */
@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly current = signal(DEFAULTS);
  readonly config = this.current.asReadonly();

  async load(): Promise<void> {
    try {
      const res = await fetch('config.json', { cache: 'no-store', signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
      if (res.ok) this.current.set({ ...DEFAULTS, ...((await res.json()) as Partial<RuntimeConfig>) });
    } catch {
      // Offline or no config file: the defaults keep local development working.
    }
  }

  pyodideUrl(): string {
    const configured = this.current().pyodideUrl;
    return configured ? configured.replace(/\/?$/, '/') : new URL('pyodide/', document.baseURI).href;
  }

  apiBase(): string {
    const configured = this.current().apiUrl;
    if (configured) return configured.replace(/\/$/, '');
    if (!Capacitor.isNativePlatform()) return '/api';
    return Capacitor.getPlatform() === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api';
  }
}
