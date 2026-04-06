import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.AGENT_DATABASE_URL || 'postgresql://ai_trader:ai_trader_dev@localhost:5432/agent_db',
  },
});
