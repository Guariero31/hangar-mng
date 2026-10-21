// Cria (ou recria) um piloto de teste com histórico: ~6000 PM de saldo e 7 aeronaves compradas.
// Uso (com o servidor PARADO, pois o banco local só aceita um processo):  npm run piloto-teste
// Login: tela de login > "Entrar sem Google" com o e-mail abaixo.
import { db, migrate } from '../server/src/db.ts';
import { seed } from '../server/src/seed.ts';
import { syncAchievements } from '../server/src/services/achievements.ts';

const EMAIL = 'piloto.teste@exemplo.com';
const NICK = 'Piloto_Teste';
const day = 86_400_000;

// [dias atrás, valor, motivo, aeronave comprada (opcional)] — o saldo nunca fica negativo e termina em 6000 PM.
const EVENTS = [
  [70, 1200, 'Missão: Treinamento de formação'],
  [63, 900, 'Missão: Patrulha aérea de combate'],
  [60, -500, 'Desbloqueio: Su-25A', 'su25a'],
  [56, 1100, 'Missão: Supressão de defesas'],
  [53, -500, 'Desbloqueio: F-4E', 'f4e'],
  [49, 1000, 'Missão: Escolta de transporte'],
  [46, -500, 'Desbloqueio: F-100D', 'f100'],
  [42, 950, 'Missão: Interdição costeira'],
  [39, -1500, 'Desbloqueio: F-16A', 'f16a'],
  [35, 1250, 'Missão: Ataque ao aeródromo'],
  [32, -500, 'Desbloqueio: A-10C', 'a10c'],
  [28, 1050, 'Missão: Apoio aéreo aproximado'],
  [25, -500, 'Desbloqueio: Mi-24P', 'mi24p'],
  [21, 1300, 'Missão: Resgate em área hostil'],
  [18, -1500, 'Desbloqueio: Ka-50', 'ka50'],
  [14, 1400, 'Missão: Defesa da base'],
  [7, 1350, 'Missão: Operação conjunta'],
];

await migrate();
await seed();
await db.query('delete from users where email = $1', [EMAIL]); // recria do zero
const { rows: [user] } = await db.query(
  `insert into users (google_sub, email, name, nickname, status, created_at, last_login_at)
   values ($1, $2, $3, $4, 'active', now() - interval '75 days', now()) returning *`,
  [`dev:${EMAIL}`, EMAIL, NICK, NICK]);

let balance = 0;
for (const [ago, amount, reason, aircraftId] of EVENTS) {
  balance += amount;
  if (balance < 0) throw new Error(`Saldo negativo em "${reason}"`);
  const at = new Date(Date.now() - ago * day).toISOString();
  const { rows: [entry] } = await db.query(
    `insert into points_ledger (user_id, amount, reason, source, aircraft_id, created_at) values ($1, $2, $3, $4, $5, $6) returning id::text`,
    [user.id, amount, reason, amount < 0 ? 'unlock' : 'manual', aircraftId ?? null, at]);
  if (aircraftId) {
    await db.query(
      `insert into user_aircraft (user_id, aircraft_id, unlocked_at, paid_amount, purchase_ledger_id, acquisition_kind) values ($1, $2, $3, $4, $5, 'purchase')`,
      [user.id, aircraftId, at, -amount, entry.id]);
  }
}
await syncAchievements(user);
console.log(`Piloto criado: ${NICK} <${EMAIL}> com ${balance} PM e ${EVENTS.filter((e) => e[3]).length} aeronaves compradas.`);
await db.close();
