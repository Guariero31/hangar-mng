import { config } from '../config.js';

export class DiscordDeliveryError extends Error {
  constructor(message: string, public retryAfterSeconds: number | null) { super(message); }
}

export interface DiscordPayload {
  username: string;
  allowed_mentions: { parse: string[] };
  embeds: { title: string; description: string; color: number; url?: string; image?: { url: string }; fields?: { name: string; value: string; inline?: boolean }[]; footer?: { text: string } }[];
}

export interface DiscordImage { filename: string; mime: string; content: Uint8Array }

export async function sendDiscord(payload: DiscordPayload, image?: DiscordImage): Promise<string> {
  // Only Discord webhook endpoints are allowed; never log tokens or response bodies.
  if (!/^https:\/\/discord\.com\/api\/(?:v10\/)?webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(config.discordWebhookUrl)) {
    throw new DiscordDeliveryError('Webhook do Discord ausente ou inválido.', null);
  }
  let requestBody: string | FormData = JSON.stringify(payload);
  if (image) {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ ...payload, embeds: payload.embeds.map((embed, index) => index === 0 ? { ...embed, image: { url: `attachment://${image.filename}` } } : embed), attachments: [{ id: 0, filename: image.filename }] }));
    form.append('files[0]', new Blob([new Uint8Array(image.content)], { type: image.mime }), image.filename);
    requestBody = form;
  }
  let response: Response;
  try {
    response = await fetch(`${config.discordWebhookUrl}?wait=true`, {
      method: 'POST', redirect: 'error', headers: image ? undefined : { 'Content-Type': 'application/json' },
      body: requestBody, signal: AbortSignal.timeout(image ? 30_000 : 10_000),
    });
  } catch { throw new DiscordDeliveryError('Falha de conexão com o Discord.', 60); }
  if (!response.ok) {
    let retryAfter = 60;
    if (response.status === 429) {
      const body: unknown = await response.json().catch(() => null);
      if (body && typeof body === 'object' && 'retry_after' in body && typeof body.retry_after === 'number' && Number.isFinite(body.retry_after)) {
        retryAfter = Math.min(86400, Math.max(1, Math.ceil(body.retry_after)));
      }
    }
    throw new DiscordDeliveryError(`Discord HTTP ${response.status}.`, response.status === 429 || response.status >= 500 ? retryAfter : null);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string') {
    throw new DiscordDeliveryError('Discord não confirmou o identificador da mensagem.', 60);
  }
  return body.id;
}

export function missionDiscordPayload(mission: { id: string; title: string; startsAt: Date; mapName: string; copies: number }): DiscordPayload {
  const url = `${config.appUrl}/missoes/${encodeURIComponent(mission.id)}`;
  const when = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(mission.startsAt));
  return {
    username: 'Hangar MNG', allowed_mentions: { parse: [] },
    embeds: [{ title: `Nova missão · ${mission.title}`, url, color: 0xffc24a,
      description: `Inscrições abertas! Escolha sua aeronave e prepare-se para voar com o esquadrão.\n\n[Ver missão e inscrever-se](${url})`,
      fields: [{ name: 'Data e horário de Brasília', value: when }, { name: 'Mapa', value: mission.mapName || 'A definir', inline: true },
        ...(mission.copies > 1 ? [{ name: 'Recorrência', value: `Semanal · ${mission.copies} operações`, inline: true }] : [])],
      footer: { text: 'Hangar MNG · Esquadrão virtual' },
    }],
  };
}
