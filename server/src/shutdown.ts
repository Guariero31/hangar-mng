import type { Server } from 'node:http';

/** Stop accepting requests, drain existing work, then close shared resources. */
export async function drainServer(server: Server, closeResources: () => Promise<void>, timeoutMs = 10_000) {
  const timeout = setTimeout(() => server.closeAllConnections(), timeoutMs);
  timeout.unref();
  try {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closeResources();
  } finally { clearTimeout(timeout); }
}
