import { configuration } from "./config";
import { Database, one } from "./db";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createAccount, passwordHash } from "./modules/identity";
import { seedTaxonomy } from "./taxonomy";
import { id } from "./shared";
async function main() {
  const c = configuration();
  if (c.env !== "development")
    throw new Error("Development seed is forbidden outside development");
  if (!process.env.DEV_OWNER_PASSWORD || !process.env.DEV_PROVIDER_PASSWORD)
    throw new Error(
      "Set DEV_OWNER_PASSWORD and DEV_PROVIDER_PASSWORD (8+ characters)",
    );
  const db = new Database(c.databaseUrl, resolve(c.dataDir, "postgres"));
  await mkdir(c.dataDir, { recursive: true });
  try {
    await db.migrate();
    await seedTaxonomy(db);
    for (const [email, name, password] of [
      ["owner@example.test", "개발 의뢰자", process.env.DEV_OWNER_PASSWORD],
      [
        "provider@example.test",
        "개발 수행자",
        process.env.DEV_PROVIDER_PASSWORD,
      ],
    ]) {
      if (password!.length < 8) throw new Error("Password too short");
      await db.tx(async (q) => {
        if (await one(q, "SELECT id FROM users WHERE email=$1", [email]))
          return;
        const uid = await createAccount(
          q,
          email!,
          name!,
          await passwordHash(password!),
        );
        await q.query(
          `INSERT INTO school_verifications(id,user_id,method,affiliation_type,state,expires_at) VALUES($1,$2,'DEVELOPMENT_FIXTURE','STUDENT','VERIFIED',now()+interval '30 days')`,
          [id(), uid],
        );
        await q.query(
          `UPDATE profiles SET visibility='PUBLIC',headline='개발 전용 합성 프로필' WHERE user_id=$1`,
          [uid],
        );
        for (const type of ["TERMS", "PRIVACY"])
          await q.query(
            "INSERT INTO consents(id,user_id,document_type,document_version) VALUES($1,$2,$3,$4)",
            [id(), uid, type, "development-fixture"],
          );
      });
    }
    console.log(
      "Development owner/provider accounts prepared; passwords were not printed",
    );
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
