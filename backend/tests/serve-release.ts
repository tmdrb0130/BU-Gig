// Isolated browser-test server. Never used by the production entrypoint.
import { createApp } from "../src/app";
import { configuration } from "../src/config";
import { Database } from "../src/db";
import { createAccount, passwordHash } from "../src/modules/identity";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
async function main() {
  if (process.env.RELEASE_E2E !== "1")
    throw new Error("Test server requires RELEASE_E2E=1");
  const config = configuration({
    APP_ENV: "test",
    PORT: "3021",
    PUBLIC_BASE_URL: "http://127.0.0.1:3021",
    WEB_ORIGIN: "http://127.0.0.1:5179",
    SESSION_SECRET: "isolated-browser-test-secret-32-characters",
    DATA_DIR: resolve(".data", "browser-" + randomUUID()),
    WORKER_INLINE: "true",
  });
  const runtime = await createApp({ config, db: new Database() });
  for (const role of ["owner", "provider", "staff"])
    await runtime.db.tx(async (q) => {
      const uid = await createAccount(
        q,
        `${role}@release.test`,
        role,
        await passwordHash("Release-test-123!"),
      );
      for (const type of ["TERMS", "PRIVACY"])
        await q.query(
          "INSERT INTO consents(id,user_id,document_type,document_version) VALUES($1,$2,$3,$4)",
          [randomUUID(), uid, type, "development"],
        );
      if (role === "staff")
        await q.query(
          "UPDATE users SET staff_scopes=ARRAY['verification','support','dispute'] WHERE id=$1",
          [uid],
        );
      else
        await q.query(
          "INSERT INTO school_verifications(id,user_id,method,affiliation_type,state,expires_at) VALUES($1,$2,'EVIDENCE','STUDENT','VERIFIED',now()+interval '30 days')",
          [randomUUID(), uid],
        );
    });
  await runtime.app.listen(3021, "127.0.0.1");
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => runtime.close().then(() => process.exit(0)));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
