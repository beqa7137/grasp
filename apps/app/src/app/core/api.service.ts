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

  get<T>(path: string, timeoutMs = REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<T> {
    return this.request<T>('GET', path, undefined, timeoutMs, signal);
  }

  post<T>(path: string, body?: unknown, timeoutMs = REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<T> {
    return this.request<T>('POST', path, body, timeoutMs, signal);
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
      const learnerId = sentHeaders['x-learner-id'];
      const streamBody = await this.withDeadline(STREAM_CONNECT_TIMEOUT_MS, controller, async (requestSignal) => {
        const send = () => {
          requestSignal.throwIfAborted();
          if (learnerId !== this.learner.id()) throw new DOMException('Learner changed', 'AbortError');
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
        requestSignal.throwIfAborted();
        if (response.status === 401 && (await this.renewAfter(response.clone(), path, requestSignal, learnerId))) response = await send();
        requestSignal.throwIfAborted();
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

  private async request<T>(method: string, path: string, body?: unknown, timeoutMs = REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      return await this.withDeadline(timeoutMs, controller, async (requestSignal) => {
        const serialized = body === undefined ? undefined : JSON.stringify(body);
        let sentHeaders = this.headers();
        const learnerId = sentHeaders['x-learner-id'];
        const send = async () => {
          requestSignal.throwIfAborted();
          if (learnerId !== this.learner.id()) throw new DOMException('Learner changed', 'AbortError');
          try {
            sentHeaders = this.headers();
            return await fetch(this.base + path, {
              method,
              headers: sentHeaders,
              body: serialized,
              cache: 'no-store',
              signal: requestSignal,
            });
          } catch {
            requestSignal.throwIfAborted();
            throw new ApiError(0, 'Cannot reach the Grasp server. Check your connection.');
          }
        };
        let res = await send();
        requestSignal.throwIfAborted();
        if (res.status === 401 && (await this.renewAfter(res.clone(), path, requestSignal, learnerId))) res = await send();
        requestSignal.throwIfAborted();
        if (!res.ok) {
          const error = await this.toError(res);
          requestSignal.throwIfAborted();
          await this.handleRetired(error, sentHeaders);
          throw error;
        }
        const result = res.status === 204 ? undefined : await res.json();
        requestSignal.throwIfAborted();
        return result as T;
      });
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  private async withDeadline<T>(timeoutMs: number, controller: AbortController, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    controller.signal.throwIfAborted();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled!: () => void;
    const cancellation = new Promise<never>((_, reject) => {
      cancelled = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', cancelled, { once: true });
    });
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ApiError(0, TIMEOUT_MESSAGE, 'request_timeout'));
        controller.abort();
      }, timeoutMs);
    });
    try {
      return await Promise.race([work(controller.signal), deadline, cancellation]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', cancelled);
    }
  }

  /** On an expired session (or progress that needs a session), refreshes once so the caller can retry. */
  private async renewAfter(res: Response, path: string, signal: AbortSignal, learnerId: string): Promise<boolean> {
    const code = await res
      .json()
      .then((b: { code?: string }) => b.code)
      .catch(() => undefined);
    signal.throwIfAborted();
    if (learnerId !== this.learner.id()) throw new DOMException('Learner changed', 'AbortError');
    // The refresh call itself must never wait on a refresh.
    if ((code !== 'token_invalid' && code !== 'sign_in_required') || path === '/auth/refresh' || !this.tokens.refresher) return false;
    const renewed = await this.tokens.refresher();
    signal.throwIfAborted();
    if (learnerId !== this.learner.id()) throw new DOMException('Learner changed', 'AbortError');
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
