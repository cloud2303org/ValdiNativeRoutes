import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './modules/app_pages/src/database/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
