import { loadErrorAssets } from './error-assets';

const manifest = (files: unknown[] = ['chunk-A.js', 'main-B.js']) => new Response(JSON.stringify({ version: 1, files }));

describe('loadErrorAssets', () => {
  beforeEach(() => {
    vi.spyOn(document, 'baseURI', 'get').mockReturnValue('https://grasp.example/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads exact emitted asset URLs without credentials or referrers', async () => {
    const fetch = vi.fn().mockResolvedValue(manifest());
    vi.stubGlobal('fetch', fetch);

    expect(await loadErrorAssets()).toEqual(
      new Map([
        ['https://grasp.example/chunk-A.js', 'chunk-A.js'],
        ['https://grasp.example/main-B.js', 'main-B.js'],
      ]),
    );
    expect(fetch).toHaveBeenCalledExactlyOnceWith('https://grasp.example/error-assets.json', {
      cache: 'no-cache',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
  });

  it.each(['https://grasp.example/study/', 'capacitor://localhost/', 'http://localhost/'])(
    'resolves assets against the document base %s',
    async (base) => {
      vi.spyOn(document, 'baseURI', 'get').mockReturnValue(base);
      const fetch = vi.fn().mockResolvedValue(manifest(['main.js']));
      vi.stubGlobal('fetch', fetch);

      expect(await loadErrorAssets()).toEqual(new Map([[`${base}main.js`, 'main.js']]));
      expect(fetch).toHaveBeenCalledWith(`${base}error-assets.json`, expect.any(Object));
    },
  );

  it.each([
    '../main.js',
    'nested/main.js',
    '/main.js',
    'https://other.example/main.js',
    'main.js?token=private',
    'main.js#private',
    'main%2ejs',
    'main..js',
    'main\\private.js',
    'main.txt',
    `${'a'.repeat(126)}.js`,
    null,
  ])('rejects the whole manifest for invalid filename %s', async (filename) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(manifest(['main.js', filename])));

    expect((await loadErrorAssets()).size).toBe(0);
  });

  it('accepts the supported filename and entry boundaries', async () => {
    const files = Array.from({ length: 511 }, (_, index) => `chunk-${index}.js`);
    const longest = `${'a'.repeat(125)}.js`;
    files.push(longest);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(manifest(files)));

    const assets = await loadErrorAssets();

    expect(assets.size).toBe(512);
    expect(assets.get(`https://grasp.example/${longest}`)).toBe(longest);
  });

  it.each([
    { version: 2, files: ['main.js'] },
    { files: ['main.js'] },
    { version: 1, files: 'main.js' },
    { version: 1, files: ['main.js', 'main.js'] },
    { version: 1, files: Array.from({ length: 513 }, (_, index) => `chunk-${index}.js`) },
    null,
  ])('rejects unsupported or malformed manifests', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));

    expect((await loadErrorAssets()).size).toBe(0);
  });

  it('returns no assets for missing, offline, malformed, or redirected responses', async () => {
    const redirected = manifest();
    Object.defineProperty(redirected, 'redirected', { value: true });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response('<!doctype html>'))
      .mockResolvedValueOnce(redirected);
    vi.stubGlobal('fetch', fetch);

    for (let attempt = 0; attempt < 4; attempt++) expect((await loadErrorAssets()).size).toBe(0);
  });

  it('cancels an oversized declared body without reading it', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-length': '65537' } })));

    expect((await loadErrorAssets()).size).toBe(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('bounds chunked response bytes even without a content length', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(65_000));
        controller.enqueue(new Uint8Array(600));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));

    expect((await loadErrorAssets()).size).toBe(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('aborts stalled requests after three seconds', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockReturnValue(new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetch);

    const assets = loadErrorAssets();
    await vi.advanceTimersByTimeAsync(3_000);

    expect((await assets).size).toBe(0);
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels stalled body reads within the same timeout', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));

    const assets = loadErrorAssets();
    await vi.advanceTimersByTimeAsync(3_000);

    expect((await assets).size).toBe(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
