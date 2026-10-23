import { db } from '../db.js';
import { fail } from '../errors.js';
import { describeAsset } from './mission-files.js';

export async function listMusic() {
  const { rows } = await db.query<{ id: string; kind: 'audio'; name: string; entrypoint: string; uses: number; size: number }>(
    `select a.id,a.kind,a.name,a.entrypoint,
       (select count(*)::int from missions m where m.audio_asset_id=a.id) as uses,
       case when f.chunks>0 then (f.chunks-1)*262144+coalesce(octet_length(c.content),0) else 0 end as size
     from mission_assets a join mission_asset_files f on f.asset_id=a.id and f.path=a.entrypoint
     left join mission_asset_chunks c on c.asset_id=f.asset_id and c.path=f.path and c.chunk_index=f.chunks-1
     where a.kind='audio' order by lower(a.name), a.id`);
  return rows.map(row => ({ ...describeAsset(row), uses: row.uses, size: row.size }));
}

export async function deleteMusic(id: string) {
  try {
    await db.tx(async query => {
      const { rows } = await query.query("select id from mission_assets where id=$1 and kind='audio' for update", [id]);
      if (!rows.length) throw fail('MISSION_NOT_FOUND');
      const { rows: used } = await query.query('select 1 from missions where audio_asset_id=$1 limit 1', [id]);
      if (used.length) throw fail('VALIDATION', 'Esta música está em uso. Remova-a das missões antes de excluir.');
      await query.query('delete from mission_assets where id=$1', [id]);
    });
  } catch (exception) {
    if (exception && typeof exception === 'object' && 'code' in exception && exception.code === '23503') throw fail('VALIDATION', 'Esta música está em uso e não pode ser excluída.');
    throw exception;
  }
}
