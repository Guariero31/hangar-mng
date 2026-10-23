import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missionShare } from '../web/src/lib/mission-share.ts';

test('mission invitation uses canonical link, Brasilia time and escaped WhatsApp text', () => {
  const result = missionShare({ id: 'mission-1', title: 'Voo & ação #1', startsAt: '2026-10-25T22:30:00Z', mapName: 'Syria', status: 'scheduled' }, 'https://hangar.example');
  assert.equal(result.url, 'https://hangar.example/missoes/mission-1');
  assert.match(result.text, /19:30/);
  assert.match(result.text, /Mapa: Syria/);
  assert.match(result.text, /Inscrições abertas/);
  assert.equal(new URL(result.whatsappUrl).searchParams.get('text'), result.invitation);
  assert.ok(result.invitation.endsWith(result.url));
});

test('closed and cancelled invitations do not advertise open registrations', () => {
  for (const status of ['closed', 'cancelled']) {
    const result = missionShare({ id: 'id', title: 'Voo', startsAt: '2026-10-25T22:30:00Z', mapName: '', status }, 'https://hangar.example');
    assert.doesNotMatch(result.text, /Inscrições abertas|Mapa:/);
  }
});

test('invitations prefer the readable mission address', () => {
  const result = missionShare({ id: 'old-id', slug: 'estreito-de-varkan', title: 'Voo', startsAt: '2026-10-25T22:30:00Z', mapName: '', status: 'scheduled' }, 'https://hangar.example');
  assert.equal(result.url, 'https://hangar.example/missoes/estreito-de-varkan');
});
