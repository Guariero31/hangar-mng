// Sessão, guardas de rota e navegação entre as páginas.
import { supabase } from './supabase.js';

// Raiz do site, calculada a partir deste arquivo (funciona em qualquer subpasta)
const ROOT = new URL('../', import.meta.url);

export const PAGES = {
  login:    'index.html',
  nickname: 'nickname.html',
  home:     'techtree/index.html',   // troque aqui se a sua Tech Tree ficar em outro caminho
  admin:    'admin.html',
};

export const urlOf = (page) => new URL(PAGES[page], ROOT).href;
export const go = (page) => location.replace(urlOf(page));

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Perfil do usuário logado (ou null se não houver sessão)
export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', session.user.id).single();
  if (error) throw error;
  return data;
}

// Decide para onde mandar um usuário logado
export function routeFor(profile) {
  if (!profile.nickname) return 'nickname';
  return 'home';
}

// Use no topo de cada página protegida.
// Retorna o perfil, ou null se o usuário foi redirecionado.
export async function requireProfile({ needNickname = true, admin = false } = {}) {
  let profile = null;
  try { profile = await getProfile(); } catch (e) { console.error(e); }

  if (!profile) { go('login'); return null; }
  if (profile.status === 'banned') {
    await supabase.auth.signOut();
    location.replace(urlOf('login') + '?banned=1');
    return null;
  }
  if (needNickname && !profile.nickname) { go('nickname'); return null; }
  if (admin && profile.role !== 'admin') { go('home'); return null; }
  return profile;
}

export function loginWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: urlOf('login') },
  });
}

export async function signOut() {
  await supabase.auth.signOut();
  go('login');
}
