// =====================================================================
//  API do jogo — é aqui que a sua Tech Tree se conecta.
//
//  import { getTechTreeState, unlockAircraft } from '../js/api.js';
//
//  const state = await getTechTreeState();
//    state.balance                 -> saldo de pontos do jogador
//    state.aircraft[i].id / name / tier / cost / description
//    state.aircraft[i].requires    -> ids dos pré-requisitos
//    state.aircraft[i].unlocked    -> já liberado?
//    state.aircraft[i].available   -> pré-requisitos ok e ainda não liberado
//    state.aircraft[i].affordable  -> disponível e com saldo suficiente
//
//  const novoSaldo = await unlockAircraft('f16c');  // lança Error com mensagem em português
// =====================================================================
import { supabase } from './supabase.js';
import { getSession } from './auth.js';

const MESSAGES = {
  NOT_AUTHENTICATED:        'Sua sessão expirou. Entre novamente.',
  FORBIDDEN:                'Você não tem permissão para isso.',
  NICKNAME_INVALID:         'Use de 3 a 16 caracteres: letras, números ou _.',
  NICKNAME_RESERVED:        'Esse nickname é reservado.',
  NICKNAME_TAKEN:           'Esse nickname já está em uso.',
  NICKNAME_ALREADY_SET:     'Você já escolheu um nickname.',
  PLAYER_NOT_ACTIVE:        'Sua conta está suspensa.',
  AIRCRAFT_NOT_FOUND:       'Aeronave não encontrada.',
  ALREADY_UNLOCKED:         'Essa aeronave já está liberada.',
  PREREQS_MISSING:          'Libere os pré-requisitos primeiro.',
  INSUFFICIENT_POINTS:      'Pontos insuficientes.',
  AMOUNT_ZERO:              'Informe uma quantidade diferente de zero.',
  REASON_REQUIRED:          'Informe o motivo.',
  USER_NOT_FOUND:           'Jogador não encontrado.',
  NOT_UNLOCKED:             'O jogador não tem essa aeronave.',
  CANNOT_CHANGE_OWN_STATUS: 'Você não pode banir a si mesmo.',
};

export function errorMessage(err) {
  const code = (err?.message || '').trim();
  return MESSAGES[code] || 'Algo deu errado. Tente novamente.';
}

// Chama uma função do banco e converte o erro em mensagem amigável
export async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) { console.error(fn, error); throw new Error(errorMessage(error)); }
  return data;
}

async function q(promise) {
  const { data, error } = await promise;
  if (error) { console.error(error); throw new Error(errorMessage(error)); }
  return data;
}

export async function getMyBalance() {
  const session = await getSession();
  const rows = await q(supabase.from('player_balances').select('balance').eq('user_id', session.user.id));
  return rows[0]?.balance ?? 0;
}

export async function getTechTreeState() {
  const session = await getSession();
  const uid = session.user.id;

  const [aircraft, prereqs, owned, balance] = await Promise.all([
    q(supabase.from('aircraft').select('*').eq('active', true).order('tier').order('sort_order')),
    q(supabase.from('aircraft_prereqs').select('aircraft_id, requires_id')),
    q(supabase.from('user_aircraft').select('aircraft_id, unlocked_at').eq('user_id', uid)),
    getMyBalance(),
  ]);

  const ownedSet = new Set(owned.map((o) => o.aircraft_id));
  return {
    balance,
    aircraft: aircraft.map((a) => {
      const requires = prereqs.filter((p) => p.aircraft_id === a.id).map((p) => p.requires_id);
      const unlocked = ownedSet.has(a.id);
      const available = !unlocked && requires.every((r) => ownedSet.has(r));
      return { ...a, requires, unlocked, available, affordable: available && balance >= a.cost };
    }),
  };
}

export const unlockAircraft = (aircraftId) => rpc('unlock_aircraft', { p_aircraft_id: aircraftId });

export async function getMyHistory(limit = 50) {
  const session = await getSession();
  return q(supabase.from('points_ledger')
    .select('amount, reason, source, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(limit));
}

// ---------------------------------------------------------------------
//  Funções de admin
// ---------------------------------------------------------------------
export const admin = {
  listPlayers: (search = null, limit = 200, offset = 0) =>
    rpc('admin_list_players', { p_search: search || null, p_limit: limit, p_offset: offset }),
  addPoints: (userId, amount, reason) =>
    rpc('admin_add_points', { p_user: userId, p_amount: amount, p_reason: reason }),
  grantAircraft: (userId, aircraftId) =>
    rpc('admin_grant_aircraft', { p_user: userId, p_aircraft_id: aircraftId }),
  revokeAircraft: (userId, aircraftId, refund) =>
    rpc('admin_revoke_aircraft', { p_user: userId, p_aircraft_id: aircraftId, p_refund: refund }),
  setStatus: (userId, status) =>
    rpc('admin_set_status', { p_user: userId, p_status: status }),

  async playerDetail(userId) {
    const [profile, bal, owned, ledger, catalog] = await Promise.all([
      q(supabase.from('profiles').select('*').eq('id', userId).single()),
      q(supabase.from('player_balances').select('balance').eq('user_id', userId)),
      q(supabase.from('user_aircraft').select('aircraft_id, unlocked_at, granted_by').eq('user_id', userId)),
      q(supabase.from('points_ledger').select('id, amount, reason, source, created_at')
          .eq('user_id', userId).order('created_at', { ascending: false }).limit(200)),
      q(supabase.from('aircraft').select('id, name, tier, cost').order('tier').order('sort_order')),
    ]);
    return { profile, balance: bal[0]?.balance ?? 0, owned, ledger, catalog };
  },
};
