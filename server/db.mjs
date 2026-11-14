import pg from 'pg';
import { readFile } from 'node:fs/promises';

export function createPool() {
  const pool = new pg.Pool({
    ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
    max: 8, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000,
    statement_timeout: 15000,
  });
  pool.on('error', error => console.error('PostgreSQL: conexão interrompida.', error.code ?? 'connection_error'));
  return pool;
}

export async function migrate(pool) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(81733241)");
    await client.query(sql);
    await client.query(await readFile(new URL('./cashbook-schema.sql', import.meta.url),'utf8'));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
