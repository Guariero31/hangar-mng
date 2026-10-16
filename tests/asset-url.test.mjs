import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preserveAssetUrl } from '../web/src/lib/asset-url.ts';

test('mission polling retains the displayed signed URL until renewal is necessary', () => {
  const now = Date.now();
  const initial = { url: '/map?signature=first', expiresAt: now + 6 * 60 * 60 * 1000 };
  let displayed = initial;
  for (let elapsed = 30_000; elapsed < 6 * 60 * 60 * 1000 - 60_000; elapsed += 30_000) {
    displayed = preserveAssetUrl(displayed, { url: `/map?signature=${elapsed}`, expiresAt: now + elapsed + 6 * 60 * 60 * 1000 }, now + elapsed);
    assert.equal(displayed, initial);
  }
  const renewed = { url: '/map?signature=renewed', expiresAt: initial.expiresAt + 6 * 60 * 60 * 1000 };
  assert.equal(preserveAssetUrl(displayed, renewed, initial.expiresAt - 30_000), renewed);
  assert.equal(preserveAssetUrl({ url: 'old', expiresAt: 0 }, renewed, now), renewed);
});
