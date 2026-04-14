/**
 * Neon serverless Postgres client + Drizzle ORM instance.
 *
 * Always use the HTTP-based neon() client — never use pg.Pool in Vercel Functions
 * as it will exhaust Neon's connection limit under load.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Lazy initialization — do not call neon() at import time so that tests
// and build steps that don't have DATABASE_URL configured can still import this module.
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to your .env.local or Vercel environment variables."
    );
  }
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as Record<string | symbol, unknown>)[prop];
  },
});

export { schema };
export type { Organization, OrgMember, Division, ApiKey, Project, UsageRow as DbUsageRow, Annotation, Invitation, AuditLogEntry } from "./schema";
