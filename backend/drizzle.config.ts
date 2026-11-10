import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql', schema: './src/platform/db/schema.ts', out: './drizzle',
  dbCredentials: { url: process.env.DOPAFIT_DATABASE_URL ?? 'postgresql://dopafit:dopafit@postgres:5432/dopafit_hono' },
});
