import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import express from "express";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Config, configuration } from "./config";
import { Database } from "./db";
import { Http } from "./http";
import { Storage } from "./storage";
import { Worker } from "./worker";
import { identity } from "./modules/identity";
import { matching } from "./modules/matching";
import { profile } from "./modules/profile";
import { trade } from "./modules/trade";
import { media } from "./modules/media";
import { operations } from "./modules/operations";
import { events } from "./modules/events";
import { oauth } from "./modules/oauth";
import { queries } from "./queries";
import { seedTaxonomy } from "./taxonomy";
@Module({})
class BackendModule {}
export async function createApp(
  options: { db?: Database; config?: Config } = {},
) {
  const config = options.config || configuration();
  await mkdir(config.dataDir, { recursive: true });
  const db =
    options.db ||
    new Database(config.databaseUrl, resolve(config.dataDir, "postgres"));
  if (!config.production) {
    await db.migrate();
    await seedTaxonomy(db);
  }
  const app = await NestFactory.create(BackendModule, {
    logger: false,
    bodyParser: false,
  });
  app.use(helmet());
  app.use(cookieParser());
  app.use(
    "/api/v1/uploads/:id/content",
    express.raw({ type: () => true, limit: "21mb" }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.enableCors({
    origin: [config.origin, config.baseUrl],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "X-CSRF-Token",
      "Idempotency-Key",
      "Last-Event-ID",
    ],
  });
  const http = new Http(db, config),
    storage = new Storage(config),
    worker = new Worker(db, config, storage);
  identity(http);
  oauth(http);
  profile(http);
  matching(http);
  trade(http);
  operations(http);
  media(http, storage);
  const closeEvents = events(http);
  queries(http);
  http.add("get", "/openapi.json", "public", undefined, async (c) => {
    c.res.json(http.openapi());
    return null;
  });
  http.add("get", "/health/live", "public", undefined, async () => ({
    status: "ok",
  }));
  http.add("get", "/health/ready", "public", undefined, async () => {
    await db.query("SELECT 1 FROM schema_migrations LIMIT 1");
    return { status: "ready" };
  });
  http.mount();
  app.use("/api/v1", http.router);
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status || 500).json({
      error: {
        code:
          err.type === "entity.too.large"
            ? "PAYLOAD_TOO_LARGE"
            : "INVALID_REQUEST",
        message: "Invalid request",
        fieldErrors: [],
      },
    }),
  );
  await app.init();
  const timer = config.inlineWorker
    ? setInterval(
        () => worker.tick().catch(() => console.error("Worker tick failed")),
        1000,
      )
    : undefined;
  timer?.unref();
  return {
    app,
    http,
    db,
    worker,
    storage,
    config,
    close: async () => {
      if (timer) clearInterval(timer);
      closeEvents();
      await app.close();
      await worker.drain();
      await db.close();
    },
  };
}
