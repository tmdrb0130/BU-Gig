import { createApp } from "./app";
async function main() {
  const runtime = await createApp();
  await runtime.app.listen(
    runtime.config.port,
    process.env.HOST || "127.0.0.1",
  );
  console.log(`API listening on ${runtime.config.baseUrl}/api/v1`);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => runtime.close().then(() => process.exit(0)));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
