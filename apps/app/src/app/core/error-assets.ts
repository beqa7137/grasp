const MAX_BYTES = 64 * 1024;
const MAX_FILES = 512;
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,124}\.js$/;
const TIMEOUT_MS = 3_000;

async function readManifest(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || response.redirected || !response.body) {
    void response.body?.cancel().catch(() => {});
    return null;
  }
  const length = response.headers.get('content-length');
  if (length && Number(length) > MAX_BYTES) {
    void response.body.cancel().catch(() => {});
    return null;
  }
  const reader = response.body.getReader();
  const cancel = () => void reader.cancel().catch(() => {});
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    cancel();
    return null;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

async function fetchAssets(signal: AbortSignal): Promise<ReadonlyMap<string, string>> {
  const base = document.baseURI;
  const response = await fetch(new URL('error-assets.json', base).href, {
    cache: 'no-cache',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    signal,
  });
  const manifest = (await readManifest(response, signal)) as { version?: unknown; files?: unknown } | null;
  if (manifest?.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length > MAX_FILES) return new Map();
  const assets = new Map<string, string>();
  for (const filename of manifest.files) {
    if (typeof filename !== 'string' || !FILENAME.test(filename) || filename.includes('..')) return new Map();
    const url = new URL(filename, base).href;
    if (assets.has(url)) return new Map();
    assets.set(url, filename);
  }
  return assets;
}

export async function loadErrorAssets(): Promise<ReadonlyMap<string, string>> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchAssets(controller.signal),
      new Promise<ReadonlyMap<string, string>>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(new Map());
        }, TIMEOUT_MS);
      }),
    ]);
  } catch {
    return new Map();
  } finally {
    clearTimeout(timeout);
  }
}
