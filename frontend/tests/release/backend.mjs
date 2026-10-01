import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../../../backend/", import.meta.url));
const child = spawn(
  process.execPath,
  ["--import", "tsx", "tests/serve-release.ts"],
  { cwd, stdio: "inherit", env: { ...process.env, RELEASE_E2E: "1" } },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
