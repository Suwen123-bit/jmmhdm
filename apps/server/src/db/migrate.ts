import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../config/env.js';

async function main() {
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);
  console.log('[migrate] running migrations...');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.log('[migrate] done');
  await sql.end();
}

main().catch((e) => {
  console.error('[migrate] failed:', e);
  process.exit(1);
});
