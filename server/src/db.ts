// Acesso ao banco. Funciona com PostgreSQL de verdade (DATABASE_URL)
// ou com o Postgres embutido PGlite (quando DATABASE_URL está vazio).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config, SERVER_ROOT } from './config.js';
import { fail } from './errors.js';

function validateNumericResults<T>(rows: T[]): T[] {
  const inspect = (value: unknown): void => {
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
      throw fail('VALIDATION', 'O total excede o limite seguro de pontos do sistema.');
    }
    if (value && typeof value === 'object') Object.values(value).forEach(inspect);
  };
  rows.forEach(inspect);
  return rows;
}

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
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
    query: async <T>(sql: string, params?: unknown[]) => ({ rows: validateNumericResults((await c.query(sql, params)).rows as T[]) }),
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
  if (dir !== 'memory://') fs.mkdirSync(dir, { recursive: true });
  const lite = await PGlite.create(dir);
  type Tx = Parameters<Parameters<PGlite['transaction']>[0]>[0];
  const wrap = (c: PGlite | Tx): Queryable => ({
    query: async <T>(sql: string, params?: unknown[]) => ({ rows: validateNumericResults((await c.query(sql, params)).rows as T[]) }),
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
  const directory = path.join(SERVER_ROOT, 'migrations');
  const files = fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort();
  await db.tx(async query => {
    // A transaction-level lock also protects first creation of the migration table.
    if (db.kind === 'postgres') await query.query('select pg_advisory_xact_lock(721406, 1)');
    await query.exec(`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const { rows } = await query.query<{ name: string }>('select name from schema_migrations');
    const applied = new Set(rows.map(row => row.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      await query.exec(fs.readFileSync(path.join(directory, file), 'utf8'));
      await query.query('insert into schema_migrations (name) values ($1)', [file]);
      console.log(`  migração aplicada: ${file}`);
    }
  });
}
