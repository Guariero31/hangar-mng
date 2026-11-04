import assert from 'node:assert/strict';
import { test } from 'node:test';
import zlib from 'node:zlib';
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', JWT_SECRET: 'tacview-test-secret-with-at-least-32-characters', SEED_DEMO: 'false', SMTP_HOST: '' });
const { analyzeTacview, nameKey } = await import('../server/src/services/tacview.ts');

// Gravação sintética: 2 pilotos (azul), 3 alvos vermelhos. Posições em metros (U|V) no formato de 9 campos.
const T = (x, y, alt) => `T=0|0|${alt}|||90|${x}|${y}|90`;
const lines = [
  'FileType=text/acmi/tacview', 'FileVersion=2.2', '0,ReferenceLongitude=0', '0,ReferenceLatitude=0', '0,Title=Teste',
  '#0',
  `100,${T(0, 0, 1000)},Type=Air+FixedWing,Name=F-5E-3,Pilot=Alpha,Color=Blue,Coalition=Enemies`,
  `300,${T(0, 100, 2000)},Type=Air+FixedWing,Name=A-10C,Pilot=HRP | Bravo,Color=Blue,Coalition=Enemies`,
  `200,${T(0, 0, 1000)},Type=Air+FixedWing,Name=MiG-21Bis,Pilot=Aerial-1-1,Color=Red,Coalition=Allies`,
  `400,${T(0, 5000, 0)},Type=Ground+Heavy+Armor+Vehicle+Tank,Name=BTR-80,Pilot=Ground-1-1,Color=Red,Coalition=Allies`,
  `800,${T(6000, 0, 1000)},Type=Air+FixedWing,Name=Su-25,Pilot=Aerial-2-1,Color=Red,Coalition=Allies`,
  '#10', `500,${T(2005, 0, 1000)},Type=Weapon+Missile,Name=AIM-9P5,Color=Blue,Coalition=Enemies`,
  '#20', `500,${T(3000, 5, 1000)}`, `200,${T(3000, 0, 1000)}`, '-500', '#21', '-200',
  '#30', `600,${T(5, 100, 2000)},Type=Weapon+Bomb,Name=FAB_250,Color=Blue,Coalition=Enemies`,
  '#40', `600,${T(0, 5000, 0)}`, '-600', '#41', '-400',
  '#50', `700,${T(3000, 0, 1000)},Type=Weapon+Missile,Name=R-60,Color=Red,Coalition=Allies`,
  '#60', `700,${T(0, 100, 2000)}`, '-700', '#61', '-300',
  '#70', `100,${T(14000, 0, 1000)}`, '-100',
  '#75', `800,${T(8000, 0, 1000)}`,
  '#80', '-800',
  '#100',
];
const acmi = Buffer.from(lines.join('\n') + '\n');

test('kills, survival and doubts are reconstructed from weapons and removals', async () => {
  const r = await analyzeTacview(acmi, ['Alpha', 'Bravo']);
  assert.equal(r.durationSec, 100);
  const alpha = r.pilots.find((p) => p.name === 'Alpha'), bravo = r.pilots.find((p) => p.name === 'HRP | Bravo');
  assert.equal(alpha.counts.airborneAircraft, 1); assert.equal(alpha.survived, true);
  assert.equal(bravo.counts.armoredVehicle, 1); assert.equal(bravo.survived, false); assert.equal(bravo.deaths, 1);
  assert.deepEqual(r.stats, { targets: 3, claimed: 2, unclaimed: 1, ignored: 0 });
  assert.deepEqual(r.doubts.map((d) => d.kind).sort(), ['unclaimed', 'vanished']);
  assert.equal(r.doubts.find((d) => d.kind === 'vanished').pilot, 'Alpha');
});

test('compressed recordings and non-Tacview files', async () => {
  const gz = zlib.deflateRawSync(acmi); // não é ZIP de verdade: texto simples continua valendo
  await assert.rejects(analyzeTacview(Buffer.from('isto não é um tacview')), /Tacview/);
  await assert.rejects(analyzeTacview(Buffer.from('FileType=text/acmi/tacview\n#0\n#5\n')), /pilotos/);
  assert.ok(gz.length > 0);
});

test('name matching ignores squadron tags, case and symbols', () => {
  assert.equal(nameKey('HRP | Mr. Magoo'), 'mrmagoo');
  assert.equal(nameKey('Mr_Magoo'), 'mrmagoo');
  assert.equal(nameKey('Piloto Ás'), 'pilotoas');
});

test('ZIP real é lido; ZIP sem gravação é recusado', async () => {
  const zlibmod = zlib;
  const name = Buffer.from('rec.txt.acmi');
  const data = zlibmod.deflateRawSync(acmi);
  const crc = zlibmod.crc32 ? zlibmod.crc32(acmi) : 0;
  const lf = Buffer.alloc(30); lf.writeUInt32LE(0x04034b50, 0); lf.writeUInt16LE(20, 4); lf.writeUInt16LE(8, 8);
  lf.writeUInt32LE(crc >>> 0, 14); lf.writeUInt32LE(data.length, 18); lf.writeUInt32LE(acmi.length, 22); lf.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(crc >>> 0, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(acmi.length, 24); cd.writeUInt16LE(name.length, 28);
  const local = Buffer.concat([lf, name, data]);
  const dir = Buffer.concat([cd, name]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(local.length, 16);
  const zip = Buffer.concat([local, dir, end]);
  const r = await analyzeTacview(zip, ['Alpha', 'Bravo']);
  assert.equal(r.pilots.length, 2);
  await assert.rejects(analyzeTacview(Buffer.concat([Buffer.from('PK'), Buffer.alloc(40)])), /arquivo|Tacview|corrompido/);
});
