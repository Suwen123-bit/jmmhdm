import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://app:app_password@localhost:5432/crypto_platform',
  },
  verbose: true,
  strict: true,
} satisfies Config;
