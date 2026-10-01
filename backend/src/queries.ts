import { z } from "zod";
import { Http, Context } from "./http";
import { Sql, one } from "./db";
import { demand, page, paginated, uuid } from "./shared";
import { project, visibleProject } from "./policy";
const verifiedSQL = (alias: string) =>
  `EXISTS(SELECT 1 FROM school_verifications v WHERE v.user_id=${alias} AND v.state='VERIFIED' AND v.expires_at>now())`;
export async function summary(q: Sql, uid: string) {
  const u = await one(
    q,
    `SELECT u.id,u.display_name,p.id AS profile_id,p.visibility,p.avatar_media_id,${verifiedSQL("u.id")} AS verified FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=$1`,
    [uid],
  );
  return {
    userId: u.id,
    displayName: u.display_name,
    profileId: u.visibility === "PUBLIC" ? u.profile_id : null,
    avatarUrl: u.avatar_media_id
      ? `/api/v1/media/${u.avatar_media_id}/preview`
      : null,
    schoolVerified: u.verified,
  };
}
export async function projectDto(q: Sql, p: any) {
  return {
    ...p.terms,
    id: p.id,
    status: p.status,
    visibility: p.visibility,
    closesAt: p.closes_at,
    version: p.version,
    currentRevisionId: p.current_revision_id,
    createdAt: p.created_at,
    owner: await summary(q, p.owner_id),
    attachments: (
      await q.query(
        "SELECT m.id AS media_id,m.filename AS name,m.mime,m.size FROM media_links l JOIN media_objects m ON m.id=l.media_id WHERE l.target_type='PROJECT_REVISION' AND l.target_id=$1 AND m.state='READY'",
        [p.current_revision_id],
      )
    ).rows,
    applicantCount: Number(
      (
        await one(
          q,
          `SELECT count(*) AS n FROM proposals WHERE project_id=$1 AND status<>'WITHDRAWN'`,
          [p.id],
        )
      ).n,
    ),
  };
}
export async function expertDto(q: Sql, p: any) {
  const cover = await one(
    q,
    "SELECT v.body->'mediaIds'->>0 AS media_id FROM featured_portfolios f JOIN portfolios w ON w.id=f.portfolio_id JOIN portfolio_versions v ON v.id=w.published_version_id WHERE f.user_id=$1 AND w.visibility='PUBLIC' ORDER BY f.position LIMIT 1",
    [p.user_id],
  );
  const stats = await one(
    q,
    `SELECT count(*) AS n,avg(rating) AS rating FROM reviews WHERE subject_id=$1 AND subject_role='PROVIDER' AND visibility='PUBLIC'`,
    [p.user_id],
  );
  const completed = await one(
    q,
    `SELECT count(*) AS n FROM matches m JOIN projects p ON p.id=m.project_id WHERE m.provider_id=$1 AND p.status='COMPLETED'`,
    [p.user_id],
  );
  return {
    id: p.id,
    ...(await summary(q, p.user_id)),
    headline: p.headline,
    bio: p.bio,
    fields: p.field_ids,
    skills: p.skill_ids,
    availability: p.availability,
    rating: stats.rating === null ? null : Number(stats.rating),
    reviewCount: Number(stats.n),
    providerCompletedCount: Number(completed.n),
    responseHours: null,
    coverUrl: cover?.media_id
      ? `/api/v1/media/${cover.media_id}/preview`
      : null,
  };
}
export async function portfolioDto(q: Sql, p: any, own = false) {
  const vid = own ? p.current_version_id : p.published_version_id;
  const v = await one(q, "SELECT * FROM portfolio_versions WHERE id=$1", [vid]);
  return {
    id: p.id,
    ...v?.body,
    visibility: p.visibility,
    version: p.version,
    currentVersionId: own ? p.current_version_id : undefined,
    publishedVersionId: p.published_version_id,
    publishedAt: p.published_at,
    author: await summary(q, p.owner_id),
    verifiedWork: !!(await one(
      q,
      `SELECT id FROM publication_approvals WHERE portfolio_version_id=$1 AND state='APPROVED'`,
      [p.published_version_id],
    )),
    favoriteCount: Number(
      (
        await one(
          q,
          `SELECT count(*) AS n FROM favorites WHERE target_type='portfolios' AND target_id=$1`,
          [p.id],
        )
      ).n,
    ),
    viewCount: null,
    coverUrl: v?.body.mediaIds?.length
      ? `/api/v1/media/${v.body.mediaIds[0]}/preview`
      : null,
  };
}
export function queries(h: Http) {
  async function list(
    q: Sql,
    type: string,
    query: any,
    extra?: { owner?: string; active?: boolean },
  ) {
    const p = page(query),
      values: any[] = [],
      bind = (v: any) => {
        values.push(v);
        return `$${values.length}`;
      };
    const table =
        type === "projects"
          ? "projects"
          : type === "experts"
            ? "profiles"
            : "portfolios",
      ownerColumn = type === "experts" ? "user_id" : "owner_id";
    const conditions = [`u.status='ACTIVE'`];
    if (extra?.active) conditions.push("x.status='OPEN' AND x.closes_at>now()");
    if (extra?.owner) conditions.push(`x.${ownerColumn}=${bind(extra.owner)}`);
    else
      conditions.push(
        type === "projects"
          ? `x.visibility='PUBLIC' AND x.status NOT IN ('DRAFT','CANCELLED')`
          : `x.visibility='PUBLIC'`,
      );
    if (type === "projects" && query.status && extra?.owner)
      conditions.push(`x.status=${bind(String(query.status))}`);
    const body =
      type === "projects" ? "x.terms" : type === "portfolios" ? "v.body" : null;
    const arr = (v: any) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
    const fields = arr(query.fieldId),
      categories = arr(query.categoryId),
      skills = arr(query.skillId);
    for (const field of fields)
      demand(
        await one(
          q,
          "SELECT id FROM service_fields WHERE id=$1 AND enabled=true",
          [field],
        ),
        "INVALID_FIELD",
        400,
      );
    for (const cat of categories)
      demand(
        await one(q, "SELECT id FROM categories WHERE id=$1", [cat]),
        "INVALID_CATEGORY",
        400,
      );
    for (const skill of skills)
      demand(
        await one(q, "SELECT id FROM skills WHERE id=$1", [skill]),
        "INVALID_SKILL",
        400,
      );
    if (fields.length || categories.length) {
      const ids = [
        ...fields,
        ...(categories.length
          ? (
              await q.query(
                "SELECT id FROM service_fields WHERE category_id=ANY($1::text[]) AND enabled=true",
                [categories],
              )
            ).rows.map((x) => x.id)
          : []),
      ];
      conditions.push(
        type === "experts"
          ? `x.field_ids && ${bind(ids)}::text[]`
          : `${body}->>'fieldId'=ANY(${bind(ids)}::text[])`,
      );
    }
    if (skills.length)
      conditions.push(
        type === "experts"
          ? `x.skill_ids && ${bind(skills)}::text[]`
          : `(${body}->'skillIds') ?| ${bind(skills)}::text[]`,
      );
    if (query.q) {
      const search = z
        .string()
        .max(200)
        .parse(query.q)
        .trim()
        .replace(/[\\%_]/g, "\\$&");
      conditions.push(
        type === "experts"
          ? `concat(u.display_name,' ',x.headline,' ',x.bio,' ',array_to_string(x.skill_ids,' ')) ILIKE ${bind("%" + search + "%")}`
          : `concat(${body}->>'title',' ',${body}->>'summary',' ',${body}->>'content',' ',${body}->>'skillIds',' ',${body}->>'tags') ILIKE ${bind("%" + search + "%")}`,
      );
    }
    const bool = (name: string) =>
      query[name] === undefined
        ? false
        : z.enum(["true", "false"]).parse(query[name]) === "true";
    if (bool("schoolVerified")) conditions.push(verifiedSQL("u.id"));
    if (type === "projects") {
      const min =
          query.budgetMin === undefined
            ? null
            : z.coerce
                .number()
                .int()
                .min(0)
                .max(1000000000)
                .parse(query.budgetMin),
        max =
          query.budgetMax === undefined
            ? null
            : z.coerce
                .number()
                .int()
                .min(0)
                .max(1000000000)
                .parse(query.budgetMax);
      demand(min === null || max === null || min <= max, "INVALID_RANGE", 422);
      if (min !== null)
        conditions.push(`(x.terms->>'budgetMax')::bigint>=${bind(min)}`);
      if (max !== null)
        conditions.push(`(x.terms->>'budgetMin')::bigint<=${bind(max)}`);
      const lo =
          query.daysMin === undefined
            ? 1
            : z.coerce.number().int().min(1).max(365).parse(query.daysMin),
        hi =
          query.daysMax === undefined
            ? 365
            : z.coerce.number().int().min(1).max(365).parse(query.daysMax);
      demand(lo <= hi, "INVALID_RANGE", 422);
      if (!extra?.owner)
        conditions.push(
          `(x.terms->>'days')::int BETWEEN ${bind(lo)} AND ${bind(hi)}`,
        );
      if (query.mode)
        conditions.push(
          `x.terms->>'mode'=ANY(${bind(arr(query.mode).map((x) => z.enum(["ONLINE", "OFFLINE", "HYBRID"]).parse(x)))}::text[])`,
        );
      if (bool("urgent"))
        conditions.push(
          `x.status='OPEN' AND x.closes_at>now() AND x.closes_at<=now()+interval '72 hours'`,
        );
    }
    const reviewCount = `(SELECT count(*) FROM reviews r WHERE r.subject_id=u.id AND r.subject_role='PROVIDER' AND r.visibility='PUBLIC')`,
      rating = `(SELECT avg(rating) FROM reviews r WHERE r.subject_id=u.id AND r.subject_role='PROVIDER' AND r.visibility='PUBLIC')`,
      completed = `(SELECT count(*) FROM matches m JOIN projects p ON p.id=m.project_id WHERE m.provider_id=u.id AND p.status='COMPLETED')`;
    if (type === "experts") {
      if (bool("available")) conditions.push(`x.availability='AVAILABLE'`);
      if (query.ratingMin !== undefined)
        conditions.push(
          `${rating}>=${bind(z.coerce.number().min(1).max(5).parse(query.ratingMin))}`,
        );
      if (query.completedMin !== undefined)
        conditions.push(
          `${completed}>=${bind(z.coerce.number().int().min(0).parse(query.completedMin))}`,
        );
    }
    if (type === "portfolios" && bool("verifiedWork"))
      conditions.push(
        `EXISTS(SELECT 1 FROM publication_approvals a WHERE a.portfolio_version_id=x.published_version_id AND a.state='APPROVED')`,
      );
    const sorts: Record<string, string> =
      type === "projects"
        ? {
            newest: "x.created_at DESC",
            deadline: `(x.status='OPEN' AND x.closes_at>now()) DESC,x.closes_at ASC`,
            budget: `(x.terms->>'budgetMin')::bigint DESC NULLS LAST`,
          }
        : type === "experts"
          ? {
              reviews: `${reviewCount} DESC`,
              rating: `${rating} DESC NULLS LAST`,
              completed: `${completed} DESC`,
            }
          : {
              newest: "x.published_at DESC NULLS LAST",
              popular: `(SELECT count(*) FROM favorites f WHERE f.target_type='portfolios' AND f.target_id=x.id) DESC`,
            };
    const sort = String(
      query.sort || (type === "experts" ? "reviews" : "newest"),
    );
    demand(sort in sorts, "INVALID_SORT", 400);
    const from = `FROM ${table} x JOIN users u ON u.id=x.${ownerColumn}${type === "portfolios" ? ` JOIN portfolio_versions v ON v.id=x.${extra?.owner ? "current_version_id" : "published_version_id"}` : ""} WHERE ${conditions.join(" AND ")}`;
    const total = Number(
      (await one(q, `SELECT count(*) AS n ${from}`, values)).n,
    );
    if (bool("countOnly"))
      return { data: [], meta: { total, page: p.page, pageSize: p.pageSize } };
    const rows = (
      await q.query(
        `SELECT x.* ${from} ORDER BY ${sorts[sort]},x.id LIMIT ${bind(p.pageSize)} OFFSET ${bind(p.offset)}`,
        values,
      )
    ).rows;
    const data = [];
    for (const row of rows)
      data.push(
        type === "projects"
          ? await projectDto(q, row)
          : type === "experts"
            ? await expertDto(q, row)
            : await portfolioDto(q, row, !!extra?.owner),
      );
    return { data, meta: { total, page: p.page, pageSize: p.pageSize } };
  }
  for (const type of ["projects", "experts", "portfolios"])
    h.add("get", `/${type}`, "public", undefined, (c) =>
      list(c.q, type, c.query),
    );
  h.add("get", "/search", "public", undefined, async (c) => {
    if (c.query.type) {
      const type = z
        .enum(["projects", "experts", "portfolios"])
        .parse(c.query.type);
      return list(c.q, type, c.query);
    }
    const result: any = {};
    for (const type of ["projects", "experts", "portfolios"])
      result[type] = await list(c.q, type, { q: c.query.q, pageSize: 3 });
    return result;
  });
  h.add("get", "/home", "public", undefined, async (c) => {
    const result: any = {};
    for (const type of ["projects", "experts", "portfolios"])
      result[type] = (
        await list(
          c.q,
          type,
          { pageSize: 4 },
          type === "projects" ? { active: true } : undefined,
        )
      ).data;
    result.reviews = (
      await c.q.query(
        `SELECT r.id,r.rating,r.body,r.created_at FROM reviews r JOIN projects p ON p.id=r.project_id JOIN users a ON a.id=r.author_id JOIN users s ON s.id=r.subject_id WHERE r.visibility='PUBLIC' AND r.home_featured_opt_in=true AND r.subject_role='PROVIDER' AND p.status='COMPLETED' AND p.visibility='PUBLIC' AND a.status='ACTIVE' AND s.status='ACTIVE' ORDER BY r.created_at DESC,r.id LIMIT 4`,
      )
    ).rows;
    if (result.reviews.length < 3) result.reviews = [];
    result.recommendedKeywords = ["포스터", "영상 편집", "React", "PPT"];
    return result;
  });
  h.add("get", "/categories", "public", undefined, async (c) => ({
    categories: (await c.q.query("SELECT * FROM categories ORDER BY position"))
      .rows,
    fields: (
      await c.q.query(
        "SELECT * FROM service_fields WHERE enabled=true ORDER BY category_id,group_label,label",
      )
    ).rows,
    taxonomyVersion: 1,
  }));
  h.add("get", "/skills", "public", undefined, async (c) => ({
    data: (
      await c.q.query(
        `SELECT * FROM skills WHERE label ILIKE $1 OR EXISTS(SELECT 1 FROM unnest(aliases) a WHERE a ILIKE $1) ORDER BY label LIMIT 50`,
        ["%" + String(c.query.q || "").slice(0, 100) + "%"],
      )
    ).rows,
    meta: { taxonomyVersion: 1 },
  }));
  h.add("get", "/projects/:id", "public", undefined, async (c) => {
    const p = await project(c.q, c.params.id, c.user?.id);
    visibleProject(p, c.user?.id);
    return projectDto(c.q, p);
  });
  h.add("get", "/experts/:id", "public", undefined, async (c) => {
    const p = await one(
      c.q,
      `SELECT p.* FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.visibility='PUBLIC' AND u.status='ACTIVE'`,
      [c.params.id],
    );
    demand(p, "NOT_FOUND", 404);
    const works = (
      await c.q.query(
        `SELECT p.* FROM featured_portfolios f JOIN portfolios p ON p.id=f.portfolio_id WHERE f.user_id=$1 AND p.visibility='PUBLIC' ORDER BY f.position`,
        [p.user_id],
      )
    ).rows;
    return {
      ...(await expertDto(c.q, p)),
      careers: (
        await c.q.query("SELECT body FROM careers WHERE user_id=$1", [
          p.user_id,
        ])
      ).rows.map((x) => x.body),
      services: (
        await c.q.query("SELECT body FROM offered_services WHERE user_id=$1", [
          p.user_id,
        ])
      ).rows.map((x) => x.body),
      featuredPortfolios: await Promise.all(
        works.map((w) => portfolioDto(c.q, w)),
      ),
    };
  });
  h.add("get", "/portfolios/:id", "public", undefined, async (c) => {
    const p = await one(
      c.q,
      `SELECT p.* FROM portfolios p JOIN users u ON u.id=p.owner_id WHERE p.id=$1 AND u.status='ACTIVE'`,
      [c.params.id],
    );
    demand(
      p && (p.visibility === "PUBLIC" || p.owner_id === c.user?.id),
      "NOT_FOUND",
      404,
    );
    return portfolioDto(
      c.q,
      p,
      p.owner_id === c.user?.id && p.visibility !== "PUBLIC",
    );
  });
  for (const type of ["experts", "portfolios"])
    h.add("get", `/${type}/:id/reviews`, "public", undefined, async (c) => {
      let rows;
      if (type === "experts") {
        const p = await one(
          c.q,
          `SELECT p.user_id FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.visibility='PUBLIC' AND u.status='ACTIVE'`,
          [c.params.id],
        );
        demand(p, "NOT_FOUND", 404);
        rows = (
          await c.q.query(
            `SELECT id,rating,body,created_at FROM reviews WHERE subject_id=$1 AND subject_role='PROVIDER' AND visibility='PUBLIC' ORDER BY created_at DESC`,
            [p.user_id],
          )
        ).rows;
      } else {
        const p = await one(
          c.q,
          `SELECT p.* FROM portfolios p JOIN users u ON u.id=p.owner_id WHERE p.id=$1 AND p.visibility='PUBLIC' AND u.status='ACTIVE'`,
          [c.params.id],
        );
        demand(p, "NOT_FOUND", 404);
        rows = (
          await c.q.query(
            `SELECT r.id,r.rating,r.body,r.created_at FROM reviews r JOIN publication_approvals a ON a.project_id=r.project_id WHERE a.portfolio_version_id=$1 AND a.state='APPROVED' AND r.subject_id=$2 AND r.visibility='PUBLIC'`,
            [p.published_version_id, p.owner_id],
          )
        ).rows;
      }
      return paginated(rows, c.query);
    });
  h.add("get", "/experts/:id/portfolios", "public", undefined, async (c) => {
    const p = await one(
      c.q,
      `SELECT p.user_id FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.visibility='PUBLIC' AND u.status='ACTIVE'`,
      [c.params.id],
    );
    demand(p, "NOT_FOUND", 404);
    const rows = (
      await c.q.query(
        `SELECT * FROM portfolios WHERE owner_id=$1 AND visibility='PUBLIC' ORDER BY published_at DESC,id`,
        [p.user_id],
      )
    ).rows;
    const paged = paginated(rows, c.query);
    return {
      ...paged,
      data: await Promise.all(paged.data.map((x: any) => portfolioDto(c.q, x))),
    };
  });
  for (const type of ["projects", "portfolios"])
    h.add("get", `/me/${type}`, "member", undefined, (c) =>
      list(c.q, type, c.query, { owner: c.user.id }),
    );
  for (const type of ["proposals", "workrooms", "direct-requests", "reviews"])
    h.add("get", `/me/${type}`, "member", undefined, async (c) => {
      let sql: string;
      if (type === "proposals")
        sql =
          "SELECT a.*,p.terms AS project_summary FROM proposals a JOIN projects p ON p.id=a.project_id WHERE a.applicant_id=$1 ORDER BY a.created_at DESC";
      else if (type === "workrooms")
        sql =
          "SELECT w.*,p.status,p.terms AS project_summary FROM workrooms w JOIN projects p ON p.id=w.project_id JOIN matches m ON m.id=w.match_id WHERE p.owner_id=$1 OR m.provider_id=$1 ORDER BY w.id";
      else if (type === "reviews")
        sql = `SELECT * FROM reviews WHERE ${c.query.direction === "written" ? "author_id" : "subject_id"}=$1 ORDER BY created_at DESC`;
      else {
        demand(
          ["sent", "received", undefined].includes(c.query.direction),
          "INVALID_DIRECTION",
          400,
        );
        sql = `SELECT r.*,t.terms AS latest_terms FROM direct_requests r JOIN direct_request_terms t ON t.id=r.latest_terms_id WHERE ${c.query.direction === "received" ? "recipient_id" : "sender_id"}=$1 ORDER BY r.created_at DESC`;
      }
      return paginated((await c.q.query(sql, [c.user.id])).rows, c.query);
    });
  h.add("get", "/me/dashboard", "member", undefined, async (c) => {
    const count = async (sql: string) =>
      Number((await one(c.q, sql, [c.user.id])).n);
    return {
      projects: await count(
        "SELECT count(*) n FROM projects WHERE owner_id=$1",
      ),
      proposals: await count(
        "SELECT count(*) n FROM proposals WHERE applicant_id=$1",
      ),
      sentRequests: await count(
        "SELECT count(*) n FROM direct_requests WHERE sender_id=$1",
      ),
      receivedRequests: await count(
        "SELECT count(*) n FROM direct_requests WHERE recipient_id=$1",
      ),
    };
  });
  async function target(
    q: Sql,
    type: string,
    targetId: string,
    actor?: string,
  ) {
    if (type === "projects") {
      const p = await project(q, targetId);
      visibleProject(p, actor);
      return projectDto(q, p);
    }
    if (type === "experts") {
      const p = await one(
        q,
        `SELECT p.* FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.visibility='PUBLIC' AND u.status='ACTIVE'`,
        [targetId],
      );
      demand(p, "NOT_FOUND", 404);
      return expertDto(q, p);
    }
    const p = await one(
      q,
      `SELECT p.* FROM portfolios p JOIN users u ON u.id=p.owner_id WHERE p.id=$1 AND p.visibility='PUBLIC' AND u.status='ACTIVE'`,
      [targetId],
    );
    demand(p, "NOT_FOUND", 404);
    return portfolioDto(q, p);
  }
  for (const method of ["put", "delete"])
    h.add(
      method,
      "/me/favorites/:type/:id",
      "member",
      z.object({}).strict(),
      async (c) => {
        const type = z
          .enum(["projects", "experts", "portfolios"])
          .parse(c.params.type);
        if (method === "put") {
          await target(c.q, type, c.params.id, c.user.id);
          await c.q.query(
            "INSERT INTO favorites(user_id,target_type,target_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [c.user.id, type, c.params.id],
          );
        } else
          await c.q.query(
            "DELETE FROM favorites WHERE user_id=$1 AND target_type=$2 AND target_id=$3",
            [c.user.id, type, c.params.id],
          );
        return { saved: method === "put" };
      },
    );
  h.add("get", "/me/favorites", "member", undefined, async (c) => {
    const rows = (
      await c.q.query(
        "SELECT * FROM favorites WHERE user_id=$1 ORDER BY created_at DESC",
        [c.user.id],
      )
    ).rows;
    const out = [];
    for (const row of rows)
      try {
        out.push({
          type: row.target_type,
          item: await target(c.q, row.target_type, row.target_id, c.user.id),
        });
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }
    return paginated(out, c.query);
  });
  h.add(
    "post",
    "/me/viewer-state",
    "member",
    z
      .object({
        targets: z
          .array(
            z.object({
              type: z.enum(["projects", "experts", "portfolios"]),
              id: uuid,
            }),
          )
          .max(50),
      })
      .strict(),
    async (c) => {
      const results = [];
      for (const t of c.body.targets) {
        try {
          const item: any = await target(c.q, t.type, t.id, c.user.id);
          const own =
            (item.owner?.userId || item.author?.userId || item.userId) ===
            c.user.id;
          const proposal =
            t.type === "projects"
              ? await one(
                  c.q,
                  "SELECT id,status,current_revision_id FROM proposals WHERE project_id=$1 AND applicant_id=$2",
                  [t.id, c.user.id],
                )
              : null;
          const allowedActions = own ? ["manage"] : ["save"];
          const denialReasons: string[] = [];
          let eligible = true;
          try {
            await h.verified(c.q, c.user.id);
          } catch (e: any) {
            if (e.status !== 403) throw e;
            eligible = false;
            denialReasons.push(e.code);
          }
          if (t.type === "projects") {
            if (
              !own &&
              !proposal &&
              eligible &&
              item.status === "OPEN" &&
              Date.parse(item.closesAt) > Date.now()
            )
              allowedActions.push("apply");
            if (proposal) denialReasons.push("ALREADY_APPLIED");
            if (
              item.status !== "OPEN" ||
              Date.parse(item.closesAt) <= Date.now()
            )
              denialReasons.push("RECRUITMENT_CLOSED");
            if (own && item.status === "DRAFT" && eligible)
              allowedActions.push("publish");
            if (own && item.status === "OPEN")
              allowedActions.push("close", "select");
            if (own && item.status === "CLOSED") allowedActions.push("select");
            if (own && ["DRAFT", "OPEN", "CLOSED"].includes(item.status))
              allowedActions.push("cancel");
            const workroom = await one(
              c.q,
              "SELECT w.id FROM workrooms w JOIN projects p ON p.id=w.project_id JOIN matches m ON m.id=w.match_id WHERE w.project_id=$1 AND (p.owner_id=$2 OR m.provider_id=$2)",
              [t.id, c.user.id],
            );
            if (workroom) allowedActions.push("openWorkroom");
          }
          if (t.type === "experts" && !own && eligible && item.schoolVerified)
            allowedActions.push("directRequest");
          results.push({
            targetType: t.type,
            targetId: t.id,
            isOwner: own,
            isSaved: !!(await one(
              c.q,
              "SELECT 1 FROM favorites WHERE user_id=$1 AND target_type=$2 AND target_id=$3",
              [c.user.id, t.type, t.id],
            )),
            myProposal: proposal || null,
            allowedActions,
            denialReasons,
          });
        } catch (e: any) {
          if (e.status !== 404) throw e;
        }
      }
      return results;
    },
    false,
  );
}
