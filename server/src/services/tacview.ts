// Leitura de gravações do Tacview (.acmi / .zip.acmi) para sugerir o relatório pós-missão:
// quem participou, quem destruiu o quê e quem sobreviveu. É uma SUGESTÃO: o que o arquivo não prova vai para "dúvidas".
import yauzl from 'yauzl';
import { fail } from '../errors.js';

export type Category = 'airborneAircraft' | 'groundAircraft' | 'armoredVehicle' | 'antiAircraft' | 'helicopter' | 'ship' | 'sam';
export const CATEGORIES: Category[] = ['airborneAircraft', 'groundAircraft', 'armoredVehicle', 'antiAircraft', 'helicopter', 'ship', 'sam'];

interface Sample { t: number; x: number; y: number; alt: number }
interface Obj {
  id: string; type: string; name: string; pilot: string; group: string; coalition: string;
  t0: number; tEnd: number | null; tr: Sample[]; x: number; y: number; alt: number;
}

export interface Kill { tSec: number; target: string; category: Category; weapon: string }
export interface Doubt {
  kind: 'unclaimed' | 'vanished' | 'unmatched' | 'unclassified';
  tSec: number | null; label: string; detail: string; category?: Category; pilot?: string;
}
export interface AnalyzedPilot {
  name: string; key: string; aircraft: string[]; deaths: number; survived: boolean;
  counts: Record<Category, number>; kills: Kill[];
}
export interface TacviewAnalysis {
  title: string; durationSec: number; pilots: AnalyzedPilot[]; doubts: Doubt[];
  stats: { targets: number; claimed: number; unclaimed: number; ignored: number };
}

const MAX_BYTES = 400 * 1024 * 1024;

/** Compara nomes ignorando prefixos de esquadrão ("HRP | "), maiúsculas, espaços e símbolos. */
export function nameKey(raw: string) {
  const tail = raw.includes('|') ? raw.slice(raw.lastIndexOf('|') + 1) : raw;
  return tail.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function readAcmiText(buf: Buffer): Promise<string> {
  if (buf.toString('ascii', 0, 2) !== 'PK') return buf.toString('utf8');
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(fail('VALIDATION', 'Não foi possível abrir o arquivo compactado do Tacview.'));
      let done = false;
      zip.on('error', () => { if (!done) { done = true; reject(fail('VALIDATION', 'O arquivo do Tacview está corrompido.')); } });
      zip.on('end', () => { if (!done) { done = true; reject(fail('VALIDATION', 'Não achei uma gravação .acmi dentro do arquivo.')); } });
      zip.on('entry', (entry: yauzl.Entry) => {
        if (done) return;
        if (entry.fileName.endsWith('/') || entry.uncompressedSize > MAX_BYTES) return zip.readEntry();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { done = true; return reject(fail('VALIDATION', 'Não foi possível ler a gravação.')); }
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('error', () => { done = true; reject(fail('VALIDATION', 'Não foi possível ler a gravação.')); });
          stream.on('end', () => { done = true; zip.close(); resolve(Buffer.concat(chunks).toString('utf8')); });
        });
      });
      zip.readEntry();
    });
  });
}

const AI_NAME = /^[\w ]+-\d+(-\d+)?$/; // "Aerial-2-1", "Yuk-1-1", "Ground-14-4": nomes automáticos de unidades da IA
const SAM_NAME = /SA-?\d+|S-?300|S-?75|S-?125|Kub|Osa\b|Tor\b|Buk|Strela|Patriot|Hawk|Rapier|Roland|NASAMS|Avenger|Stinger|Igla|Pantsir|9K\d+/i;

function categorize(o: Obj): Category | null {
  const t = o.type;
  if (t.includes('Watercraft') || t.includes('Sea')) return 'ship';
  if (t.includes('Air+Rotorcraft')) return maxSpeed(o) < 5 ? 'groundAircraft' : 'helicopter';
  if (t.includes('Air+FixedWing')) return maxSpeed(o) < 20 ? 'groundAircraft' : 'airborneAircraft';
  if (t.startsWith('Ground')) {
    if (t.includes('Static')) return null;
    if (SAM_NAME.test(o.name)) return 'sam';
    if (t.includes('AntiAircraft')) return 'antiAircraft';
    if (t.includes('Armor') || t.includes('Tank')) return 'armoredVehicle';
  }
  return null;
}

function speedBetween(a: Sample, b: Sample) {
  const dt = b.t - a.t;
  return dt > 0 ? Math.hypot(b.x - a.x, b.y - a.y, b.alt - a.alt) / dt : 0;
}
function maxSpeed(o: Obj) {
  let m = 0;
  for (let i = 1; i < o.tr.length; i++) m = Math.max(m, speedBetween(o.tr[i - 1], o.tr[i]));
  return m;
}
function lastSpeed(o: Obj) {
  const n = o.tr.length;
  return n >= 2 ? speedBetween(o.tr[Math.max(0, n - 4)], o.tr[n - 1]) : 0;
}
/** Posição do objeto no instante t (interpolação linear entre amostras; fora do intervalo, a mais próxima). */
function at(o: Obj, t: number): Sample | null {
  const tr = o.tr;
  if (!tr.length) return null;
  if (t <= tr[0].t) return tr[0];
  if (t >= tr[tr.length - 1].t) return tr[tr.length - 1];
  let lo = 0, hi = tr.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tr[mid].t <= t) lo = mid; else hi = mid; }
  const a = tr[lo], b = tr[hi], f = (t - a.t) / (b.t - a.t || 1);
  return { t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, alt: a.alt + (b.alt - a.alt) * f };
}
const dist = (a: Sample, b: Sample) => Math.hypot(a.x - b.x, a.y - b.y, a.alt - b.alt);
const radius = (type: string) => type.includes('Shell') ? 30 : type.includes('Bomb') ? 80 : type.includes('Rocket') ? 60 : type.includes('Missile') ? 120 : 80;
const emptyCounts = () => Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

function parse(text: string) {
  const objs = new Map<string, Obj>();
  let t = 0, last = 0, title = '', refLon = 0, refLat = 0;
  const lines = text.split('\n');
  for (let raw of lines) {
    if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
    if (!raw) continue;
    const c = raw.charCodeAt(0);
    if (c === 35) { t = parseFloat(raw.slice(1)); if (t > last) last = t; continue; }
    if (c === 45) { const o = objs.get(raw.slice(1)); if (o) o.tEnd = t; continue; }
    const comma = raw.indexOf(',');
    if (comma < 1) continue;
    const id = raw.slice(0, comma);
    const props = raw.slice(comma + 1).split(/(?<!\\),/);
    if (id === '0') {
      for (const p of props) {
        if (p.startsWith('Title=')) title = p.slice(6);
        else if (p.startsWith('ReferenceLongitude=')) refLon = parseFloat(p.slice(19));
        else if (p.startsWith('ReferenceLatitude=')) refLat = parseFloat(p.slice(18));
      }
      continue;
    }
    let o = objs.get(id);
    if (!o) {
      o = { id, type: '', name: '', pilot: '', group: '', coalition: '', t0: t, tEnd: null, tr: [], x: 0, y: 0, alt: 0 };
      objs.set(id, o);
    }
    for (const p of props) {
      const eq = p.indexOf('=');
      if (eq < 0) continue;
      const k = p.slice(0, eq), v = p.slice(eq + 1);
      if (k === 'T') {
        const f = v.split('|');
        const num = (i: number) => (f[i] !== undefined && f[i] !== '' ? parseFloat(f[i]) : NaN);
        const alt = num(2);
        if (!Number.isNaN(alt)) o.alt = alt;
        let x = NaN, y = NaN;
        if (f.length >= 9) { x = num(6); y = num(7); } else if (f.length === 5) { x = num(3); y = num(4); }
        if (Number.isNaN(x) || Number.isNaN(y)) {
          const lon = num(0), lat = num(1);
          if (!Number.isNaN(lon) && !Number.isNaN(lat)) { x = (lon - refLon) * 111320 * Math.cos((refLat * Math.PI) / 180); y = (lat - refLat) * 111320; }
        }
        if (!Number.isNaN(x)) o.x = x;
        if (!Number.isNaN(y)) o.y = y;
        o.tr.push({ t, x: o.x, y: o.y, alt: o.alt });
      } else if (k === 'Type') o.type = v;
      else if (k === 'Name') o.name = v;
      else if (k === 'Pilot') o.pilot = v;
      else if (k === 'Group') o.group = v;
      else if (k === 'Coalition') o.coalition = v;
    }
  }
  return { objs: [...objs.values()], title, end: last };
}

export async function analyzeTacview(buf: Buffer, knownNames: string[] = []): Promise<TacviewAnalysis> {
  const text = await readAcmiText(buf);
  if (!text.includes('FileType=text/acmi/tacview')) throw fail('VALIDATION', 'Esse não parece ser um arquivo do Tacview (.acmi).');
  const { objs, title, end } = parse(text);
  const known = new Set(knownNames.map(nameKey).filter(Boolean));

  const aircraft = objs.filter((o) => o.type.includes('Air+') && o.pilot);
  const isHuman = (o: Obj) => known.has(nameKey(o.pilot)) || !AI_NAME.test(o.pilot.trim());
  const humans = aircraft.filter(isHuman);
  if (!humans.length) throw fail('VALIDATION', 'Não encontrei pilotos humanos nessa gravação.');
  const votes = new Map<string, number>();
  for (const h of humans) votes.set(h.coalition, (votes.get(h.coalition) ?? 0) + 1);
  const side = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const foe = (c: string) => c !== side && c !== 'Neutrals' && c !== '';

  const weapons = objs.filter((o) => (o.type.startsWith('Weapon') || o.type.startsWith('Projectile')) && o.tEnd !== null && o.tr.length);
  const ours = weapons.filter((w) => w.coalition === side);
  const theirs = weapons.filter((w) => foe(w.coalition));
  const humanKeys = new Map<string, Obj[]>();
  for (const h of humans) { const k = nameKey(h.pilot); humanKeys.set(k, [...(humanKeys.get(k) ?? []), h]); }

  // dono de cada arma nossa: o piloto humano mais perto dela no instante do disparo
  const ownerOf = new Map<Obj, string>();
  for (const w of ours) {
    const p0 = w.tr[0];
    let best = 450, who = '';
    for (const h of humans) {
      if (h.t0 > p0.t + 1 || (h.tEnd !== null && h.tEnd < p0.t - 1)) continue;
      const hp = at(h, p0.t);
      if (!hp) continue;
      const d = dist(hp, p0);
      if (d < best) { best = d; who = nameKey(h.pilot); }
    }
    if (who) ownerOf.set(w, who);
  }

  const pilots = new Map<string, AnalyzedPilot>();
  for (const [key, list] of humanKeys) {
    pilots.set(key, { name: list[0].pilot, key, aircraft: [...new Set(list.map((o) => o.name))], deaths: 0, survived: true, counts: emptyCounts(), kills: [] });
  }
  const doubts: Doubt[] = [];
  const stats = { targets: 0, claimed: 0, unclaimed: 0, ignored: 0 };

  // alvos inimigos destruídos
  for (const o of objs) {
    if (!foe(o.coalition) || o.tEnd === null || !o.tr.length || o.type.includes('Weapon') || o.type.includes('Projectile')) continue;
    const category = categorize(o);
    if (!category) { if (o.type.startsWith('Ground') && !o.type.includes('Static')) stats.ignored++; continue; }
    if (o.tEnd >= end - 0.5) continue; // removido só no fim da gravação: não foi destruído
    if (o.type.includes('Air+') && lastSpeed(o) < 30 && o.tr[o.tr.length - 1].alt - o.tr[0].alt < 30 && maxSpeed(o) > 40) continue; // pousou e saiu
    stats.targets++;
    let hit: { w: Obj; d: number } | null = null;
    const tail = category === 'airborneAircraft' || category === 'helicopter' ? 45 : 12;
    for (const w of ours) {
      const tw = w.tEnd as number;
      if (tw > o.tEnd + 1.5 || tw < o.tEnd - tail) continue;
      const tp = at(o, tw), wp = w.tr[w.tr.length - 1];
      if (!tp) continue;
      const d = dist(tp, wp);
      if (d > radius(w.type)) continue;
      if (!hit || tw > (hit.w.tEnd as number) + 0.01 || (Math.abs(tw - (hit.w.tEnd as number)) <= 0.01 && d < hit.d)) hit = { w, d };
    }
    const owner = hit ? ownerOf.get(hit.w) : undefined;
    const label = `${o.name || o.type}`;
    if (hit && owner && pilots.has(owner)) {
      const p = pilots.get(owner) as AnalyzedPilot;
      p.counts[category]++;
      p.kills.push({ tSec: Math.round(o.tEnd), target: label, category, weapon: hit.w.name.replace(/^weapons\.(shells|missiles|bombs|nurs)\./, '') });
      stats.claimed++;
    } else {
      stats.unclaimed++;
      let near: { w: Obj; d: number } | null = null;
      for (const w of ours) {
        const tw = w.tEnd as number;
        if (Math.abs(tw - (o.tEnd as number)) > 60) continue;
        const tp = at(o, tw);
        if (!tp) continue;
        const d = dist(tp, w.tr[w.tr.length - 1]);
        if (!near || d < near.d) near = { w, d };
      }
      const nearOwner = near ? pilots.get(ownerOf.get(near.w) ?? '')?.name : undefined;
      const hint = near && nearOwner ? ` Arma mais próxima: ${near.w.name.replace(/^weapons\.(shells|missiles|bombs|nurs)\./, '')} de ${nearOwner}, a ${Math.round(near.d)} m.` : '';
      doubts.push({ kind: 'unclaimed', tSec: Math.round(o.tEnd), label, category, pilot: nearOwner, detail: `Alvo inimigo que sumiu sem arma de nenhum piloto por perto (queda sozinha, colisão ou dano de aliado).${hint}` });
    }
  }

  // sobrevivência dos pilotos
  for (const h of humans) {
    const p = pilots.get(nameKey(h.pilot)) as AnalyzedPilot;
    if (h.tEnd === null || h.tEnd >= end - 5) continue;
    const killedBy = theirs.some((w) => {
      const tw = w.tEnd as number;
      if (tw > (h.tEnd as number) + 1.5 || tw < (h.tEnd as number) - 45) return false;
      const hp = at(h, tw);
      return !!hp && dist(hp, w.tr[w.tr.length - 1]) <= radius(w.type);
    });
    const enemyJet = aircraft.some((e) => foe(e.coalition) && e.tEnd !== null && Math.abs(e.tEnd - (h.tEnd as number)) < 1.5 && (() => { const a = at(h, h.tEnd as number), b = at(e, e.tEnd as number); return !!a && !!b && dist(a, b) < 60; })());
    const landed = lastSpeed(h) < 35 && h.tr[h.tr.length - 1].alt - h.tr[0].alt < 40;
    if (killedBy || enemyJet) { p.deaths++; p.survived = false; }
    else if (!landed) {
      doubts.push({ kind: 'vanished', tSec: Math.round(h.tEnd), pilot: p.name, label: p.name,
        detail: 'Sumiu do mapa sem ação inimiga detectada (queda, saída do servidor ou colisão). Contado como sobreviveu; confirme.' });
    }
  }

  return { title, durationSec: Math.round(end), pilots: [...pilots.values()].sort((a, b) => a.name.localeCompare(b.name)), doubts: doubts.sort((a, b) => (a.tSec ?? 0) - (b.tSec ?? 0)), stats };
}
