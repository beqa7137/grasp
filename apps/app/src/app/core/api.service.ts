import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LearnerService } from './learner.service';

const NATIVE_API = Capacitor.getPlatform() === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
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
  readonly base = Capacitor.isNativePlatform() ? NATIVE_API : '/api';

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /** POSTs and consumes a text/event-stream response. Resolves with the `done` payload. */
  async stream<T>(path: string, body: unknown, handlers: SseHandlers, signal?: AbortSignal): Promise<T> {
    const res = await fetch(this.base + path, { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal });
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
    let res: Response;
    try {
      res = await fetch(this.base + path, { method, headers: this.headers(), body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'Cannot reach the Grasp server. Is the API running?');
    }
    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as T;
  }

  private headers(): Record<string, string> {
    return { 'content-type': 'application/json', 'x-learner-id': this.learner.id() };
  }

  private async toError(res: Response): Promise<ApiError> {
    try {
      const body = await res.json();
      return new ApiError(res.status, Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? res.statusText));
    } catch {
      return new ApiError(res.status, res.statusText);
    }
  }
}
