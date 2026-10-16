export const SITE_NAME = 'Hangar MNG';

const numberFmt = new Intl.NumberFormat('pt-BR');
export const fmtPoints = (n: number | null | undefined) => numberFmt.format(n ?? 0);

export const fmtSigned = (n: number) => `${n > 0 ? '+' : ''}${fmtPoints(n)}`;

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "agora", "há 3 h", "há 5 dias"… */
export function fmtAgo(d: string | Date | null | undefined): string {
  if (!d) return 'nunca';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 90) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  const days = Math.round(s / 86400);
  if (days < 60) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
  return `há ${Math.round(days / 30)} meses`;
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'admin',
  unlock: 'desbloqueio',
  refund: 'reembolso',
  server: 'servidor DCS',
};
