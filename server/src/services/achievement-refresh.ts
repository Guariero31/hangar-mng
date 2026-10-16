import { db } from '../db.js';
import { syncAchievements } from './achievements.js';
import { getTree } from './techtree.js';
import type { User } from './users.js';

/** Bounded background refresh keeps ranking requests independent of squad size. */
export async function refreshAchievements(shouldStop: () => boolean = () => false) {
  const catalog = await getTree({ onlyActive: true });
  let cursor = '00000000-0000-0000-0000-000000000000';
  while (!shouldStop()) {
    const { rows } = await db.query<User>(
      `select * from users where status = 'active' and nickname is not null and id > $1
       order by id limit 20`, [cursor]);
    if (!rows.length) break;
    for (const user of rows) {
      if (shouldStop()) return;
      await syncAchievements(user, catalog);
    }
    cursor = rows[rows.length - 1].id;
  }
}

export function startAchievementRefresh() {
  let stopped = false;
  let pending: Promise<void> | undefined;
  const run = () => {
    if (stopped || pending) return;
    pending = refreshAchievements(() => stopped)
      .catch(error => { console.error('Achievement refresh failed:', error); })
      .finally(() => { pending = undefined; });
  };
  const timer = setInterval(run, 60_000);
  timer.unref();
  run();
  return async () => { stopped = true; clearInterval(timer); await pending; };
}
