import "dotenv/config";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const production = ["production", "staging"].includes(env.APP_ENV || "");
  const dataDir = resolve(env.DATA_DIR || ".data");
  let secret = env.SESSION_SECRET || "";
  if (!secret && !production) {
    mkdirSync(dataDir, { recursive: true });
    const path = resolve(dataDir, "session.key");
    if (!existsSync(path))
      writeFileSync(path, randomBytes(32).toString("hex"), {
        mode: 0o600,
        flag: "wx",
      });
    secret = readFileSync(path, "utf8");
  }
  if (secret.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  if (
    production &&
    (!env.DATABASE_URL ||
      env.STORAGE_DRIVER !== "s3" ||
      env.MAIL_DRIVER !== "smtp" ||
      env.SCANNER_DRIVER !== "clamd" ||
      !env.PDF_FONT_PATH)
  )
    throw new Error(
      "Hosted environments require PostgreSQL, S3, SMTP, clamd and PDF_FONT_PATH",
    );
  if (production && !env.PUBLIC_BASE_URL?.startsWith("https://"))
    throw new Error("Hosted PUBLIC_BASE_URL must use HTTPS");
  if (
    production &&
    (!env.SMTP_URL ||
      !env.MAIL_FROM ||
      !env.S3_BUCKET ||
      !env.WEB_ORIGIN?.startsWith("https://"))
  )
    throw new Error(
      "Hosted environments require SMTP_URL, MAIL_FROM, S3_BUCKET and HTTPS WEB_ORIGIN",
    );
  if (env.APP_ENV === "staging" && !env.STAGING_RECIPIENT_ALLOWLIST)
    throw new Error("Staging requires a mail recipient allowlist");
  return {
    env: env.APP_ENV || "development",
    production,
    port: Number(env.PORT || 3000),
    secret,
    baseUrl: env.PUBLIC_BASE_URL || "http://127.0.0.1:3000",
    origin: env.WEB_ORIGIN || "http://127.0.0.1:5173",
    databaseUrl: env.DATABASE_URL,
    dataDir,
    idle: Number(env.SESSION_IDLE_SECONDS || 43200),
    absolute: Number(env.SESSION_ABSOLUTE_SECONDS || 86400),
    remember: Number(env.REMEMBER_ABSOLUTE_SECONDS || 604800),
    inlineWorker: !production && env.WORKER_INLINE !== "false",
    storage: env.STORAGE_DRIVER || "local",
    mail: env.MAIL_DRIVER || "file",
    scanner: env.SCANNER_DRIVER || "development",
  };
}
export type Config = ReturnType<typeof configuration>;
