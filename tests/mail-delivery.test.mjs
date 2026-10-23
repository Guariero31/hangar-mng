import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMailDelivery } from '../server/src/services/mail-delivery.ts';

test('temporary Gmail refusals retry with backoff before sending the next message', async () => {
  const events = [];
  const send = createMailDelivery(async milliseconds => { events.push(milliseconds); });
  let attempts = 0;
  const first = send(async () => {
    events.push('first');
    if (++attempts < 3) throw Object.assign(new Error('Temporary System Problem'), { responseCode: 421 });
  });
  const second = send(async () => { events.push('second'); });
  await Promise.all([first, second]);
  assert.deepEqual(events.slice(0, 7), ['first', 30000, 'first', 60000, 'first', 1000, 'second']);
});

test('exhausted retries reject and do not block later mail', async () => {
  const send = createMailDelivery(async () => {});
  let attempts = 0;
  const failure = send(async () => { attempts++; throw { responseCode: 450 }; });
  let delivered = false;
  const next = send(async () => { delivered = true; });
  await assert.rejects(failure);
  await next;
  assert.equal(attempts, 3);
  assert.equal(delivered, true);
});

test('permanent refusals and ambiguous network failures are not retried', async () => {
  for (const error of [{ responseCode: 535 }, { responseCode: 550 }, { code: 'ECONNRESET' }]) {
    const send = createMailDelivery(async () => {});
    let attempts = 0;
    await assert.rejects(send(async () => { attempts++; throw error; }));
    assert.equal(attempts, 1);
  }
});
