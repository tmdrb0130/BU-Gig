import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Http, Context } from "../http";
import { one } from "../db";
import { demand, hash, id, text } from "../shared";
import { createAccount, checkPassword } from "./identity";
export function oauth(h: Http) {
  const providers = {
    kakao: {
      authorize: "https://kauth.kakao.com/oauth/authorize",
      token: "https://kauth.kakao.com/oauth/token",
      me: "https://kapi.kakao.com/v2/user/me",
    },
    naver: {
      authorize: "https://nid.naver.com/oauth2.0/authorize",
      token: "https://nid.naver.com/oauth2.0/token",
      me: "https://openapi.naver.com/v1/nid/me",
    },
  };
  const config = (name: string) => {
    demand(name in providers, "UNSUPPORTED_PROVIDER", 400);
    const provider = providers[name as keyof typeof providers],
      clientId = process.env[`${name.toUpperCase()}_CLIENT_ID`],
      secret = process.env[`${name.toUpperCase()}_CLIENT_SECRET`];
    demand(
      clientId && (name !== "naver" || secret),
      "OAUTH_NOT_CONFIGURED",
      503,
    );
    return { ...provider, clientId: clientId!, secret };
  };
  const reauth = async (c: Context) => {
    const u = await one(c.q, "SELECT password_hash FROM users WHERE id=$1", [
      c.user.id,
    ]);
    const recent =
      new Date(c.session.created_at).getTime() > Date.now() - 300000;
    demand(
      recent ||
        (c.body.password &&
          (await checkPassword(c.body.password, u.password_hash))),
      "REAUTHENTICATION_REQUIRED",
      403,
    );
  };
  const start = async (c: Context, link = false) => {
    const p = config(c.params.provider);
    if (link) await reauth(c);
    let sessionHash = c.session?.token_hash;
    if (!sessionHash) {
      const token = randomBytes(32).toString("hex");
      sessionHash = hash(token);
      await c.q.query(
        "INSERT INTO sessions(token_hash,csrf_token,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$3)",
        [
          sessionHash,
          randomBytes(32).toString("hex"),
          new Date(Date.now() + 600000),
        ],
      );
      c.res.cookie("bu_session", token, {
        httpOnly: true,
        secure: h.config.production,
        sameSite: "lax",
        path: "/",
      });
    }
    const next = String(c.query.next || "/my");
    demand(
      /^\/(?:my|saved|request\/new|projects\/[0-9a-f-]+\/apply|workrooms\/[0-9a-f-]+)(?:\?[^\r\n\\]*)?$/.test(
        next,
      ),
      "INVALID_RETURN_PATH",
      422,
    );
    const state = randomBytes(32).toString("hex");
    await c.q.query(
      "INSERT INTO auth_tokens(token_hash,user_id,purpose,context,expires_at) VALUES($1,$2,$3,$4,$5)",
      [
        hash(state),
        link ? c.user.id : null,
        `oauth:${c.params.provider}`,
        JSON.stringify({ sessionHash, next, link }),
        new Date(Date.now() + 600000),
      ],
    );
    const url = new URL(p.authorize);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: p.clientId,
      redirect_uri: `${h.config.baseUrl}/api/v1/auth/oauth/${c.params.provider}/callback`,
      state,
    }).toString();
    return { redirect: url.toString() };
  };
  h.add("get", "/auth/oauth/:provider/start", "public", undefined, (c) =>
    start(c),
  );
  h.add(
    "post",
    "/me/identities/:provider/link",
    "member",
    z.object({ password: z.string().max(128).optional() }).strict(),
    (c) => start(c, true),
    false,
  );
  h.add(
    "get",
    "/auth/oauth/:provider/callback",
    "public",
    undefined,
    async (c) => {
      const p = config(c.params.provider),
        state = z.string().min(32).max(128).parse(c.query.state);
      const token = await h.db.tx(async (q) => {
        const t = await one(
          q,
          `SELECT * FROM auth_tokens WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,
          [hash(state), `oauth:${c.params.provider}`],
        );
        demand(
          t && t.context.sessionHash === c.session?.token_hash,
          "INVALID_OAUTH_STATE",
          403,
        );
        await q.query(
          "UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1",
          [t.token_hash],
        );
        return t;
      });
      demand(!c.query.error, "OAUTH_CANCELLED", 422);
      const code = z.string().min(1).max(2048).parse(c.query.code);
      const data: any = {
        grant_type: "authorization_code",
        client_id: p.clientId,
        code,
        state,
        redirect_uri: `${h.config.baseUrl}/api/v1/auth/oauth/${c.params.provider}/callback`,
      };
      if (p.secret) data.client_secret = p.secret;
      const response = await fetch(p.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data),
        signal: AbortSignal.timeout(10000),
      });
      const credentials: any = await response.json();
      demand(
        response.ok && credentials.access_token,
        "OAUTH_PROVIDER_ERROR",
        503,
      );
      const profileResponse = await fetch(p.me, {
        headers: { Authorization: `Bearer ${credentials.access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      const profile: any = await profileResponse.json();
      const subject =
        c.params.provider === "kakao" ? profile.id : profile.response?.id;
      demand(profileResponse.ok && subject, "OAUTH_PROFILE_ERROR", 503);
      return h.db.tx(async (q) => {
        await q.query(
          "LOCK TABLE oauth_identities IN SHARE ROW EXCLUSIVE MODE",
        );
        if (token.context.link)
          demand(
            (await h.session(c.req, q))?.user_id === token.user_id,
            "UNAUTHENTICATED",
            401,
          );
        const existing = await one(
          q,
          "SELECT user_id FROM oauth_identities WHERE provider=$1 AND provider_subject=$2",
          [c.params.provider, String(subject)],
        );
        let uid = existing?.user_id;
        if (token.context.link) {
          demand(c.user?.id === token.user_id, "UNAUTHENTICATED", 401);
          demand(!uid || uid === token.user_id, "IDENTITY_ALREADY_LINKED");
          uid = token.user_id;
        }
        if (!uid) uid = await createAccount(q, null, "새 회원", null);
        demand(
          (await one(q, "SELECT status FROM users WHERE id=$1", [uid]))
            ?.status === "ACTIVE",
          "UNAUTHENTICATED",
          401,
        );
        await q.query(
          "INSERT INTO oauth_identities(user_id,provider,provider_subject) VALUES($1,$2,$3) ON CONFLICT(provider,provider_subject) DO NOTHING",
          [uid, c.params.provider, String(subject)],
        );
        await q.query("DELETE FROM sessions WHERE token_hash=$1", [
          c.session.token_hash,
        ]);
        const cookie = randomBytes(32).toString("hex");
        await q.query(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$4,$5)",
          [
            hash(cookie),
            uid,
            randomBytes(32).toString("hex"),
            new Date(Date.now() + h.config.idle * 1000),
            new Date(Date.now() + h.config.absolute * 1000),
          ],
        );
        c.res.cookie("bu_session", cookie, {
          httpOnly: true,
          secure: h.config.production,
          sameSite: "lax",
          path: "/",
        });
        return { redirect: h.config.origin + token.context.next };
      });
    },
  );
  h.add("get", "/me/identities", "member", undefined, async (c) => ({
    data: (
      await c.q.query(
        "SELECT provider FROM oauth_identities WHERE user_id=$1",
        [c.user.id],
      )
    ).rows,
    meta: {},
  }));
  h.add(
    "delete",
    "/me/identities/:provider",
    "member",
    z.object({ password: z.string().max(128).optional() }).strict(),
    async (c) => {
      await reauth(c);
      const u = await one(c.q, "SELECT * FROM users WHERE id=$1 FOR UPDATE", [
        c.user.id,
      ]);
      const identities = (
        await c.q.query(
          "SELECT provider FROM oauth_identities WHERE user_id=$1",
          [u.id],
        )
      ).rows;
      demand(
        (u.email && u.password_hash) ||
          identities.some((x) => x.provider !== c.params.provider),
        "LAST_LOGIN_METHOD",
      );
      await c.q.query(
        "DELETE FROM oauth_identities WHERE user_id=$1 AND provider=$2",
        [u.id, c.params.provider],
      );
      return { statusCode: 204 };
    },
  );
  h.add(
    "post",
    "/me/consents",
    "member",
    z.object({ termsVersion: text(40), privacyVersion: text(40) }).strict(),
    async (c) => {
      for (const [type, version] of [
        ["TERMS", c.body.termsVersion],
        ["PRIVACY", c.body.privacyVersion],
      ])
        await c.q.query(
          "INSERT INTO consents(id,user_id,document_type,document_version) VALUES($1,$2,$3,$4)",
          [id(), c.user.id, type, version],
        );
      return { accepted: true };
    },
  );
}
