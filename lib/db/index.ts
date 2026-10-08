import "server-only";
import { SCHEMA, SCHEMA_VERSION } from "./schema";
import { seedStatements } from "./seed";

// One tiny interface over two drivers: Neon (serverless Postgres over HTTP) when
// DATABASE_URL is set, otherwise PGlite (Postgres compiled to WASM, embedded in the
// process) so local dev and tests need no database server.

type Row = Record<string, unknown>;
interface Driver {
  query<T extends Row>(text: string, params?: unknown[]): Promise<T[]>;
}

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    return {
      query: async <T extends Row>(text: string, params: unknown[] = []) =>
        (await sql.query(text, params)) as T[],
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir =
    process.env.PGLITE_DIR ?? (process.env.VERCEL ? "/tmp/harbor-pglite" : ".data/pglite");
  if (!dataDir.startsWith("memory://")) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }
  const db = new PGlite(dataDir);
  return {
    query: async <T extends Row>(text: string, params: unknown[] = []) =>
      (await db.query<T>(text, params)).rows,
  };
}

async function migrate(driver: Driver) {
  await driver.query(SCHEMA[0]);
  const [meta] = await driver.query<{ version: number }>(
    `SELECT version FROM schema_meta WHERE id = 1`,
  );
  if (meta?.version === SCHEMA_VERSION) return;
  for (const statement of SCHEMA) await driver.query(statement);
  for (const s of seedStatements()) await driver.query(s.text, s.params);
  await driver.query(
    `INSERT INTO schema_meta (id, version) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version`,
    [SCHEMA_VERSION],
  );
}

// Cached on globalThis so dev-server hot reloads reuse one PGlite instance.
const g = globalThis as unknown as { __harborDb?: Promise<Driver> };

function getDriver(): Promise<Driver> {
  g.__harborDb ??= createDriver()
    .then(async (d) => {
      await migrate(d);
      return d;
    })
    .catch((err) => {
      g.__harborDb = undefined; // don't cache a failed connection; retry on the next query
      throw err;
    });
  return g.__harborDb;
}

export async function query<T extends Row = Row>(text: string, params: unknown[] = []) {
  return (await getDriver()).query<T>(text, params);
}

export async function queryOne<T extends Row = Row>(text: string, params: unknown[] = []) {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export const newId = () => crypto.randomUUID();
