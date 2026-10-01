import { z } from "zod";
import { Http, Context } from "../http";
import { one } from "../db";
import {
  demand,
  id,
  expected,
  uuid,
  text,
  versionInput,
  ids,
  paginated,
} from "../shared";
import { project, member, emit } from "../policy";
import { linkOwned } from "./matching";
export function profile(h: Http) {
  const schema = z
    .object({
      expectedVersion: z.number().int().positive(),
      avatarMediaId: uuid.nullable().optional(),
      headline: z.string().max(100).optional(),
      bio: z.string().max(2000).optional(),
      visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
      availability: z.enum(["AVAILABLE", "BUSY"]).optional(),
      fieldIds: z.array(z.string()).max(20).optional(),
      skillIds: z.array(z.string()).max(30).optional(),
    })
    .strict();
  h.add("get", "/me/profile", "member", undefined, async (c) =>
    one(c.q, "SELECT * FROM profiles WHERE user_id=$1", [c.user.id]),
  );
  h.add("patch", "/me/profile", "member", schema, async (c) => {
    const p = await one(
      c.q,
      "SELECT * FROM profiles WHERE user_id=$1 FOR UPDATE",
      [c.user.id],
    );
    expected(p, c.body);
    if (c.body.avatarMediaId) {
      const media = await one(
        c.q,
        "SELECT m.id FROM media_objects m JOIN uploads u ON u.media_id=m.id WHERE m.id=$1 AND m.owner_id=$2 AND m.state='READY' AND m.mime LIKE 'image/%' AND u.purpose='AVATAR'",
        [c.body.avatarMediaId, c.user.id],
      );
      demand(media, "INVALID_AVATAR", 422);
    }
    if (c.body.avatarMediaId !== undefined)
      await c.q.query("UPDATE profiles SET avatar_media_id=$2 WHERE id=$1", [
        p.id,
        c.body.avatarMediaId,
      ]);
    for (const field of c.body.fieldIds || [])
      demand(
        await one(
          c.q,
          "SELECT id FROM service_fields WHERE id=$1 AND enabled=true",
          [field],
        ),
        "INVALID_FIELD",
        422,
      );
    for (const skill of c.body.skillIds || [])
      demand(
        await one(c.q, "SELECT id FROM skills WHERE id=$1", [skill]),
        "INVALID_SKILL",
        422,
      );
    return one(
      c.q,
      "UPDATE profiles SET headline=coalesce($2,headline),bio=coalesce($3,bio),visibility=coalesce($4,visibility),availability=coalesce($5,availability),field_ids=coalesce($6,field_ids),skill_ids=coalesce($7,skill_ids),version=version+1 WHERE user_id=$1 RETURNING *",
      [
        c.user.id,
        c.body.headline,
        c.body.bio,
        c.body.visibility,
        c.body.availability,
        c.body.fieldIds,
        c.body.skillIds,
      ],
    );
  });
  for (const [path, table] of [
    ["careers", "careers"],
    ["services", "offered_services"],
  ]) {
    const item = z
      .object({
        title: text(100),
        description: z.string().max(2000).default(""),
        startDate: z.string().date().optional(),
        endDate: z.string().date().optional(),
      })
      .strict();
    h.add("get", `/me/${path}`, "member", undefined, async (c) =>
      paginated(
        (
          await c.q.query(
            `SELECT * FROM ${table} WHERE user_id=$1 ORDER BY id`,
            [c.user.id],
          )
        ).rows,
        c.query,
      ),
    );
    h.add("post", `/me/${path}`, "member", item, async (c) => {
      const rid = id();
      await c.q.query(
        `INSERT INTO ${table}(id,user_id,body) VALUES($1,$2,$3)`,
        [rid, c.user.id, JSON.stringify(c.body)],
      );
      return { id: rid, version: 1, ...c.body };
    });
    h.add(
      "patch",
      `/me/${path}/:id`,
      "member",
      item.extend({ expectedVersion: z.number().int().positive() }),
      async (c) => {
        const r = await one(
          c.q,
          `SELECT * FROM ${table} WHERE id=$1 AND user_id=$2 FOR UPDATE`,
          [c.params.id, c.user.id],
        );
        demand(r, "NOT_FOUND", 404);
        expected(r, c.body);
        const { expectedVersion, ...body } = c.body;
        return one(
          c.q,
          `UPDATE ${table} SET body=$2,version=version+1 WHERE id=$1 RETURNING *`,
          [r.id, JSON.stringify(body)],
        );
      },
    );
    h.add(
      "delete",
      `/me/${path}/:id`,
      "member",
      versionInput.strict(),
      async (c) => {
        const r = await one(
          c.q,
          `SELECT * FROM ${table} WHERE id=$1 AND user_id=$2 FOR UPDATE`,
          [c.params.id, c.user.id],
        );
        demand(r, "NOT_FOUND", 404);
        expected(r, c.body);
        await c.q.query(`DELETE FROM ${table} WHERE id=$1`, [r.id]);
        return { statusCode: 204 };
      },
    );
  }
  // Metadata only: no content block/editor schema is invented before the user's design.
  const portfolioInput = z
    .object({
      title: text(100),
      summary: text(200),
      role: text(200),
      fieldId: text(100),
      skillIds: z.array(z.string()).max(30).default([]),
      mediaIds: ids,
    })
    .strict();
  const newVersion = async (c: Context, pid: string, seq: number) => {
    demand(
      await one(c.q, "SELECT id FROM service_fields WHERE id=$1", [
        c.body.fieldId,
      ]),
      "INVALID_FIELD",
      422,
    );
    for (const sid of c.body.skillIds)
      demand(
        await one(c.q, "SELECT id FROM skills WHERE id=$1", [sid]),
        "INVALID_SKILL",
        422,
      );
    const vid = id(),
      { expectedVersion, ...body } = c.body;
    await c.q.query(
      "INSERT INTO portfolio_versions(id,portfolio_id,revision_no,body) VALUES($1,$2,$3,$4)",
      [vid, pid, seq, JSON.stringify(body)],
    );
    await linkOwned(c.q, c.user.id, c.body.mediaIds, "PORTFOLIO_VERSION", vid);
    return vid;
  };
  h.add("post", "/portfolios", "member", portfolioInput, async (c) => {
    const pid = id();
    await c.q.query("INSERT INTO portfolios(id,owner_id) VALUES($1,$2)", [
      pid,
      c.user.id,
    ]);
    const vid = await newVersion(c, pid, 1);
    await c.q.query("UPDATE portfolios SET current_version_id=$2 WHERE id=$1", [
      pid,
      vid,
    ]);
    return {
      id: pid,
      currentVersionId: vid,
      version: 1,
      visibility: "PRIVATE",
    };
  });
  h.add(
    "patch",
    "/portfolios/:id",
    "member",
    portfolioInput.extend({ expectedVersion: z.number().int().positive() }),
    async (c) => {
      const p = await one(
        c.q,
        "SELECT * FROM portfolios WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [c.params.id, c.user.id],
      );
      demand(p, "NOT_FOUND", 404);
      expected(p, c.body);
      const vid = await newVersion(c, p.id, p.version + 1);
      await c.q.query(
        "UPDATE portfolios SET current_version_id=$2,version=version+1 WHERE id=$1",
        [p.id, vid],
      );
      return { id: p.id, currentVersionId: vid, version: p.version + 1 };
    },
  );
  for (const action of ["publish", "unpublish"])
    h.add(
      "post",
      `/portfolios/:id/${action}`,
      "member",
      versionInput.strict(),
      async (c) => {
        const p = await one(
          c.q,
          "SELECT * FROM portfolios WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [c.params.id, c.user.id],
        );
        demand(p, "NOT_FOUND", 404);
        expected(p, c.body);
        if (action === "publish") await h.verified(c.q, c.user.id);
        await c.q.query(
          `UPDATE portfolios SET visibility=$2,published_version_id=$3,published_at=CASE WHEN $2='PUBLIC' THEN now() ELSE published_at END,version=version+1 WHERE id=$1`,
          [
            p.id,
            action === "publish" ? "PUBLIC" : "PRIVATE",
            action === "publish" ? p.current_version_id : null,
          ],
        );
        if (action === "unpublish")
          await c.q.query(
            "DELETE FROM featured_portfolios WHERE portfolio_id=$1",
            [p.id],
          );
        return {
          id: p.id,
          version: p.version + 1,
          visibility: action === "publish" ? "PUBLIC" : "PRIVATE",
        };
      },
    );
  h.add(
    "put",
    "/me/featured-portfolios",
    "member",
    versionInput.extend({ portfolioIds: z.array(uuid).max(3) }).strict(),
    async (c) => {
      const p = await one(
        c.q,
        "SELECT * FROM profiles WHERE user_id=$1 FOR UPDATE",
        [c.user.id],
      );
      expected(p, c.body);
      demand(
        new Set(c.body.portfolioIds).size === c.body.portfolioIds.length,
        "DUPLICATE_PORTFOLIO",
        422,
      );
      for (const pid of c.body.portfolioIds)
        demand(
          await one(
            c.q,
            `SELECT id FROM portfolios WHERE id=$1 AND owner_id=$2 AND visibility='PUBLIC'`,
            [pid, c.user.id],
          ),
          "PORTFOLIO_NOT_PUBLIC_OR_OWNED",
          422,
        );
      await c.q.query("DELETE FROM featured_portfolios WHERE user_id=$1", [
        c.user.id,
      ]);
      for (const [i, pid] of c.body.portfolioIds.entries())
        await c.q.query("INSERT INTO featured_portfolios VALUES($1,$2,$3)", [
          c.user.id,
          pid,
          i,
        ]);
      await c.q.query("UPDATE profiles SET version=version+1 WHERE id=$1", [
        p.id,
      ]);
      return { version: p.version + 1, portfolioIds: c.body.portfolioIds };
    },
  );
  h.add(
    "post",
    "/portfolios/:id/publication-requests",
    "member",
    z.object({ projectId: uuid, portfolioVersionId: uuid }).strict(),
    async (c) => {
      const p = await project(c.q, c.body.projectId, c.user.id, true);
      demand(
        p.provider_id === c.user.id && p.status === "COMPLETED",
        "NOT_ELIGIBLE",
        403,
      );
      const v = await one(
        c.q,
        "SELECT v.id FROM portfolio_versions v JOIN portfolios p ON p.id=v.portfolio_id WHERE v.id=$1 AND p.id=$2 AND p.owner_id=$3",
        [c.body.portfolioVersionId, c.params.id, c.user.id],
      );
      demand(v, "NOT_FOUND", 404);
      const rid = id();
      await c.q.query(
        "INSERT INTO publication_approvals(id,project_id,portfolio_version_id,requester_id) VALUES($1,$2,$3,$4)",
        [rid, p.id, v.id, c.user.id],
      );
      await emit(c.q, "portfolio.publication_requested", rid, 1, [p.owner_id], {
        publicationRequestId: rid,
        projectId: p.id,
      });
      return { id: rid, state: "PENDING_APPROVAL", version: 1 };
    },
  );
  h.add("get", "/publication-requests/:id", "member", undefined, async (c) => {
    const r = await one(
      c.q,
      "SELECT * FROM publication_approvals WHERE id=$1",
      [c.params.id],
    );
    demand(r, "NOT_FOUND", 404);
    member(await project(c.q, r.project_id), c.user.id);
    return r;
  });
  h.add("get", "/me/publication-requests", "member", undefined, async (c) =>
    paginated(
      (
        await c.q.query(
          "SELECT a.* FROM publication_approvals a JOIN projects p ON p.id=a.project_id WHERE a.requester_id=$1 OR p.owner_id=$1 ORDER BY a.id",
          [c.user.id],
        )
      ).rows,
      c.query,
    ),
  );
  for (const action of ["approve", "reject", "cancel"])
    h.add(
      "post",
      `/publication-requests/:id/${action}`,
      "member",
      versionInput.strict(),
      async (c) => {
        const r = await one(
          c.q,
          "SELECT * FROM publication_approvals WHERE id=$1 FOR UPDATE",
          [c.params.id],
        );
        demand(r, "NOT_FOUND", 404);
        const p = await project(c.q, r.project_id);
        demand(
          c.user.id === (action === "cancel" ? r.requester_id : p.owner_id),
          "NOT_FOUND",
          404,
        );
        expected(r, c.body);
        demand(r.state === "PENDING_APPROVAL");
        const state =
          action === "approve"
            ? "APPROVED"
            : action === "reject"
              ? "REJECTED"
              : "CANCELLED";
        await c.q.query(
          "UPDATE publication_approvals SET state=$2,decided_by=$3,version=version+1 WHERE id=$1",
          [r.id, state, c.user.id],
        );
        await emit(
          c.q,
          "portfolio.publication_resolved",
          r.id,
          r.version + 1,
          [r.requester_id],
          { publicationRequestId: r.id },
        );
        return { state, version: r.version + 1 };
      },
    );
}
