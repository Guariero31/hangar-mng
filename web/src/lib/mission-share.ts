import type { Mission } from '../api/types';

export function missionShare(mission: Pick<Mission, 'id' | 'title' | 'startsAt' | 'mapName' | 'status'>, origin: string) {
  const url = new URL(`/missoes/${encodeURIComponent(mission.id)}`, origin).href;
  const when = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(mission.startsAt));
  const status = { scheduled: 'Inscrições abertas no Hangar MNG.', closed: 'Operação encerrada.', cancelled: 'Operação cancelada.' }[mission.status];
  const text = [`Hangar MNG · ${mission.title}`, `${when} · Horário de Brasília`, mission.mapName ? `Mapa: ${mission.mapName}` : '', status].filter(Boolean).join('\n');
  const invitation = `${text}\n\n${url}`;
  return { url, text, invitation, whatsappUrl: `https://wa.me/?text=${encodeURIComponent(invitation)}` };
}
