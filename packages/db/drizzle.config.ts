import { defineConfig } from 'drizzle-kit';
import { resolveDatabaseUrl } from '@mastermind/shared';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: resolveDatabaseUrl() ?? 'postgresql://postgres:postgres@localhost:5432/mastermind',
  },
  strict: false,
  verbose: true,
});
