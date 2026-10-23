import sharp from 'sharp';
import { config } from '../config.js';
import { db } from '../db.js';
import { UUID_ADDRESS } from './mission-slug.js';
import { getMissionImageFile } from './mission-files.js';

interface MissionPreview {
  id: string;
  slug: string | null;
  title: string;
  startsAt: Date;
  mapName: string;
  status: 'scheduled' | 'closed' | 'cancelled';
  imageAssetId: string | null;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));

// Only the invitation fields are public; briefing, signups and reports still require login.
export async function getMissionPreview(address: string): Promise<MissionPreview | null> {
  if (!/^[a-z0-9-]{1,240}$/i.test(address)) return null;
  const { rows } = await db.query<MissionPreview>(
    `select id, slug, title, starts_at as "startsAt", map_name as "mapName", status, image_asset_id as "imageAssetId"
     from missions where ${UUID_ADDRESS.test(address) ? 'id' : 'slug'}=$1`, [address]);
  return rows[0] ?? null;
}

export function renderMissionPreview(html: string, mission: MissionPreview): string {
  const title = `${mission.title} · Hangar MNG`;
  const when = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(mission.startsAt));
  const status = { scheduled: 'Inscrições abertas.', closed: 'Operação encerrada.', cancelled: 'Operação cancelada.' }[mission.status];
  const description = [`${when} · Horário de Brasília`, mission.mapName ? `Mapa: ${mission.mapName}` : '', status].filter(Boolean).join(' · ');
  const address = encodeURIComponent(mission.slug || mission.id);
  const url = `${config.appUrl}/missoes/${address}`;
  const image = mission.imageAssetId
    ? `${config.appUrl}/api/mission-previews/${address}/image.jpg?image=${encodeURIComponent(mission.imageAssetId)}`
    : `${config.appUrl}/mng-logo.png`;
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    ...Object.entries({ 'og:type': 'website', 'og:site_name': 'Hangar MNG', 'og:locale': 'pt_BR',
      'og:title': title, 'og:description': description, 'og:url': url, 'og:image': image,
      'og:image:alt': `Capa da missão ${mission.title}`,
      ...(mission.imageAssetId ? { 'og:image:type': 'image/jpeg', 'og:image:width': '1200', 'og:image:height': '630' } : {}),
    }).map(([property, value]) => `<meta property="${property}" content="${escapeHtml(value)}">`),
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
  ].join('\n');
  // A replacement callback keeps literal dollar signs in mission names intact.
  return html.replace(/<title>[^<]*<\/title>/i, '').replace(/<head>/i, () => `<head>\n${tags}`);
}

// Asset IDs are immutable; a small bounded cache avoids repeated image processing.
const images = new Map<string, Buffer>();
export async function getMissionPreviewImage(mission: MissionPreview): Promise<Buffer | null> {
  if (!mission.imageAssetId) return null;
  const cached = images.get(mission.imageAssetId);
  if (cached) return cached;
  const file = await getMissionImageFile(mission.imageAssetId);
  if (!file) return null;
  const content = await file.read();
  let image = Buffer.alloc(0);
  for (const quality of [80, 60, 40, 20]) {
    image = await sharp(content, { limitInputPixels: 40_000_000 }).rotate()
      .resize(1200, 630, { fit: 'contain', background: '#0a0a08' }).flatten({ background: '#0a0a08' })
      .jpeg({ quality }).toBuffer();
    if (image.length <= 300_000) break;
  }
  if (images.size >= 20) images.delete(images.keys().next().value as string);
  images.set(mission.imageAssetId, image);
  return image;
}
