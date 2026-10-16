import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { runOperation } from '../web/src/lib/mutations.ts';
import { drainServer } from '../server/src/shutdown.ts';
import { QueryClient } from '@tanstack/react-query';
import { invalidatePlayerData } from '../web/src/api/cache.ts';

test('failed forms preserve input and do not run success cleanup', async () => {
  let input = '500';
  let displayedError;
  const error = new Error('Connection lost');
  const succeeded = await runOperation(Promise.reject(error), () => { input = ''; }, failure => { displayedError = failure; });
  if (succeeded) input = '';
  assert.equal(input, '500');
  assert.equal(displayedError, error);
  assert.equal(await runOperation(Promise.resolve(), () => { input = ''; }, () => {}), true);
  assert.equal(input, '');
});

test('point and ownership changes invalidate paged history, medals, news, ranking and administration', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const keys = [['history', 50], ['achievements'], ['news'], ['ranking', 100], ['admin', 'players', ''], ['me'], ['profile'], ['techtree']];
  for (const key of [...keys, ['auth-config']]) client.setQueryData(key, { previous: true });
  await invalidatePlayerData(client);
  for (const key of keys) assert.equal(client.getQueryState(key).isInvalidated, true);
  assert.equal(client.getQueryState(['auth-config']).isInvalidated, false);
  client.clear();
});

test('shutdown waits for an in-flight response before closing the database', async context => {
  let finishResponse;
  let resourceClosed = false;
  const accepted = new Promise(resolve => { finishResponse = resolve; });
  let response;
  const server = http.createServer((_request, result) => { response = result; finishResponse(); });
  context.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const request = new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${server.address().port}`, result => {
      let body = '';
      result.on('data', chunk => { body += chunk; });
      result.on('end', () => resolve(body));
    }).on('error', reject);
  });
  await Promise.race([accepted, request]);
  const shutdown = drainServer(server, async () => { resourceClosed = true; });
  assert.equal(resourceClosed, false);
  response.end('saved');
  assert.equal(await request, 'saved');
  await shutdown;
  assert.equal(resourceClosed, true);
});
