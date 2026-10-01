import { Router, Request, Response, NextFunction } from "express";
import { z, ZodTypeAny, ZodError } from "zod";
import { Database, Sql, one } from "./db";
import { ApiError, canonical, demand, hash, id } from "./shared";
import { Config } from "./config";
import { zodToJsonSchema } from "zod-to-json-schema";
export type Context = {
  q: Sql;
  user: any;
  session: any;
  body: any;
  params: any;
  query: any;
  req: Request;
  res: Response;
  requestId: string;
};
type Route = {
  method: string;
  path: string;
  access: "public" | "member" | "verified" | string;
  schema?: ZodTypeAny;
  fn: (c: Context) => Promise<any>;
  idem: boolean;
};
export class Http {
  routes: Route[] = [];
  router = Router();
  constructor(
    public db: Database,
    public config: Config,
  ) {}
  add(
    method: string,
    path: string,
    access: Route["access"],
    schema: ZodTypeAny | undefined,
    fn: Route["fn"],
    idem = method === "post" && access !== "public",
  ) {
    this.routes.push({ method, path, access, schema, fn, idem });
  }
  async session(req: Request, q: Sql = this.db) {
    const token = req.cookies?.["bu_session"];
    if (!token) return null;
    return one(
      q,
      `SELECT s.*,u.id,u.email,u.display_name,u.status,u.staff_scopes FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()`,
      [hash(token)],
    );
  }
  async verified(q: Sql, userId: string) {
    demand(
      await one(
        q,
        `SELECT u.id FROM users u JOIN school_verifications v ON v.user_id=u.id WHERE u.id=$1 AND u.status='ACTIVE' AND v.state='VERIFIED' AND v.expires_at>now()`,
        [userId],
      ),
      "SCHOOL_VERIFICATION_REQUIRED",
      403,
    );
    demand(
      Number(
        (
          await one(
            q,
            "SELECT count(DISTINCT document_type) AS n FROM consents WHERE user_id=$1 AND document_type IN ('TERMS','PRIVACY')",
            [userId],
          )
        ).n,
      ) === 2,
      "CONSENT_REQUIRED",
      403,
    );
  }
  async authorize(route: Route, c: Context) {
    if (route.access !== "public")
      demand(c.user?.id && c.user.status === "ACTIVE", "UNAUTHENTICATED", 401);
    if (route.access === "verified") await this.verified(c.q, c.user.id);
    if (route.access.startsWith("staff:"))
      demand(
        c.user.staff_scopes.includes(route.access.slice(6)),
        "STAFF_SCOPE_REQUIRED",
        403,
      );
  }
  mount() {
    const buckets = new Map<string, { count: number; until: number }>();
    this.router.use((req, res, next) => {
      const key = `${req.ip}:${req.path.startsWith("/auth") ? "auth" : "api"}`,
        now = Date.now();
      if (buckets.size > 10000)
        for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
      let bucket = buckets.get(key);
      if (!bucket || bucket.until < now) {
        bucket = { count: 0, until: now + 60000 };
        buckets.set(key, bucket);
      }
      if (++bucket.count > (req.path.startsWith("/auth") ? 60 : 600)) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
            fieldErrors: [],
            requestId: id(),
          },
        });
      }
      next();
    });
    for (const route of this.routes)
      (this.router as any)[route.method](
        route.path,
        async (req: Request, res: Response) => {
          const requestId = id();
          res.setHeader("X-Request-ID", requestId);
          res.setHeader("Cache-Control", "no-store");
          try {
            for (const [key, value] of Object.entries(req.params))
              if (key === "id") z.string().uuid().parse(value);
            const session = await this.session(req);
            if (
              !["get", "head"].includes(route.method) &&
              !route.path.startsWith("/uploads/:id/content")
            ) {
              demand(
                req.headers.origin === this.config.origin ||
                  req.headers.origin === this.config.baseUrl,
                "ORIGIN_REJECTED",
                403,
              );
              demand(
                session &&
                  typeof req.headers["x-csrf-token"] === "string" &&
                  session.csrf_token === req.headers["x-csrf-token"],
                "CSRF_REJECTED",
                403,
              );
            }
            const body = route.schema
              ? route.schema.parse(req.body ?? {})
              : (req.body ?? {});
            const c: Context = {
              q: this.db,
              user: session?.user_id ? session : null,
              session,
              body,
              params: req.params,
              query: req.query,
              req,
              res,
              requestId,
            };
            await this.authorize(route, c);
            if (session && route.path !== "/events")
              await this.db.query(
                "UPDATE sessions SET idle_expires_at=least(absolute_expires_at,$2) WHERE token_hash=$1 AND idle_expires_at<$3",
                [
                  session.token_hash,
                  new Date(Date.now() + this.config.idle * 1000),
                  new Date(Date.now() + (this.config.idle - 60) * 1000),
                ],
              );
            const run = async (q: Sql) => {
              c.q = q;
              if (c.user) {
                const current = await this.session(req, q);
                demand(current?.status === "ACTIVE", "UNAUTHENTICATED", 401);
                c.user = current;
                await this.authorize(route, c);
              }
              if (!route.idem) return route.fn(c);
              const key = z
                .string()
                .min(8)
                .max(128)
                .parse(req.headers["idempotency-key"]);
              const bodyHash = hash(canonical(body));
              await q.query(
                `INSERT INTO idempotency_records(actor_id,method,path,key,body_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
                [c.user.id, route.method, req.path, key, bodyHash],
              );
              const record = await one(
                q,
                `SELECT * FROM idempotency_records WHERE actor_id=$1 AND method=$2 AND path=$3 AND key=$4 FOR UPDATE`,
                [c.user.id, route.method, req.path, key],
              );
              demand(record.body_hash === bodyHash, "IDEMPOTENCY_KEY_REUSED");
              if (record.response !== null) return record.response;
              const result = await route.fn(c);
              await q.query(
                `UPDATE idempotency_records SET response=$5 WHERE actor_id=$1 AND method=$2 AND path=$3 AND key=$4`,
                [
                  c.user.id,
                  route.method,
                  req.path,
                  key,
                  JSON.stringify(result ?? null),
                ],
              );
              return result;
            };
            const result =
              route.method === "get"
                ? await run(this.db)
                : await this.db.tx(run);
            if (res.headersSent) return;
            if (result?.redirect) return res.redirect(result.redirect);
            if (result?.statusCode === 204) return res.status(204).end();
            const code = result?.statusCode || 200;
            if (result && typeof result === "object") delete result.statusCode;
            const envelope =
              result && Array.isArray(result.data) && result.meta
                ? result
                : { data: result };
            res
              .status(code)
              .json(
                camel({ ...envelope, meta: { ...envelope.meta, requestId } }),
              );
          } catch (e: any) {
            if (res.headersSent) {
              res.end();
              return;
            }
            const validation = e instanceof ZodError;
            const status = validation
              ? 422
              : e instanceof ApiError
                ? e.status
                : ["23505", "23503", "23514"].includes(e.code)
                  ? 409
                  : e.code === "22P02"
                    ? 400
                    : 500;
            const code = validation
              ? "VALIDATION_ERROR"
              : e instanceof ApiError
                ? e.code
                : status === 409
                  ? "CONSTRAINT_CONFLICT"
                  : status === 400
                    ? "INVALID_VALUE"
                    : "INTERNAL_ERROR";
            if (status === 500)
              console.error(
                JSON.stringify({ requestId, code, errorType: e.name }),
              );
            res.status(status).json({
              error: {
                code,
                message: e instanceof ApiError ? e.message : code,
                fieldErrors: validation
                  ? e.issues.map((x: any) => ({
                      field: x.path.join("."),
                      message: x.message,
                    }))
                  : [],
                requestId,
              },
            });
          }
        },
      );
    this.router.use((_req, res) =>
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Not found",
          fieldErrors: [],
          requestId: id(),
        },
      }),
    );
  }
  openapi() {
    return {
      openapi: "3.1.0",
      info: { title: "BU CMONG API", version: "0.1.0" },
      servers: [{ url: "/api/v1" }],
      paths: Object.fromEntries(
        [...new Set(this.routes.map((r) => r.path))].map((p) => [
          p.replace(/:([A-Za-z]+)/g, "{$1}"),
          Object.fromEntries(
            this.routes
              .filter((r) => r.path === p)
              .map((r) => [
                r.method,
                {
                  operationId: r.method + "_" + p.replace(/[^a-zA-Z0-9]/g, "_"),
                  summary: r.path,
                  description: `Access: ${r.access}. Mutations require a session-bound CSRF token and trusted Origin.`,
                  "x-access": r.access,
                  ...(r.schema
                    ? {
                        requestBody: {
                          required: true,
                          content: {
                            "application/json": {
                              schema: (zodToJsonSchema as any)(r.schema, {
                                $refStrategy: "none",
                              }),
                            },
                          },
                        },
                      }
                    : {}),
                  security: r.access === "public" ? [] : [{ session: [] }],
                  parameters: [
                    ...(!["get", "head"].includes(r.method) &&
                    !r.path.endsWith("/content")
                      ? [
                          {
                            name: "X-CSRF-Token",
                            in: "header",
                            required: true,
                            schema: { type: "string" },
                          },
                          {
                            name: "Origin",
                            in: "header",
                            required: true,
                            schema: { type: "string" },
                          },
                        ]
                      : []),
                    ...Array.from(p.matchAll(/:([A-Za-z]+)/g)).map((m) => ({
                      name: m[1],
                      in: "path",
                      required: true,
                      schema: { type: "string" },
                    })),
                    ...(r.idem
                      ? [
                          {
                            name: "Idempotency-Key",
                            in: "header",
                            required: true,
                            schema: {
                              type: "string",
                              minLength: 8,
                              maxLength: 128,
                            },
                          },
                        ]
                      : []),
                  ],
                  responses: {
                    "200": {
                      description:
                        "Success; JSON envelope except OpenAPI, OAuth redirect, media binary and SSE",
                      content: {
                        "application/json": {
                          schema: { $ref: "#/components/schemas/Envelope" },
                        },
                      },
                    },
                    "202": { description: "Upload accepted for scanning" },
                    "204": { description: "Successful deletion or logout" },
                    "302": { description: "OAuth redirect" },
                    "400": { description: "Invalid query or identifier" },
                    "404": { description: "Not found or not visible" },
                    "413": { description: "Upload limit exceeded" },
                    "429": { description: "Rate limit" },
                    "503": {
                      description:
                        "External provider unavailable or unconfigured",
                    },
                    "401": { description: "Authentication required" },
                    "403": { description: "Permission denied" },
                    "409": { description: "State/version conflict" },
                    "422": { description: "Validation error" },
                  },
                },
              ]),
          ),
        ]),
      ),
      components: {
        schemas: {
          Envelope: {
            type: "object",
            properties: {
              data: {},
              meta: {
                type: "object",
                properties: {
                  requestId: { type: "string" },
                  total: { type: "integer" },
                  nextCursor: { type: ["string", "integer", "null"] },
                  hasMore: { type: "boolean" },
                },
              },
            },
          },
          Error: {
            type: "object",
            required: ["error"],
            properties: {
              error: {
                type: "object",
                required: ["code", "message", "fieldErrors", "requestId"],
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                  fieldErrors: { type: "array", items: { type: "object" } },
                  requestId: { type: "string" },
                },
              },
            },
          },
        },
        securitySchemes: {
          session: { type: "apiKey", in: "cookie", name: "bu_session" },
        },
      },
    };
  }
}
function camel(v: any): any {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(camel);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        camel(x),
      ]),
    );
  return v;
}
