import {
  randomBytes,
  scrypt as scryptCb,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { Http, Context } from "../http";
import { Sql, one } from "../db";
import { hash, id, text, demand, secureEqual } from "../shared";
import { validateConsents } from "../public-config";
const scrypt = promisify(scryptCb);
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString("hex")}`;
}
export async function checkPassword(password: string, encoded: string | null) {
  const [salt, value] = (encoded || "").split(":");
  const derived = (
    (await scrypt(password, salt || "constant-dummy-salt", 64)) as Buffer
  ).toString("hex");
  return !!value && secureEqual(value, derived);
}
export function encrypt(value: any, secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(hash(secret), "hex"),
      iv,
    );
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${data.toString("hex")}`;
}
export function decrypt(value: string, secret: string) {
  const [iv, tag, data] = value.split(".");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(hash(secret), "hex"),
    Buffer.from(iv, "hex"),
  );
  cipher.setAuthTag(Buffer.from(tag, "hex"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(data, "hex")),
      cipher.final(),
    ]).toString(),
  );
}
export async function createAccount(
  q: Sql,
  email: string | null,
  name: string,
  password: string | null,
) {
  const userId = id();
  await q.query(
    "INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)",
    [userId, email, name, password],
  );
  await q.query("INSERT INTO profiles(id,user_id) VALUES($1,$2)", [
    id(),
    userId,
  ]);
  return userId;
}
export function identity(h: Http) {
  const email = z
      .string()
      .email()
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    password = z.string().min(8).max(128);
  const session = async (
    c: Context,
    userId: string | null,
    remember = false,
  ) => {
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(32).toString("hex");
    if (c.session)
      await c.q.query("DELETE FROM sessions WHERE token_hash=$1", [
        c.session.token_hash,
      ]);
    const lifetime = remember ? h.config.remember : h.config.absolute;
    await c.q.query(
      "INSERT INTO sessions(token_hash,user_id,csrf_token,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$4,$5)",
      [
        hash(token),
        userId,
        csrf,
        new Date(Date.now() + h.config.idle * 1000),
        new Date(Date.now() + lifetime * 1000),
      ],
    );
    c.res.cookie("bu_session", token, {
      httpOnly: true,
      secure: h.config.production,
      sameSite: "lax",
      path: "/",
      ...(remember ? { maxAge: lifetime * 1000 } : {}),
    });
    return csrf;
  };
  h.add("get", "/auth/csrf", "public", undefined, async (c) => ({
    csrfToken: c.session?.csrf_token || (await session(c, null)),
  }));
  h.add(
    "post",
    "/auth/signup",
    "public",
    z
      .object({
        email,
        password,
        displayName: text(20).min(2),
        consents: z
          .array(
            z.object({ type: z.enum(["TERMS", "PRIVACY"]), version: text(40) }),
          )
          .min(2)
          .max(2),
      })
      .strict(),
    async (c) => {
      validateConsents(h.config, c.body.consents);
      demand(
        new Set(c.body.consents.map((x: any) => x.type)).size === 2,
        "CONSENT_REQUIRED",
        422,
      );
      const existing = await one(c.q, "SELECT id FROM users WHERE email=$1", [
        c.body.email,
      ]);
      if (!existing) {
        const uid = await createAccount(
          c.q,
          c.body.email,
          c.body.displayName,
          await passwordHash(c.body.password),
        );
        for (const consent of c.body.consents)
          await c.q.query(
            "INSERT INTO consents(id,user_id,document_type,document_version) VALUES($1,$2,$3,$4)",
            [id(), uid, consent.type, consent.version],
          );
      }
      return { accepted: true };
    },
  );
  h.add(
    "post",
    "/auth/login",
    "public",
    z
      .object({ email, password, remember: z.boolean().default(false) })
      .strict(),
    async (c) => {
      const u = await one(c.q, "SELECT * FROM users WHERE email=$1", [
        c.body.email,
      ]);
      demand(
        (await checkPassword(c.body.password, u?.password_hash)) &&
          u?.status === "ACTIVE",
        "INVALID_CREDENTIALS",
        401,
      );
      return {
        user: { id: u.id, email: u.email, displayName: u.display_name },
        csrfToken: await session(c, u.id, c.body.remember),
      };
    },
  );
  h.add("get", "/auth/session", "member", undefined, async (c) => {
    await c.q.query(
      `UPDATE sessions SET idle_expires_at=least(absolute_expires_at,$2) WHERE token_hash=$1`,
      [c.session.token_hash, new Date(Date.now() + h.config.idle * 1000)],
    );
    const verification = await one(
      c.q,
      `SELECT CASE WHEN state='VERIFIED' AND expires_at<=now() THEN 'EXPIRED' ELSE state END AS state,expires_at FROM school_verifications WHERE user_id=$1 ORDER BY (state='VERIFIED' AND expires_at>now()) DESC,created_at DESC,id DESC LIMIT 1`,
      [c.user.id],
    );
    return {
      user: {
        id: c.user.id,
        email: c.user.email,
        displayName: c.user.display_name,
      },
      verification: verification || { state: "UNVERIFIED" },
      permissions: c.user.staff_scopes,
      csrfToken: c.session.csrf_token,
    };
  });
  h.add(
    "post",
    "/auth/logout",
    "member",
    z.object({}).strict(),
    async (c) => {
      await c.q.query("DELETE FROM sessions WHERE token_hash=$1", [
        c.session.token_hash,
      ]);
      c.res.clearCookie("bu_session", { path: "/" });
      return { statusCode: 204 };
    },
    false,
  );
  for (const kind of ["password-resets", "email-verifications"]) {
    h.add(
      "post",
      `/auth/${kind}`,
      kind === "password-resets" ? "public" : "member",
      kind === "password-resets"
        ? z.object({ email }).strict()
        : z.object({}).strict(),
      async (c) => {
        const u =
          kind === "password-resets"
            ? await one(
                c.q,
                `SELECT * FROM users WHERE email=$1 AND status='ACTIVE'`,
                [c.body.email],
              )
            : c.user;
        if (u?.email) {
          const token = randomBytes(32).toString("hex");
          await c.q.query(
            "INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,$4)",
            [hash(token), u.id, kind, new Date(Date.now() + 1800000)],
          );
          await c.q.query(
            "INSERT INTO jobs(id,handler,dedup_key,payload) VALUES($1,$2,$3,$4)",
            [
              id(),
              "mail",
              hash(token),
              JSON.stringify({
                encrypted: encrypt(
                  { to: u.email, subject: kind, token, purpose: kind },
                  h.config.secret,
                ),
              }),
            ],
          );
        }
        return { accepted: true };
      },
      false,
    );
    h.add(
      "post",
      `/auth/${kind}/confirm`,
      "public",
      z
        .object({
          token: text(128),
          ...(kind === "password-resets" ? { newPassword: password } : {}),
        })
        .strict(),
      async (c) => {
        const token = await one(
          c.q,
          `SELECT * FROM auth_tokens WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,
          [hash(c.body.token), kind],
        );
        demand(token, "INVALID_TOKEN", 422);
        await c.q.query(
          "UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1",
          [token.token_hash],
        );
        if (kind === "password-resets") {
          await c.q.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
            token.user_id,
            await passwordHash(c.body.newPassword),
          ]);
          await c.q.query("DELETE FROM sessions WHERE user_id=$1", [
            token.user_id,
          ]);
          await c.q.query(
            "UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND purpose='password-resets' AND used_at IS NULL",
            [token.user_id],
          );
        } else
          await c.q.query(
            "UPDATE users SET email_verified_at=now() WHERE id=$1",
            [token.user_id],
          );
        return { confirmed: true };
      },
    );
  }
  h.add("get", "/me", "member", undefined, async (c) => ({
    id: c.user.id,
    email: c.user.email,
    displayName: c.user.display_name,
  }));
  h.add(
    "patch",
    "/me",
    "member",
    z.object({ displayName: text(20).min(2) }).strict(),
    async (c) => {
      await c.q.query("UPDATE users SET display_name=$2 WHERE id=$1", [
        c.user.id,
        c.body.displayName,
      ]);
      return { displayName: c.body.displayName };
    },
  );
  h.add(
    "delete",
    "/me",
    "member",
    z.object({ password }).strict(),
    async (c) => {
      const u = await one(c.q, "SELECT * FROM users WHERE id=$1 FOR UPDATE", [
        c.user.id,
      ]);
      demand(
        await checkPassword(c.body.password, u.password_hash),
        "REAUTHENTICATION_REQUIRED",
        403,
      );
      demand(
        !(await one(
          c.q,
          `SELECT p.id FROM projects p LEFT JOIN matches m ON m.project_id=p.id WHERE (p.owner_id=$1 OR m.provider_id=$1) AND p.status IN ('OPEN','CLOSED','MATCHED','IN_PROGRESS','COMPLETION_REQUESTED') LIMIT 1`,
          [c.user.id],
        )),
        "ACTIVE_TRADES_EXIST",
      );
      await c.q.query(
        `UPDATE users SET status='WITHDRAWN',email=NULL,password_hash=NULL,display_name='탈퇴 회원' WHERE id=$1`,
        [c.user.id],
      );
      await c.q.query(
        `UPDATE profiles SET visibility='PRIVATE' WHERE user_id=$1`,
        [c.user.id],
      );
      await c.q.query(
        `UPDATE portfolios SET visibility='PRIVATE' WHERE owner_id=$1`,
        [c.user.id],
      );
      await c.q.query("DELETE FROM sessions WHERE user_id=$1", [c.user.id]);
      return { statusCode: 204 };
    },
  );
}
