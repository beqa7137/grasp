import { TestBed } from '@angular/core/testing';
import { RuntimeConfigService } from './runtime-config.service';

describe('RuntimeConfigService', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const load = async (fetchImpl: typeof fetch) => {
    globalThis.fetch = fetchImpl;
    const service = TestBed.inject(RuntimeConfigService);
    await service.load();
    return service;
  };

  it('uses the configured API URL and Sentry settings', async () => {
    const service = await load(
      async () => new Response(JSON.stringify({ apiUrl: 'https://grasp.example/api/', sentryDsn: 'https://k@o1.ingest.sentry.io/2' })),
    );
    expect(service.apiBase()).toBe('https://grasp.example/api');
    expect(service.config()).toMatchObject({ sentryDsn: 'https://k@o1.ingest.sentry.io/2', environment: 'development' });
  });

  it('falls back to same-origin /api on the web when config is missing or unreachable', async () => {
    const notFound = await load(async () => new Response('<!doctype html>', { status: 200 }));
    expect(notFound.apiBase()).toBe('/api');
    TestBed.resetTestingModule();
    const offline = await load(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(offline.apiBase()).toBe('/api');
    expect(offline.config()).toMatchObject({ sentryDsn: null, googleIosClientId: null });
  });
});
