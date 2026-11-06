// Gera um arquivo .acmi de TESTE com os pilotos inscritos na missão agendada (a com mais inscritos).
// Uso (com o servidor PARADO):  npm run tacview-teste   ->  output/tacview-teste.txt.acmi
// Cenários: o 1º abate 2 aviões; o 2º um blindado; o 3º abate e some do mapa (dúvida); os demais 1 abate;
// o último inscrito não aparece no arquivo; um "Visitante_Teste" sem inscrição deve ser IGNORADO (modo estrito); 1 alvo fica sem dono.
import { writeFileSync, mkdirSync } from 'node:fs';
import { db, migrate } from '../server/src/db.ts';

await migrate();
const { rows: [m] } = await db.query(
  `select m.id, m.title from missions m left join mission_signups s on s.mission_id = m.id
   where m.status = 'scheduled' group by m.id order by count(s.user_id) desc, m.starts_at limit 1`);
if (!m) { console.error('Nenhuma missão agendada. Crie uma e inscreva pilotos.'); process.exit(1); }
const { rows: signups } = await db.query(
  `select u.nickname, a.name as aircraft from mission_signups s join users u on u.id = s.user_id
   join aircraft a on a.id = s.aircraft_id where s.mission_id = $1 order by s.created_at`, [m.id]);
if (!signups.length) { console.error('A missão não tem inscritos.'); process.exit(1); }

const T = (u, v, alt) => `T=0|0|${alt}|||90|${u}|${v}|90`;
const L = ['FileType=text/acmi/tacview', 'FileVersion=2.2', '0,ReferenceLongitude=0', '0,ReferenceLatitude=0', `0,Title=${m.title} (teste)`, '#0'];
const flying = signups.length >= 3 ? signups.slice(0, -1) : signups; // o último fica de fora
const names = [...flying.map((s) => s.nickname), 'Visitante_Teste'];
let id = 0x100;
const hex = () => (id++).toString(16);
const events = []; // [tempo, linhas]
const pilots = names.map((name, i) => ({ name, ac: flying[i]?.aircraft ?? 'F-16C', id: hex(), v: i * 4000 }));
for (const p of pilots) L.push(`${p.id},${T(0, p.v, 3000)},Type=Air+FixedWing,Name=${p.ac},Pilot=${p.name},Color=Blue,Coalition=Enemies`);
L.push(`${hex()},${T(30000, 0, 2000)},Type=Air+FixedWing,Name=Su-25,Pilot=Aerial-1-1,Color=Red,Coalition=Allies`);

let t = 10;
const kill = (p, air) => { // arma disparada pelo piloto, acerta o alvo e ambos somem
  const w = hex(), tg = hex(), tu = 6000;
  L.push(`#${t}`, `${tg},${T(air ? tu - 4000 : tu, p.v, air ? 3000 : 0)},Type=${air ? 'Air+FixedWing' : 'Ground+Heavy+Armor+Vehicle+Tank'},Name=${air ? 'MiG-29S' : 'T-72B'},Pilot=${air ? 'Aerial-2-' : 'Ground-2-'}${id},Color=Red,Coalition=Allies`,
    `${w},${T(5, p.v, 3000)},Type=Weapon+${air ? 'Missile' : 'Bomb'},Name=${air ? 'AIM-9P5' : 'FAB_250'},Color=Blue,Coalition=Enemies`);
  t += 8; L.push(`#${t}`, ...(air ? [`${tg},${T(tu, p.v, 3000)}`] : []), `${w},${T(tu, p.v, air ? 3000 : 0)}`, `-${w}`); t += 1; L.push(`#${t}`, `-${tg}`); t += 6;
};
pilots.forEach((p, i) => {
  if (i === 0) { kill(p, true); kill(p, true); }
  else if (i === 1) { kill(p, false); }
  else kill(p, true);
});
// alvo sem dono: um blindado que explode longe de qualquer pilot
const orfao = hex();
L.push(`#${t}`, `${orfao},${T(20000, 40000, 0)},Type=Ground+Heavy+Armor+Vehicle+Tank,Name=T-55,Pilot=Ground-9-1,Color=Red,Coalition=Allies`);
t += 5; L.push(`#${t}`, `-${orfao}`);
// o 3º piloto some do mapa sem pousar (dúvida: voltou ou foi perdido?)
if (pilots[2]) { const p = pilots[2]; t += 10; L.push(`#${t}`, `${p.id},${T(60000, p.v, 3000)}`); t += 5; L.push(`#${t}`, `-${p.id}`); }
t += 20; L.push(`#${t}`);

mkdirSync('output', { recursive: true });
writeFileSync('output/tacview-teste.txt.acmi', L.join('\n') + '\n');
console.log(`Missão: ${m.title}\nNo arquivo: ${names.join(', ')}\nFora do arquivo: ${signups.length >= 3 ? signups.at(-1).nickname : '(ninguém)'}\nGerado em output/tacview-teste.txt.acmi`);
process.exit(0);
