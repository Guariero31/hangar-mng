// =====================================================================
//  MODO DEMONSTRAÇÃO
//  Simula o Supabase dentro do navegador, para testar as telas sem
//  configurar nada. Os dados ficam salvos só neste navegador.
//  Para zerar a demonstração, abra:  http://localhost:8000/?reset-demo
//  Para usar o banco de verdade, mude DEMO_MODE para false no config.js.
// =====================================================================

const DB_KEY = 'hangar-demo-db';
const SESSION_KEY = 'hangar-demo-session';
const ME = 'demo-voce';

function seed() {
  const day = 86400000, now = Date.now();
  const iso = (daysAgo) => new Date(now - daysAgo * day).toISOString();
  return {
    seq: 100,
    profiles: [
      { id: 'demo-viper', email: 'viper@exemplo.com', nickname: 'Viper_01', role: 'player', status: 'active', created_at: iso(12) },
      { id: 'demo-ghost', email: 'ghost@exemplo.com', nickname: 'Ghost', role: 'player', status: 'active', created_at: iso(8) },
      { id: 'demo-rookie', email: 'rookie@exemplo.com', nickname: 'Rookie', role: 'player', status: 'active', created_at: iso(4) },
      { id: 'demo-maverick', email: 'mav@exemplo.com', nickname: 'Maverick', role: 'player', status: 'banned', created_at: iso(2) },
    ],
    aircraft: [
      { id: 'tf51d', name: 'TF-51D Mustang', tier: 1, cost: 0, description: 'Treinador. Liberado para todos.', sort_order: 0, active: true },
      { id: 'l39',   name: 'L-39 Albatros',  tier: 1, cost: 50, description: null, sort_order: 1, active: true },
      { id: 'f5e',   name: 'F-5E Tiger II',  tier: 2, cost: 150, description: null, sort_order: 0, active: true },
      { id: 'mig21', name: 'MiG-21bis',      tier: 2, cost: 150, description: null, sort_order: 1, active: true },
      { id: 'f16c',  name: 'F-16C Viper',    tier: 3, cost: 400, description: null, sort_order: 0, active: true },
      { id: 'fa18c', name: 'F/A-18C Hornet', tier: 3, cost: 450, description: null, sort_order: 1, active: true },
      { id: 'mig29', name: 'MiG-29A',        tier: 3, cost: 400, description: null, sort_order: 2, active: true },
      { id: 'f15e',  name: 'F-15E Strike Eagle', tier: 4, cost: 800, description: null, sort_order: 0, active: true },
    ],
    aircraft_prereqs: [
      { aircraft_id: 'l39', requires_id: 'tf51d' },
      { aircraft_id: 'f5e', requires_id: 'l39' }, { aircraft_id: 'mig21', requires_id: 'l39' },
      { aircraft_id: 'f16c', requires_id: 'f5e' }, { aircraft_id: 'fa18c', requires_id: 'f5e' },
      { aircraft_id: 'mig29', requires_id: 'mig21' },
      { aircraft_id: 'f15e', requires_id: 'f16c' },
    ],
    user_aircraft: [
      { user_id: 'demo-viper', aircraft_id: 'tf51d', unlocked_at: iso(11), granted_by: null },
      { user_id: 'demo-viper', aircraft_id: 'l39', unlocked_at: iso(10), granted_by: null },
      { user_id: 'demo-viper', aircraft_id: 'f5e', unlocked_at: iso(6), granted_by: null },
      { user_id: 'demo-ghost', aircraft_id: 'tf51d', unlocked_at: iso(7), granted_by: null },
      { user_id: 'demo-ghost', aircraft_id: 'l39', unlocked_at: iso(5), granted_by: null },
    ],
    points_ledger: [
      { id: 1, user_id: 'demo-viper', amount: 300, reason: 'Op. Red Flag — noite 1', source: 'manual', created_by: null, created_at: iso(10) },
      { id: 2, user_id: 'demo-viper', amount: -50, reason: 'Desbloqueio: l39', source: 'unlock', created_by: 'demo-viper', created_at: iso(10) },
      { id: 3, user_id: 'demo-viper', amount: 350, reason: 'Campanha Syria — missão 3', source: 'manual', created_by: null, created_at: iso(7) },
      { id: 4, user_id: 'demo-viper', amount: -150, reason: 'Desbloqueio: f5e', source: 'unlock', created_by: 'demo-viper', created_at: iso(6) },
      { id: 5, user_id: 'demo-ghost', amount: 220, reason: 'Op. Red Flag — noite 1', source: 'manual', created_by: null, created_at: iso(7) },
      { id: 6, user_id: 'demo-ghost', amount: -50, reason: 'Desbloqueio: l39', source: 'unlock', created_by: 'demo-ghost', created_at: iso(5) },
      { id: 7, user_id: 'demo-rookie', amount: 80, reason: 'Treinamento de pouso', source: 'manual', created_by: null, created_at: iso(3) },
      { id: 8, user_id: 'demo-maverick', amount: 500, reason: 'Op. Red Flag — noite 1', source: 'manual', created_by: null, created_at: iso(2) },
    ],
    dcs_links: [{ user_id: 'demo-viper', ucid: 'demo-ucid-1', linked_at: iso(11) }],
    admin_audit_log: [],
  };
}

if (new URLSearchParams(location.search).has('reset-demo')) {
  try { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); } catch {}
}

let memorySession = null;
let db = load();
function load() { try { return JSON.parse(localStorage.getItem(DB_KEY)) || seed(); } catch { return seed(); } }
function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch {} }
function getSessionObj() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return memorySession; }
}
function setSessionObj(s) {
  memorySession = s;
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch {}
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const uid = () => getSessionObj()?.user?.id ?? null;
const me = () => db.profiles.find((p) => p.id === uid());
const isAdmin = () => me()?.role === 'admin' && me()?.status === 'active';
const balanceOf = (u) => db.points_ledger.filter((l) => l.user_id === u).reduce((s, l) => s + l.amount, 0);
const nowIso = () => new Date().toISOString();
const ok = (data) => ({ data: clone(data ?? null), error: null });
const fail = (code) => ({ data: null, error: { message: code } });
const audit = (action, target, details) =>
  db.admin_audit_log.push({ id: ++db.seq, admin_id: uid(), action, target_user_id: target, details, created_at: nowIso() });

// Tabelas vistas pelo usuário logado (imita as regras de segurança do banco)
function tableRows(table) {
  if (!uid()) return [];
  const own = (key) => (r) => isAdmin() || r[key] === uid();
  switch (table) {
    case 'profiles':        return db.profiles.filter(own('id'));
    case 'user_aircraft':   return db.user_aircraft.filter(own('user_id'));
    case 'points_ledger':   return db.points_ledger.filter(own('user_id'));
    case 'dcs_links':       return db.dcs_links.filter(own('user_id'));
    case 'admin_audit_log': return isAdmin() ? db.admin_audit_log : [];
    case 'player_balances': return db.profiles.filter(own('id')).map((p) => ({ user_id: p.id, balance: balanceOf(p.id) }));
    default:                return db[table] || [];
  }
}

function from(table) {
  let filters = [], sorts = [], max = Infinity, single = false;
  const builder = {
    select() { return builder; },
    eq(col, val) { filters.push((r) => r[col] === val); return builder; },
    order(col, opts = {}) { sorts.push([col, opts.ascending === false ? -1 : 1]); return builder; },
    limit(n) { max = n; return builder; },
    single() { single = true; return builder; },
    then(resolve, reject) {
      try {
        let rows = tableRows(table).filter((r) => filters.every((f) => f(r)));
        rows = [...rows].sort((a, b) => {
          for (const [c, dir] of sorts) { if (a[c] < b[c]) return -dir; if (a[c] > b[c]) return dir; }
          return 0;
        }).slice(0, max);
        if (single) resolve(rows.length ? ok(rows[0]) : fail('Registro não encontrado'));
        else resolve(ok(rows));
      } catch (e) { reject(e); }
    },
  };
  return builder;
}

const RESERVED = ['admin', 'administrador', 'adm', 'moderador', 'mod', 'staff', 'suporte', 'system', 'server'];
const NICK = /^[A-Za-z0-9_]{3,16}$/;

const functions = {
  nickname_available({ p_nickname }) {
    const n = (p_nickname || '').trim();
    return ok(NICK.test(n) && !db.profiles.some((p) => p.nickname?.toLowerCase() === n.toLowerCase()));
  },
  set_nickname({ p_nickname }) {
    if (!uid()) return fail('NOT_AUTHENTICATED');
    const n = (p_nickname || '').trim();
    if (!NICK.test(n)) return fail('NICKNAME_INVALID');
    if (RESERVED.includes(n.toLowerCase())) return fail('NICKNAME_RESERVED');
    if (me().nickname) return fail('NICKNAME_ALREADY_SET');
    if (db.profiles.some((p) => p.nickname?.toLowerCase() === n.toLowerCase())) return fail('NICKNAME_TAKEN');
    me().nickname = n;
    return ok(null);
  },
  unlock_aircraft({ p_aircraft_id }) {
    const u = uid();
    if (!u) return fail('NOT_AUTHENTICATED');
    if (me().status !== 'active') return fail('PLAYER_NOT_ACTIVE');
    const ac = db.aircraft.find((a) => a.id === p_aircraft_id && a.active);
    if (!ac) return fail('AIRCRAFT_NOT_FOUND');
    const owned = new Set(db.user_aircraft.filter((x) => x.user_id === u).map((x) => x.aircraft_id));
    if (owned.has(ac.id)) return fail('ALREADY_UNLOCKED');
    if (db.aircraft_prereqs.some((p) => p.aircraft_id === ac.id && !owned.has(p.requires_id))) return fail('PREREQS_MISSING');
    const bal = balanceOf(u);
    if (bal < ac.cost) return fail('INSUFFICIENT_POINTS');
    if (ac.cost > 0) db.points_ledger.push({ id: ++db.seq, user_id: u, amount: -ac.cost, reason: 'Desbloqueio: ' + ac.id, source: 'unlock', created_by: u, created_at: nowIso() });
    db.user_aircraft.push({ user_id: u, aircraft_id: ac.id, unlocked_at: nowIso(), granted_by: null });
    return ok(bal - ac.cost);
  },
  admin_add_points({ p_user, p_amount, p_reason }) {
    if (!isAdmin()) return fail('FORBIDDEN');
    if (!p_amount) return fail('AMOUNT_ZERO');
    if (!p_reason || !p_reason.trim()) return fail('REASON_REQUIRED');
    if (!db.profiles.some((p) => p.id === p_user)) return fail('USER_NOT_FOUND');
    db.points_ledger.push({ id: ++db.seq, user_id: p_user, amount: p_amount, reason: p_reason.trim(), source: 'manual', created_by: uid(), created_at: nowIso() });
    audit('add_points', p_user, { amount: p_amount, reason: p_reason.trim() });
    return ok(balanceOf(p_user));
  },
  admin_grant_aircraft({ p_user, p_aircraft_id }) {
    if (!isAdmin()) return fail('FORBIDDEN');
    if (!db.user_aircraft.some((x) => x.user_id === p_user && x.aircraft_id === p_aircraft_id)) {
      db.user_aircraft.push({ user_id: p_user, aircraft_id: p_aircraft_id, unlocked_at: nowIso(), granted_by: uid() });
    }
    audit('grant_aircraft', p_user, { aircraft: p_aircraft_id });
    return ok(null);
  },
  admin_revoke_aircraft({ p_user, p_aircraft_id, p_refund }) {
    if (!isAdmin()) return fail('FORBIDDEN');
    const i = db.user_aircraft.findIndex((x) => x.user_id === p_user && x.aircraft_id === p_aircraft_id);
    if (i < 0) return fail('NOT_UNLOCKED');
    db.user_aircraft.splice(i, 1);
    const cost = db.aircraft.find((a) => a.id === p_aircraft_id)?.cost ?? 0;
    if (p_refund && cost > 0) db.points_ledger.push({ id: ++db.seq, user_id: p_user, amount: cost, reason: 'Reembolso: ' + p_aircraft_id, source: 'refund', created_by: uid(), created_at: nowIso() });
    audit('revoke_aircraft', p_user, { aircraft: p_aircraft_id, refund: !!p_refund });
    return ok(null);
  },
  admin_set_status({ p_user, p_status }) {
    if (!isAdmin()) return fail('FORBIDDEN');
    if (p_user === uid()) return fail('CANNOT_CHANGE_OWN_STATUS');
    const p = db.profiles.find((x) => x.id === p_user);
    if (!p) return fail('USER_NOT_FOUND');
    p.status = p_status;
    audit('set_status', p_user, { status: p_status });
    return ok(null);
  },
  admin_list_players({ p_search, p_limit = 50, p_offset = 0 }) {
    if (!isAdmin()) return fail('FORBIDDEN');
    const s = (p_search || '').toLowerCase();
    const list = db.profiles
      .filter((p) => !s || (p.nickname || '').toLowerCase().includes(s) || p.email.toLowerCase().includes(s))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return ok(list.slice(p_offset, p_offset + p_limit).map((p) => ({
      user_id: p.id, nickname: p.nickname, email: p.email, role: p.role, status: p.status,
      balance: balanceOf(p.id),
      total_earned: db.points_ledger.filter((l) => l.user_id === p.id && l.amount > 0 && ['manual', 'server'].includes(l.source)).reduce((t, l) => t + l.amount, 0),
      aircraft_count: db.user_aircraft.filter((x) => x.user_id === p.id).length,
      dcs_linked: db.dcs_links.some((d) => d.user_id === p.id),
      created_at: p.created_at,
      total_count: list.length,
    })));
  },
};

function showBadge() {
  if (document.getElementById('demo-badge')) return;
  const el = document.createElement('a');
  el.id = 'demo-badge';
  el.href = new URL('../index.html?reset-demo', import.meta.url).href;
  el.title = 'Clique para zerar os dados da demonstração';
  el.textContent = 'MODO DEMO · zerar';
  el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:100;padding:6px 10px;border-radius:4px;' +
    'font:500 11px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;background:#62aee8;color:#04121e;text-decoration:none;';
  document.body.appendChild(el);
}

export function createClient() {
  showBadge();
  return {
    auth: {
      async getSession() { return { data: { session: getSessionObj() }, error: null }; },
      async signInWithOAuth({ options } = {}) {
        // Simula o retorno do Google com um usuário de demonstração (que é admin)
        if (!db.profiles.some((p) => p.id === ME)) {
          db.profiles.push({ id: ME, email: 'voce@demo.local', nickname: null, role: 'admin', status: 'active', created_at: nowIso() });
          db.points_ledger.push({ id: ++db.seq, user_id: ME, amount: 200, reason: 'Bônus de boas-vindas (demo)', source: 'manual', created_by: null, created_at: nowIso() });
          save();
        }
        setSessionObj({ user: { id: ME, email: 'voce@demo.local' } });
        location.href = options?.redirectTo || location.href;
        return { data: {}, error: null };
      },
      async signOut() { setSessionObj(null); return { error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from,
    async rpc(name, args = {}) {
      const fn = functions[name];
      if (!fn) return fail('Função desconhecida: ' + name);
      const result = fn(args);
      save();
      return result;
    },
  };
}
