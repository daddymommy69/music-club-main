import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL comes from whatever Postgres you connect (Vercel Postgres /
// Neon / Supabase all work — see README for setup). Reading it lazily
// (inside a function, not at module load) means `next build` never needs
// a live database to succeed.
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (see .env.example)."
    );
  }

  const client = postgres(connectionString, { prepare: false });
  _db = drizzle(client, { schema });
  return _db;
}
