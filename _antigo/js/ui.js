// Pequenos utilitários de interface compartilhados entre as páginas.
import { SITE_NAME } from '../config.js';
import { urlOf, signOut } from './auth.js';
import { getMyBalance } from './api.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const fmtPoints = (n) => new Intl.NumberFormat('pt-BR').format(n ?? 0);
export const fmtDate = (d) => new Date(d).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
});

export function applySiteName() {
  document.querySelectorAll('[data-site-name]').forEach((el) => { el.textContent = SITE_NAME; });
  document.title = document.title.replace('{site}', SITE_NAME);
}

let toastTimer;
export function toast(message, kind = 'ok') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

// Barra superior das páginas internas
export async function renderTopbar(profile, active) {
  const bar = $('#topbar');
  if (!bar) return;
  const isAdmin = profile.role === 'admin';
  bar.innerHTML = `
    <a class="brand" href="${urlOf('home')}"><span class="brand-mark"></span><span data-site-name></span></a>
    <nav class="nav">
      <a href="${urlOf('home')}" class="${active === 'home' ? 'active' : ''}">Árvore de aeronaves</a>
      ${isAdmin ? `<a href="${urlOf('admin')}" class="${active === 'admin' ? 'active' : ''}">Painel admin</a>` : ''}
    </nav>
    <div class="pilot">
      <span class="chip points" title="Seu saldo de pontos"><span class="chip-label">PTS</span><span id="my-balance">…</span></span>
      <span class="callsign">${esc(profile.nickname)}</span>
      <button class="btn ghost sm" id="logout">Sair</button>
    </div>`;
  applySiteName();
  $('#logout').addEventListener('click', signOut);
  refreshBalance();
}

export async function refreshBalance() {
  const el = $('#my-balance');
  if (!el) return;
  try { el.textContent = fmtPoints(await getMyBalance()); } catch { el.textContent = '—'; }
}
