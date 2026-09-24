import { Injectable, inject } from '@angular/core';
import { AuthTokens } from './auth-tokens.service';
import { LearnerService } from './learner.service';
import { RuntimeConfigService } from './runtime-config.service';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export interface SseHandlers {
  delta: (text: string) => void;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly learner = inject(LearnerService);
  private readonly runtime = inject(RuntimeConfigService);
  private readonly tokens = inject(AuthTokens);

  get base(): string {
    return this.runtime.apiBase();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  delete(path: string): Promise<void> {
    return this.request<void>('DELETE', path);
  }

  /** POSTs and consumes a text/event-stream response. Resolves with the `done` payload. */
  async stream<T>(path: string, body: unknown, handlers: SseHandlers, signal?: AbortSignal): Promise<T> {
    const send = () => fetch(this.base + path, { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal });
    let res = await send();
    if (res.status === 401 && (await this.renewAfter(res.clone(), path))) res = await send();
    if (!res.ok || !res.body) throw await this.toError(res);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let split: number;
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const event = /^event: (.+)$/m.exec(raw)?.[1];
        const data = JSON.parse(/^data: (.+)$/m.exec(raw)?.[1] ?? 'null');
        if (event === 'delta') handlers.delta(data.text);
        else if (event === 'done') return data as T;
        else if (event === 'error') throw new ApiError(data.status, data.message);
      }
    }
    throw new ApiError(0, 'Stream ended unexpectedly');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const send = async () => {
      try {
        return await fetch(this.base + path, {
          method,
          headers: this.headers(),
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        throw new ApiError(0, 'Cannot reach the Grasp server. Check your connection.');
      }
    };
    let res = await send();
    if (res.status === 401 && (await this.renewAfter(res.clone(), path))) res = await send();
    if (!res.ok) throw await this.toError(res);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /** On an expired session (or progress that needs a session), refreshes once so the caller can retry. */
  private async renewAfter(res: Response, path: string): Promise<boolean> {
    const code = await res
      .json()
      .then((b: { code?: string }) => b.code)
      .catch(() => undefined);
    // The refresh call itself must never wait on a refresh.
    if ((code !== 'token_invalid' && code !== 'sign_in_required') || path === '/auth/refresh' || !this.tokens.refresher) return false;
    const renewed = await this.tokens.refresher();
    if (!renewed && code === 'sign_in_required') this.tokens.signInRequired.set(true);
    return renewed;
  }

  private headers(): Record<string, string> {
    const token = this.tokens.accessToken();
    return {
      'content-type': 'application/json',
      'x-learner-id': this.learner.id(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  private async toError(res: Response): Promise<ApiError> {
    try {
      const body = await res.json();
      return new ApiError(res.status, Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? res.statusText), body.code);
    } catch {
      return new ApiError(res.status, res.statusText);
    }
  }
}
