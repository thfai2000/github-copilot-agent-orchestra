import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString =
  process.env.AGENT_DATABASE_URL || 'postgresql://oao:oao_dev@localhost:5432/agent_db';

const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
export type Database = typeof db;
