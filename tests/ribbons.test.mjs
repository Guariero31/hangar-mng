import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import zlib from 'node:zlib';
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '',
  JWT_SECRET: 'ribbons-test-secret-with-at-least-32-characters', SEED_DEMO: 'false', SMTP_HOST: '',
});
const { db, migrate } = await import('../server/src/db.ts');
const r = await import('../server/src/services/ribbons.ts');
let adm;
const png = (w, h) => { // PNG mínimo (IHDR + IDAT + IEND); a validação só olha assinatura e IHDR
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(1))), chunk('IEND', Buffer.alloc(0))]);
};
const input = (o = {}) => ({ name: 'Medalha de Teste', description: 'Req', category: 'honra', precedence: 10, allowsValor: true, active: true, ...o });
before(async () => {
  await migrate();
  adm = (await db.query(`insert into users (google_sub,email,nickname,role) values ('Adm','adm@example.invalid','Adm','admin') returning *`)).rows[0];
});
after(async () => { await db.close(); });

test('PNG validation: signature, ratio and size', () => {
  assert.deepEqual(r.inspectRibbonPng(png(330, 90)), { width: 330, height: 90 });
  assert.doesNotThrow(() => r.inspectRibbonPng(png(660, 180)));
  assert.throws(() => r.inspectRibbonPng(png(300, 300)), /proporção/);
  assert.throws(() => r.inspectRibbonPng(Buffer.from('not a png at all, definitely not a png file')), /PNG/);
  assert.throws(() => r.inspectRibbonPng(Buffer.concat([png(330, 90), Buffer.alloc(101 * 1024)])), /100 KB/);
});

test('catalog: create, unique name, image, edit, delete, audit', async () => {
  const id = await r.createRibbon(adm, input());
  await assert.rejects(r.createRibbon(adm, input({ name: 'medalha de teste' })), /já existe/i);
  await assert.rejects(r.createRibbon(adm, input({ category: 'x' })), /Categoria/);
  assert.equal((await r.listRibbons()).find((x) => x.id === id).hasImage, false);
  await assert.rejects(r.getRibbonImage(id), /Imagem/);
  await r.setRibbonImage(adm, id, png(330, 90));
  const img = await r.getRibbonImage(id);
  assert.equal(img.subarray(1, 4).toString(), 'PNG');
  await r.updateRibbon(adm, id, input({ name: 'Renomeada', active: false }));
  const row = (await r.listRibbons()).find((x) => x.id === id);
  assert.equal(row.name, 'Renomeada'); assert.equal(row.active, false); assert.equal(row.hasImage, true); assert.equal(row.imageVersion, 1);
  await r.deleteRibbon(adm, id);
  await assert.rejects(r.deleteRibbon(adm, id), /não encontrada/);
  const log = await db.query(`select action from admin_audit_log where action like '%ribbon' order by id`);
  assert.deepEqual(log.rows.map((x) => x.action), ['create_ribbon', 'update_ribbon', 'update_ribbon', 'delete_ribbon']);
});

test('mission ribbons: link on create/update, inactive rejected, stale client keeps them', async () => {
  const { seed } = await import('../server/src/seed.ts');
  const m = await import('../server/src/services/missions.ts');
  await seed();
  const a = await r.createRibbon(adm, input({ name: 'Fita A', precedence: 20 }));
  const b = await r.createRibbon(adm, input({ name: 'Fita B', precedence: 5 }));
  const off = await r.createRibbon(adm, input({ name: 'Fita Off', active: false }));
  const base = { title: 'Op Fitas', briefing: '', startsAt: '2031-01-01T20:00:00Z', defaultPm: null };
  await assert.rejects(m.createMission(adm, { ...base, ribbonIds: [off] }, 0), /inativa/);
  const { ids: [id] } = await m.createMission(adm, { ...base, ribbonIds: [a, b, a] }, 0);
  let mission = await m.getMission(adm, id);
  assert.deepEqual(mission.ribbons.map((x) => x.name), ['Fita B', 'Fita A']); // por precedência
  await m.updateMission(adm, id, { ...base, title: 'Op Fitas 2' }); // cliente antigo: sem ribbonIds
  assert.equal((await m.getMission(adm, id)).ribbons.length, 2);
  await m.updateMission(adm, id, { ...base, ribbonIds: [b] });
  assert.deepEqual((await m.getMission(adm, id)).ribbons.map((x) => x.name), ['Fita B']);
  await r.updateRibbon(adm, b, input({ name: 'Fita B', active: false })); // inativa, mas já vinculada: mantém
  await m.updateMission(adm, id, { ...base, ribbonIds: [b] });
  await m.deleteMission(adm, id);
  assert.equal((await db.query('select 1 from mission_ribbons')).rows.length, 0);
});

test('awards: only closed missions, attended pilots, linked ribbons, valor rules, revoke, ribbon delete blocked', async () => {
  const m = await import('../server/src/services/missions.ts');
  const mk = async (n) => (await db.query(`insert into users (google_sub,email,nickname,role) values ($1,$2,$1,'player') returning *`, [n, `${n}@example.invalid`])).rows[0];
  const p1 = await mk('AwP1'), p2 = await mk('AwP2'), ghost = await mk('AwGhost');
  const free = (await db.query(`select a.id from aircraft a join tiers t on t.tier=a.tier where t.cost=0 and a.active limit 1`)).rows[0].id;
  const withV = await r.createRibbon(adm, input({ name: 'Com V', allowsValor: true }));
  const noV = await r.createRibbon(adm, input({ name: 'Sem V', allowsValor: false }));
  const other = await r.createRibbon(adm, input({ name: 'Fora da missão' }));
  const { ids: [id] } = await m.createMission(adm, { title: 'Op Award', briefing: '', startsAt: '2032-01-01T20:00:00Z', defaultPm: null, ribbonIds: [withV, noV] }, 0);
  await m.signUp(p1, id, free); await m.signUp(p2, id, free);
  await assert.rejects(r.saveMissionAwards(adm, id, [{ userId: p1.id, ribbonId: withV, valor: false }]), /depois de publicar/);
  await m.closeMission(adm, id, [{ userId: p1.id, pm: 0 }]); // só p1 participou
  const info = await r.getMissionAwards(id);
  assert.deepEqual(info.eligible.map((x) => x.nickname), ['AwP1']);
  await assert.rejects(r.saveMissionAwards(adm, id, [{ userId: p2.id, ribbonId: withV, valor: false }]), /participaram/);
  await assert.rejects(r.saveMissionAwards(adm, id, [{ userId: p1.id, ribbonId: other, valor: false }]), /vinculada/);
  await assert.rejects(r.saveMissionAwards(adm, id, [{ userId: p1.id, ribbonId: noV, valor: true }]), /"V"/);
  assert.deepEqual(await r.saveMissionAwards(adm, id, [{ userId: p1.id, ribbonId: withV, valor: true }, { userId: p1.id, ribbonId: noV, valor: false }]), { added: 2, revoked: 0 });
  assert.deepEqual(await r.saveMissionAwards(adm, id, [{ userId: p1.id, ribbonId: withV, valor: true }]), { added: 0, revoked: 1 });
  assert.deepEqual(await r.saveMissionAwards(adm, id, [{ userId: p1.id, ribbonId: withV, valor: false }]), { added: 1, revoked: 0 }); // tirou o V
  assert.equal((await r.getMissionAwards(id)).awards.length, 1);
  const rack = await r.getRibbonRack(p1.id);
  assert.equal(rack.length, 1); assert.equal(rack[0].name, 'Com V'); assert.equal(rack[0].count, 1); assert.equal(rack[0].valor, false);
  assert.deepEqual(await r.getRibbonRack(p2.id), []);
  const { getProfile } = await import('../server/src/services/profile.ts');
  assert.equal((await getProfile(p1)).ribbons.length, 1);
  await assert.rejects(r.deleteRibbon(adm, withV), /já foi concedida/);
  const log = (await db.query(`select action from admin_audit_log where action in ('award_ribbon','revoke_ribbon') order by id`)).rows.map((x) => x.action);
  assert.deepEqual(log, ['award_ribbon', 'award_ribbon', 'revoke_ribbon', 'award_ribbon']);
  void ghost;
});

test('review: change ribbons of a closed mission, but not ones already awarded', async () => {
  const m = await import('../server/src/services/missions.ts');
  const p = (await db.query(`insert into users (google_sub,email,nickname,role) values ('RvP','rvp@example.invalid','RvP','player') returning *`)).rows[0];
  const free = (await db.query(`select a.id from aircraft a join tiers t on t.tier=a.tier where t.cost=0 and a.active limit 1`)).rows[0].id;
  const x = await r.createRibbon(adm, input({ name: 'Rev X' })), y = await r.createRibbon(adm, input({ name: 'Rev Y' }));
  const { ids: [id] } = await m.createMission(adm, { title: 'Op Rev', briefing: '', startsAt: '2033-01-01T20:00:00Z', defaultPm: null }, 0);
  await m.signUp(p, id, free);
  await m.closeMission(adm, id, [{ userId: p.id, pm: 0 }]);
  await m.reviewMissionRibbons(adm, id, [x]); // missão antiga ganha fitas na revisão
  assert.deepEqual((await m.getMission(adm, id)).ribbons.map((f) => f.name), ['Rev X']);
  await r.saveMissionAwards(adm, id, [{ userId: p.id, ribbonId: x, valor: false }]);
  await assert.rejects(m.reviewMissionRibbons(adm, id, [y]), /já foi concedida/);
  await m.reviewMissionRibbons(adm, id, [x, y]);
  assert.equal((await r.listMissionAwardsPublic(id))[0].nickname, 'RvP');
});

test('avulsas: concede fora de missão, valida V/inativa/piloto sem apelido, aparece na estante, revoga e bloqueia apagar a fita', async () => {
  const pilot = (await db.query(`insert into users (google_sub,email,nickname) values ('Av','av@example.invalid','Avulso') returning *`)).rows[0];
  const noNick = (await db.query(`insert into users (google_sub,email) values ('Nn','nn@example.invalid') returning *`)).rows[0];
  const ribbonId = await r.createRibbon(adm, input({ name: 'Avulsa A', allowsValor: false }));
  const valorId = await r.createRibbon(adm, input({ name: 'Avulsa V', allowsValor: true }));
  const offId = await r.createRibbon(adm, input({ name: 'Avulsa Off', active: false }));
  await assert.rejects(r.grantRibbon(adm, { userId: pilot.id, ribbonId, valor: true, reason: '' }), /não aceita/);
  await assert.rejects(r.grantRibbon(adm, { userId: pilot.id, ribbonId: offId, valor: false, reason: '' }), /inativa/);
  await assert.rejects(r.grantRibbon(adm, { userId: noNick.id, ribbonId, valor: false, reason: '' }), /piloto ativo/);
  const id = await r.grantRibbon(adm, { userId: pilot.id, ribbonId, valor: false, reason: ' Evento ' });
  await r.grantRibbon(adm, { userId: pilot.id, ribbonId: valorId, valor: true, reason: '' });
  await r.grantRibbon(adm, { userId: pilot.id, ribbonId, valor: false, reason: '' });
  const rack = await r.getRibbonRack(pilot.id);
  assert.equal(rack.find((x) => x.id === ribbonId).count, 2);
  assert.equal(rack.find((x) => x.id === valorId).valor, true);
  assert.equal((await r.listGrants()).find((g) => g.id === id).reason, 'Evento');
  await assert.rejects(r.deleteRibbon(adm, ribbonId), /já foi concedida/);
  await r.revokeGrant(adm, id);
  assert.equal((await r.getRibbonRack(pilot.id)).find((x) => x.id === ribbonId).count, 1);
  await assert.rejects(r.revokeGrant(adm, id), /não encontrada/);
});
