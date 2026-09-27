import { createServer, connect, type Server, type Socket } from 'node:net';
import { nextTestPort } from './test-port.js';

export class PostgresProxy {
  private readonly sockets = new Set<Socket>();
  private readonly server: Server;
  private forwarding = false;

  private constructor(private readonly target: URL) {
    this.server = createServer((client) => {
      this.track(client);
      if (!this.forwarding) return;
      const upstream = connect(Number(target.port || 5432), target.hostname);
      this.track(upstream);
      client.pipe(upstream).pipe(client);
      client.on('close', () => upstream.destroy());
      upstream.on('close', () => client.destroy());
    });
  }

  static async start(databaseUrl: string): Promise<PostgresProxy> {
    const proxy = new PostgresProxy(new URL(databaseUrl));
    await new Promise<void>((resolve, reject) => {
      proxy.server.once('error', reject);
      proxy.server.listen(nextTestPort(), '127.0.0.1', resolve);
    });
    return proxy;
  }

  get databaseUrl(): string {
    const url = new URL(this.target);
    url.hostname = '127.0.0.1';
    url.port = String((this.server.address() as { port: number }).port);
    return url.toString();
  }

  unblock() {
    this.forwarding = true;
    for (const socket of this.sockets) socket.destroy();
  }

  async close() {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private track(socket: Socket) {
    this.sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.on('close', () => this.sockets.delete(socket));
  }
}
