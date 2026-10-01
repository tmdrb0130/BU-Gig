import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
export interface Sql {
  query<T = any>(sql: string, values?: any[]): Promise<{ rows: T[] }>;
}
export const one = async (q: Sql, sql: string, values: any[] = []) =>
  (await q.query(sql, values)).rows[0];
export class Database implements Sql {
  private pool?: Pool;
  private embedded?: PGlite;
  constructor(url?: string, path?: string) {
    if (url) this.pool = new Pool({ connectionString: url });
    else this.embedded = new PGlite(path);
  }
  async query<T = any>(
    sql: string,
    values: any[] = [],
  ): Promise<{ rows: T[] }> {
    return (
      this.pool
        ? await this.pool.query(sql, values)
        : await this.embedded!.query(sql, values)
    ) as any;
  }
  async tx<T>(fn: (q: Sql) => Promise<T>): Promise<T> {
    if (this.embedded) return this.embedded.transaction((t) => fn(t as Sql));
    const client = await this.pool!.connect();
    try {
      await client.query("BEGIN");
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async migrate() {
    await this.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir(resolve("migrations")))
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      await this.tx(async (q) => {
        await q.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
        if (
          await one(q, "SELECT name FROM schema_migrations WHERE name=$1", [
            name,
          ])
        )
          return;
        const sql = await readFile(resolve("migrations", name), "utf8");
        // PGlite exec supports multi-statement DDL, as does pg simple query mode.
        if ("exec" in q) await (q as any).exec(sql);
        else await q.query(sql);
        await q.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      });
    }
  }
  async close() {
    if (this.pool) await this.pool.end();
    else await this.embedded!.close();
  }
}
