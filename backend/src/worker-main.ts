import { configuration } from "./config";
import { Database } from "./db";
import { Storage } from "./storage";
import { Worker } from "./worker";
async function main() {
  const c = configuration();
  if (!c.databaseUrl)
    throw new Error(
      "Separate Worker requires DATABASE_URL; embedded development runs the inline Worker",
    );
  const db = new Database(c.databaseUrl),
    worker = new Worker(db, c, new Storage(c));
  let stop = false;
  for (const s of ["SIGINT", "SIGTERM"] as const)
    process.once(s, () => {
      stop = true;
    });
  while (!stop) {
    await worker.tick();
    await new Promise((r) => setTimeout(r, 1000));
  }
  await db.close();
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
