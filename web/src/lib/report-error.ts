// Manda para o servidor os erros que acontecem no navegador do piloto (para aparecerem no painel de erros).
// Nunca lança erro e nunca reporta o próprio envio, para não entrar em laço.
const sent = new Set<string>();
const MAX_PER_SESSION = 10;

export function reportClientError(message: string, stack?: string) {
  try {
    const key = `${message}|${(stack ?? '').split('\n')[1] ?? ''}`;
    if (sent.has(key) || sent.size >= MAX_PER_SESSION) return;
    sent.add(key);
    void fetch('/api/client-errors', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.slice(0, 500), stack: stack?.slice(0, 4000), route: window.location.pathname.slice(0, 200) }),
    }).catch(() => undefined);
  } catch { /* registrar erro nunca pode causar outro erro */ }
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => {
    // erros de carregamento de imagem/script de terceiros não trazem mensagem útil
    if (!e.message || e.message === 'Script error.') return;
    reportClientError(e.message, e.error instanceof Error ? e.error.stack : undefined);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    // erros de rede/validação da API já são tratados na tela; o servidor registra os 500
    if (r && typeof r === 'object' && 'status' in r) return;
    reportClientError(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
  });
}
