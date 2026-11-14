import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './password.js';

export const pool = new pg.Pool({
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
  max: 8, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, statement_timeout: 15000,
});
pool.on('error', () => console.error('Conexão com PostgreSQL interrompida.'));

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(81733241)');
    await client.query(await readFile(new URL('../../../server/schema.sql', import.meta.url), 'utf8'));
    await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    await client.query(await readFile(new URL('../../../server/cashbook-schema.sql', import.meta.url), 'utf8'));
    // Bootstrap is opt-in; never overwrite an existing administrator or password.
    if (process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD) {
      const exists = await client.query('SELECT 1 FROM forma_auth.users WHERE login=$1', [process.env.ADMIN_LOGIN.toLowerCase()]);
      if (!exists.rowCount) await client.query(
        `INSERT INTO forma_auth.users(id,name,login,password_hash,role) VALUES($1,$2,$3,$4,'admin')`,
        [randomUUID(), process.env.ADMIN_NAME || 'Diogo', process.env.ADMIN_LOGIN.toLowerCase(), await hashPassword(process.env.ADMIN_PASSWORD)],
      );
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
