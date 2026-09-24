/**
 * How the web app's static files are served, shared by the Nest static server (Docker) and the Vercel
 * CDN rules in vercel.json, which a test keeps in agreement with these values.
 */

/** Angular's fingerprinted output: build chunks at the root and everything under media/. Hashes use [A-Za-z0-9_-]. */
export const HASHED_ASSET = /(?:^|[/\\])(?:(?:chunk|main|polyfills|styles|worker)-[\w-]{8,}\.(?:js|css)|media[/\\][^/\\]+)$/;

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
export const REVALIDATE_CACHE = 'no-cache';

export const WORKER_SCRIPT = /(?:^|[/\\])worker-[\w-]{8,}\.js$/;
/**
 * The code runner worker evaluates learner code and compiles the Python runtime to WebAssembly, so its
 * own policy allows eval; the page keeps the strict one. A worker's CSP comes from its own response.
 */
export const WORKER_CSP = "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none'";

/** Native apps load the Python runtime from the server cross-origin. */
export const PYODIDE_ASSET = /(?:^|[/\\])pyodide[/\\]/;
export const PYODIDE_CORP = 'cross-origin';
