import { config } from '../config.js';
import { db, type Queryable } from '../db.js';
import { DiscordDeliveryError, missionDiscordPayload, sendDiscord, type DiscordImage } from './discord-webhook.js';
import { getMissionImageFile } from './mission-files.js';

async function missionImage(assetId: string | null): Promise<DiscordImage | undefined> {
  if (!assetId) return;
  const file = await getMissionImageFile(assetId);
  // Keep within Discord's default per-file limit without blocking the announcement.
  if (!file || file.size > 10 * 1024 * 1024) return;
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const extension = extensions[file.mime];
  if (!extension) return;
  return { filename: `missao.${extension}`, mime: file.mime, content: await file.read() };
}

export async function enqueueMissionDiscord(query: Queryable, missionId: string, copies: number) {
  if (!config.discordNotificationsEnabled || !config.discordWebhookUrl) return;
  await query.query('insert into discord_notifications (mission_id, copies) values ($1, $2) on conflict (mission_id) do nothing', [missionId, copies]);
}

export async function deliverDiscordNotifications(shouldStop: () => boolean = () => false) {
  if (!config.discordNotificationsEnabled || !config.discordWebhookUrl) return;
  const { rows: blocked } = await db.query("select 1 from discord_notifications where state='pending' and last_error='Discord HTTP 429.' and next_attempt_at>now() limit 1");
  if (blocked.length) return;
  for (let index = 0; index < 10 && !shouldStop(); index++) {
    // A short lease lets another process recover jobs after a restart.
    const { rows: [job] } = await db.query<{ mission_id: string; attempts: number; copies: number }>(
      `update discord_notifications set attempts=attempts+1, next_attempt_at=now()+interval '2 minutes'
       where mission_id=(select mission_id from discord_notifications where state='pending' and next_attempt_at<=now()
         order by next_attempt_at limit 1 for update skip locked) returning mission_id, attempts, copies`);
    if (!job) return;
    const { rows: [mission] } = await db.query<{ id: string; slug: string | null; title: string; startsAt: Date; mapName: string; status: string; imageAssetId: string | null }>(
      'select id, slug, title, starts_at as "startsAt", map_name as "mapName", status, image_asset_id as "imageAssetId" from missions where id=$1', [job.mission_id]);
    if (!mission || mission.status !== 'scheduled' || new Date(mission.startsAt).getTime() <= Date.now()) {
      await db.query("update discord_notifications set state='skipped' where mission_id=$1", [job.mission_id]);
      continue;
    }
    try {
      const image = await missionImage(mission.imageAssetId);
      const messageId = await sendDiscord(missionDiscordPayload({ ...mission, copies: job.copies }), image);
      await db.query("update discord_notifications set state='sent', message_id=$2, sent_at=now(), last_error=null where mission_id=$1", [job.mission_id, messageId]);
    } catch (exception) {
      const failure = exception instanceof DiscordDeliveryError ? exception : new DiscordDeliveryError('Falha ao concluir envio ao Discord.', 60);
      const retry = failure.retryAfterSeconds !== null && job.attempts < 8;
      const delay = Math.max(failure.retryAfterSeconds ?? 60, Math.min(3600, 30 * 2 ** (job.attempts - 1)));
      await db.query("update discord_notifications set state=$2, last_error=$3, next_attempt_at=now()+($4 * interval '1 second') where mission_id=$1",
        [job.mission_id, retry ? 'pending' : 'failed', failure.message, delay]);
      console.warn(`[Discord] ${failure.message} ${retry ? 'Nova tentativa agendada.' : 'Envio interrompido.'}`);
      // Respect channel rate limits before attempting another message.
      return;
    }
  }
}

export function startDiscordNotifications() {
  let stopped = false;
  let pending: Promise<void> | undefined;
  const run = () => {
    if (stopped || pending) return;
    pending = deliverDiscordNotifications(() => stopped)
      .catch(() => { console.error('[Discord] Falha ao processar fila de avisos.'); })
      .finally(() => { pending = undefined; });
  };
  const timer = setInterval(run, 15_000);
  timer.unref();
  run();
  return async () => { stopped = true; clearInterval(timer); await pending; };
}
