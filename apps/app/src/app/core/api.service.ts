import { Injectable, inject } from '@angular/core';
import { AuthTokens } from './auth-tokens.service';
import { LearnerService } from './learner.service';
import { RuntimeConfigService } from './runtime-config.service';

const REQUEST_TIMEOUT_MS = 8_000;
const STREAM_CONNECT_TIMEOUT_MS = 190_000;
const TIMEOUT_MESSAGE = 'The Grasp server is taking too long. Please try again.';

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

  get<T>(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    return this.request<T>('GET', path, undefined, timeoutMs);
  }

  post<T>(path: string, body?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    return this.request<T>('POST', path, body, timeoutMs);
  }

  delete(path: string): Promise<void> {
    return this.request<void>('DELETE', path);
  }

  /** POSTs and consumes a text/event-stream response. Resolves with the `done` payload. */
  async stream<T>(path: string, body: unknown, handlers: SseHandlers, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      let sentHeaders = this.headers();
      const streamBody = await this.withDeadline(STREAM_CONNECT_TIMEOUT_MS, controller, async (requestSignal) => {
        const send = () => {
          sentHeaders = this.headers();
          return fetch(this.base + path, {
            method: 'POST',
            headers: sentHeaders,
            body: JSON.stringify(body),
            cache: 'no-store',
            signal: requestSignal,
          });
        };
        let response = await send();
        if (response.status === 401 && (await this.renewAfter(response.clone(), path))) response = await send();
        if (!response.ok || !response.body) {
          const error = await this.toError(response);
          await this.handleRetired(error, sentHeaders);
          throw error;
        }
        return response.body;
      });

      const reader = streamBody.pipeThrough(new TextDecoderStream()).getReader();
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
          else if (event === 'error') {
            const error = new ApiError(data.status, data.message, data.code);
            await this.handleRetired(error, sentHeaders);
            throw error;
          }
        }
      }
      throw new ApiError(0, 'Stream ended unexpectedly');
    } finally {
      signal?.removeEventListener('abort', abort);
      controller.abort();
    }
  }

  private request<T>(method: string, path: string, body?: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    return this.withDeadline(timeoutMs, new AbortController(), async (signal) => {
      let sentHeaders = this.headers();
      const send = async () => {
        try {
          sentHeaders = this.headers();
          return await fetch(this.base + path, {
            method,
            headers: sentHeaders,
            body: body === undefined ? undefined : JSON.stringify(body),
            cache: 'no-store',
            signal,
          });
        } catch {
          throw new ApiError(0, 'Cannot reach the Grasp server. Check your connection.');
        }
      };
      let res = await send();
      if (res.status === 401 && (await this.renewAfter(res.clone(), path))) res = await send();
      if (!res.ok) {
        const error = await this.toError(res);
        await this.handleRetired(error, sentHeaders);
        throw error;
      }
      return (res.status === 204 ? undefined : await res.json()) as T;
    });
  }

  private async withDeadline<T>(timeoutMs: number, controller: AbortController, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ApiError(0, TIMEOUT_MESSAGE, 'request_timeout'));
        controller.abort();
      }, timeoutMs);
    });
    try {
      return await Promise.race([work(controller.signal), deadline]);
    } finally {
      clearTimeout(timer);
    }
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

  private async handleRetired(error: ApiError, headers: Record<string, string>): Promise<void> {
    if (error.status !== 410 || headers['authorization']) return;
    if (error.code !== 'learner_erased' && error.code !== 'learner_moved') return;
    await this.tokens.learnerRetired?.(error.code, headers['x-learner-id']);
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
