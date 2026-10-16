import { useState } from 'react';

type Theme = 'dark' | 'light';
const read = (): Theme => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

/** Botão do topo: alterna entre o tema escuro e o claro e lembra a escolha neste navegador */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(read);
  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f4f1e8' : '#0a0a08');
    try { localStorage.setItem('theme', next); } catch { /* sem armazenamento: vale só nesta visita */ }
    setTheme(next);
  }
  const toLight = theme === 'dark';
  return (
    <button type="button" className="theme-btn" onClick={toggle}
      title={toLight ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      aria-label={toLight ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}>
      {toLight ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
      )}
    </button>
  );
}
