// Cadastra (ou atualiza, pelo título) uma missão a partir de um JSON e de uma pasta com o briefing HTML e a música.
// Uso (servidor PARADO): npm run missao -- "C:\caminho\da\pasta" [scripts/missao-acs-1.json]
// Rode antes "npm run condecoracoes" para as fitas existirem. Não envia e-mails aos pilotos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SMTP_HOST = ''; // nunca avisa pilotos por e-mail ao rodar este script
const [dir, listPath = fileURLToPath(new URL('./missao-acs-1.json', import.meta.url))] = process.argv.slice(2);
if (!dir) { console.error('Informe a pasta com o briefing. Ex.: npm run missao -- "C:\\Users\\User\\Downloads\\Ace Combat Test Briefing (local music)"'); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(listPath, 'utf8'));
const read = (name) => { const file = path.join(dir, name); if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${file}`); return fs.readFileSync(file); };
const html = read(spec.briefingFile);
const audio = spec.audioFile ? read(spec.audioFile) : null;

const { db, migrate } = await import('../server/src/db.ts');
const { seed } = await import('../server/src/seed.ts');
const files = await import('../server/src/services/mission-files.ts');
const missions = await import('../server/src/services/missions.ts');
await migrate();
await seed();

const admin = (await db.query(`select * from users where role = 'admin' order by created_at limit 1`)).rows[0];
if (!admin) throw new Error('Nenhum administrador encontrado. Entre uma vez no site como administrador e rode de novo.');
const { rows: found } = await db.query('select id, name from ribbons');
const ribbonIds = spec.ribbons.map((name) => {
  const r = found.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!r) throw new Error(`Condecoração "${name}" não cadastrada. Rode "npm run condecoracoes" antes.`);
  return r.id;
});

const briefingAsset = await files.uploadMissionAsset(admin.id, 'briefing', spec.briefingFile, html);
const audioAsset = audio ? await files.uploadMissionAsset(admin.id, 'audio', spec.audioFile, audio) : null;
const input = {
  title: spec.title, briefing: spec.briefing, mapName: spec.mapName, tier: spec.tier, startsAt: new Date(spec.startsAt).toISOString(),
  defaultPm: spec.defaultPm, briefingAssetId: briefingAsset.id, audioAssetId: audioAsset?.id ?? null, ribbonIds,
};
const { rows: [same] } = await db.query(`select id from missions where title = $1 and status = 'scheduled' limit 1`, [spec.title]);
if (same) { await missions.updateMission(admin, same.id, input); console.log(`Missão atualizada: ${spec.title}`); }
else { await missions.createMission(admin, input, 0); console.log(`Missão criada: ${spec.title}`); }
console.log(`  tier ${spec.tier} · ${ribbonIds.length} condecorações · briefing ${(html.length / 1024).toFixed(0)} KB${audio ? ` · música ${(audio.length / 1048576).toFixed(1)} MB` : ''}`);
await db.close();
