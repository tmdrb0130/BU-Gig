import { configuration } from "./config";
import { Database } from "./db";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { seedTaxonomy } from "./taxonomy";
async function main() {
  const c = configuration();
  await mkdir(c.dataDir, { recursive: true });
  const db = new Database(c.databaseUrl, resolve(c.dataDir, "postgres"));
  try {
    await db.migrate();
    await seedTaxonomy(db);
    console.log("Migrations and taxonomy applied");
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
