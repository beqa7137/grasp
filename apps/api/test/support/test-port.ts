const firstPort = Number(process.env['TEST_PORT_BASE'] ?? 0);
let port = firstPort;

export function nextTestPort(): number {
  if (firstPort === 0) return 0;
  if (port >= firstPort + 100) throw new Error('Test port range exhausted');
  return port++;
}
