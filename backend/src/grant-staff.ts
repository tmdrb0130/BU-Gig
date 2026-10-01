import { configuration } from "./config";
import { Database, one } from "./db";
import { resolve } from "node:path";
import { demand } from "./shared";
import { audit } from "./policy";

// Operator-only CLI, never exposed as an HTTP endpoint. Empty scopes revoke access.
async function main() {
  const [email, scopesArg, reason] = process.argv.slice(2);
  demand(
    email && scopesArg !== undefined && reason,
    "Usage: grant-staff email verification,support reason (use none to revoke)",
  );
  const scopes = scopesArg === "none" ? [] : [...new Set(scopesArg.split(","))];
  demand(
    scopes.every((s) =>
      ["verification", "support", "dispute", "audit", "operations"].includes(s),
    ),
    "INVALID_SCOPE",
  );
  const config = configuration(),
    db = new Database(config.databaseUrl, resolve(config.dataDir, "postgres"));
  try {
    await db.tx(async (q) => {
      const user = await one(
        q,
        "SELECT id FROM users WHERE email=$1 AND status='ACTIVE' FOR UPDATE",
        [email.toLowerCase()],
      );
      demand(user, "ACCOUNT_NOT_FOUND");
      await q.query("UPDATE users SET staff_scopes=$2 WHERE id=$1", [
        user.id,
        scopes,
      ]);
      await q.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
      await audit(
        q,
        user.id,
        "operator.staff_scopes",
        user.id,
        `CLI: ${reason}; scopes=${scopes.join(",")}`,
      );
    });
    console.log("Scopes replaced; account must sign in again.");
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
