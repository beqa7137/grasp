// Serves a local HTTP/1.1 server over TLS and HTTP/2, as production is served, for `timing.mjs`. Over HTTP/1.1 a browser
// opens at most six connections to the server, so lazy chunks queue behind preloads in a way production never sees.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection']);

/** A self-signed certificate for localhost, made once per machine with openssl; the timed browser ignores its errors. */
function certificate() {
  const dir = join(tmpdir(), 'grasp-h2proxy');
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  if (!existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365', '-subj', '/CN=localhost', '-keyout', key, '-out', cert],
      {
        stdio: 'ignore',
      },
    );
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

/** Proxies `target` (an http:// origin) on a free port, and resolves to its https:// origin and a close function. */
export async function serveHttp2(target) {
  const { hostname, port } = new URL(target);
  const server = http2.createSecureServer(certificate());
  server.on('stream', (stream, headers) => {
    const forwarded = Object.fromEntries(Object.entries(headers).filter(([name]) => !name.startsWith(':')));
    const request = http.request(
      { host: hostname, port, method: headers[':method'], path: headers[':path'], headers: forwarded },
      (response) => {
        const out = { ':status': response.statusCode };
        for (const [name, value] of Object.entries(response.headers)) if (!HOP_BY_HOP.has(name)) out[name] = value;
        if (!stream.destroyed) stream.respond(out);
        response.on('error', () => stream.destroy());
        response.pipe(stream);
      },
    );
    // A browser closing its context resets its streams mid-response; that ends the proxied request, not the run.
    stream.on('error', () => request.destroy());
    request.on('error', () => {
      if (!stream.destroyed && !stream.headersSent) stream.respond({ ':status': 502 });
      stream.end();
    });
    stream.pipe(request);
  });
  server.on('sessionError', () => {});
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  return { url: `https://localhost:${server.address().port}`, close: () => server.close() };
}
