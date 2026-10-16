/** The id of the JSON block `scripts/route-chunks.mjs` writes into index.html: each lazy module's static chunks. */
export const ROUTE_CHUNKS_ID = 'route-chunks';

function chunksOf(module: string, doc: Document): readonly string[] {
  try {
    return JSON.parse(doc.getElementById(ROUTE_CHUNKS_ID)?.textContent ?? '{}')[module] ?? [];
  } catch {
    return [];
  }
}

/**
 * Starts fetching the chunks a lazy module imports statically, beside the module's own chunk. A development build writes no
 * list, so there it does nothing.
 */
export function preloadChunks(module: string, doc: Document = document): void {
  for (const file of chunksOf(module, doc)) {
    if (doc.head.querySelector(`link[rel="modulepreload"][href="${file}"]`)) continue;
    const link = doc.createElement('link');
    link.rel = 'modulepreload';
    link.href = file;
    doc.head.append(link);
  }
}
