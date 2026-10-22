// Cadastra (ou atualiza, pelo nome) condecorações a partir de uma lista JSON e de uma pasta com os PNGs.
// Uso (servidor PARADO): npm run condecoracoes -- "C:\caminho\da\pasta" [scripts/condecoracoes-sung.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, migrate } from '../server/src/db.ts';
import { seed } from '../server/src/seed.ts';
import * as ribbons from '../server/src/services/ribbons.ts';

const [dir, listPath = fileURLToPath(new URL('./condecoracoes-sung.json', import.meta.url))] = process.argv.slice(2);
if (!dir) { console.error('Informe a pasta com os PNGs. Ex.: npm run condecoracoes -- "C:\\Users\\User\\Downloads\\fitas-sung-war"'); process.exit(1); }
const items = JSON.parse(fs.readFileSync(listPath, 'utf8'));

// Valida tudo antes de gravar qualquer coisa.
const prepared = items.map((item) => {
  const file = path.join(dir, item.file);
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${file}`);
  const image = fs.readFileSync(file);
  try { ribbons.inspectRibbonPng(image); } catch (e) { throw new Error(`${item.file}: ${e.message}`); }
  return { item, image };
});

await migrate();
await seed();
const admin = (await db.query(`select * from users where role = 'admin' order by created_at limit 1`)).rows[0] ?? { id: null };
const existing = await ribbons.listRibbons();
let created = 0, updated = 0;
for (const { item, image } of prepared) {
  const input = { name: item.name, description: item.description, category: item.category, precedence: item.precedence, allowsValor: item.allowsValor, active: item.active };
  const found = existing.find((r) => r.name.toLowerCase() === item.name.toLowerCase());
  const id = found ? found.id : await ribbons.createRibbon(admin, input);
  if (found) { await ribbons.updateRibbon(admin, id, input); updated++; } else created++;
  await ribbons.setRibbonImage(admin, id, image);
  console.log(`  ${found ? 'atualizada' : 'criada'}: ${item.name}`);
}
console.log(`Pronto: ${created} criada(s), ${updated} atualizada(s).`);
await db.close();
