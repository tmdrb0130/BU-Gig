import { createApp } from "./app";
import { Database } from "./db";
import { configuration } from "./config";
import { mkdir, writeFile } from "node:fs/promises";
async function main() {
  const runtime = await createApp({
    db: new Database(),
    config: { ...configuration(), production: false, inlineWorker: false },
  });
  try {
    await mkdir("contracts", { recursive: true });
    await writeFile(
      "contracts/openapi.json",
      JSON.stringify(runtime.http.openapi(), null, 2),
    );
    console.log(`${runtime.http.routes.length} operations exported`);
  } finally {
    await runtime.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
