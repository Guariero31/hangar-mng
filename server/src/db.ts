// Acesso ao banco. Funciona com PostgreSQL de verdade (DATABASE_URL)
// ou com o Postgres embutido PGlite (quando DATABASE_URL está vazio).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config, SERVER_ROOT } from './config.js';

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Vários comandos SQL de uma vez, sem parâmetros */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  kind: 'postgres' | 'pglite';
  /** Roda fn dentro de uma transação (tudo ou nada) */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

async function createPostgres(url: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString: url });
  const wrap = (c: pg.Pool | pg.PoolClient): Queryable => ({
    query: async (sql, params) => (await c.query(sql, params as any[])) as any,
    exec: async (sql) => { await c.query(sql); },
  });
  await pool.query('select 1');
  return {
    kind: 'postgres',
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(wrap(client));
        await client.query('commit');
        return result;
      } catch (e) {
        await client.query('rollback');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createPglite(dir: string): Promise<Db> {
  fs.mkdirSync(dir, { recursive: true });
  const lite = await PGlite.create(dir);
  type Tx = Parameters<Parameters<PGlite['transaction']>[0]>[0];
  const wrap = (c: PGlite | Tx): Queryable => ({
    query: async (sql, params) => c.query(sql, params as any[]) as any,
    exec: async (sql) => { await c.exec(sql); },
  });
  return {
    kind: 'pglite',
    ...wrap(lite),
    tx: (fn) => lite.transaction((t) => fn(wrap(t))),
    close: () => lite.close(),
  };
}

export const db: Db = config.databaseUrl
  ? await createPostgres(config.databaseUrl)
  : await createPglite(config.pgliteDir);

/** Aplica os arquivos de server/migrations que ainda não rodaram */
export async function migrate() {
  await db.exec(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const dir = path.join(SERVER_ROOT, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await db.query<{ name: string }>('select name from schema_migrations');
  const done = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    console.log(`  migração aplicada: ${file}`);
  }
}
