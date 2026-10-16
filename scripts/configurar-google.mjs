// Grava o ID do cliente Google (e seu e-mail de admin) em server/.env, sem apagar o resto.
// Uso interativo: node scripts/configurar-google.mjs
// Uso direto:     node scripts/configurar-google.mjs <ID-DO-CLIENTE> <seu-email@gmail.com>
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, 'server', '.env');
const exampleFile = path.join(root, 'server', '.env.example');

const ID_RULE = /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;
const MAIL_RULE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

function setKey(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^#?\\s*${key}=.*$`, 'm');
  // troca a linha existente (ativa ou comentada); se não houver, acrescenta no fim
  if (new RegExp(`^${key}=`, 'm').test(text)) return text.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  if (re.test(text)) return text.replace(re, line);
  return `${text.replace(/\s*$/, '\n')}${line}\n`;
}
const getKey = (text, key) => (text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] ?? '').trim();

let [id, email] = process.argv.slice(2);
const rl = id ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
// fila de linhas digitadas (funciona tanto no console quanto com entrada redirecionada)
const lines = []; const waiting = []; let closed = false;
rl?.on('line', (l) => (waiting.length ? waiting.shift()(l) : lines.push(l)));
rl?.on('close', () => { closed = true; while (waiting.length) waiting.shift()(''); });
const ask = (q) => new Promise((resolve) => {
  process.stdout.write(q);
  if (lines.length) resolve(lines.shift()); else if (closed) resolve(''); else waiting.push(resolve);
});

let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : fs.readFileSync(exampleFile, 'utf8');

if (!id) {
  console.log('\n  Login com Google — configuração\n');
  console.log('  Cole o "ID do cliente" criado no Google Cloud (termina em .apps.googleusercontent.com).');
}
while (true) {
  if (!id) id = (await ask('\n  ID do cliente: ')).trim();
  if (ID_RULE.test(id)) break;
  console.log('  Isso não parece um ID do cliente. Ele é assim: 123456789012-abc123def456.apps.googleusercontent.com');
  if (process.argv[2] || closed) process.exit(1);
  id = '';
}

if (email === undefined) {
  console.log('\n  Seu e-mail do Google entra direto como administrador (sem passar pela fila de aprovação).');
  const current = getKey(text, 'ADMIN_EMAILS');
  email = (await ask(`  Seu e-mail${current ? ` [já cadastrado: ${current}; Enter mantém]` : ''}: `)).trim();
}
rl?.close();

text = setKey(text, 'GOOGLE_CLIENT_ID', id);
if (email) {
  if (!MAIL_RULE.test(email)) { console.log('\n  E-mail inválido. Nada foi gravado.'); process.exit(1); }
  const list = getKey(text, 'ADMIN_EMAILS').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!list.includes(email.toLowerCase())) list.push(email.toLowerCase());
  text = setKey(text, 'ADMIN_EMAILS', list.join(','));
}
fs.writeFileSync(envFile, text);

console.log('\n  Pronto! Gravado em server/.env.');
console.log('  Feche o Hangar e abra de novo pelo iniciar.bat — a tela de login passa a mostrar o botão do Google.\n');
