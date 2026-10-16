import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { withBriefingAudioRecovery } from '../server/src/services/briefing-audio.ts';

test('blocked autoplay offers an in-frame gesture and settles the original player promise', async () => {
  const buttons = [];
  class Media {
    allowed = false;
    play() { return this.allowed ? Promise.resolve() : Promise.reject(Object.assign(new Error('gesture required'), { name: 'NotAllowedError' })); }
  }
  const document = {
    body: { append(button) { buttons.push(button); } },
    createElement() { return { style: {}, remove() { buttons.splice(buttons.indexOf(this), 1); } }; },
    addEventListener() {},
  };
  const html = withBriefingAudioRecovery(Buffer.from('<!doctype html><html><head></head><body><script>original()</script></body></html>')).toString();
  assert.ok(html.indexOf('HTMLMediaElement.prototype.play') < html.indexOf('original()'));
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { HTMLMediaElement: Media, document });
  const media = new Media();
  let started = false;
  const pending = media.play().then(() => { started = true; });
  await new Promise(setImmediate);
  assert.equal(started, false);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].textContent, 'Ativar música');
  media.allowed = true;
  buttons[0].onclick();
  await pending;
  assert.equal(started, true);
  assert.equal(buttons.length, 0);
});

test('audio recovery preserves doctypes and supports HTML without a head', () => {
  for (const html of ['<!doctype html><body>Map</body>', '<body>Map</body>']) {
    const output = withBriefingAudioRecovery(Buffer.from(html)).toString();
    assert.match(output, /Ativar música/);
    assert.ok(output.endsWith('<body>Map</body>'));
    if (html.startsWith('<!doctype')) assert.ok(output.startsWith('<!doctype html>'));
  }
});
