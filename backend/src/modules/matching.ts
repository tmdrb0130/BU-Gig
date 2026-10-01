import { z } from "zod";
import { Http, Context } from "../http";
import { Sql, one } from "../db";
import {
  demand,
  id,
  expected,
  termsSchema,
  text,
  money,
  days,
  uuid,
  ids,
  versionInput,
  paginated,
} from "../shared";
import { project, owner, visibleProject, emit } from "../policy";
import { summary } from "../queries";
export async function validateTerms(q: Sql, body: any) {
  const terms = termsSchema.parse(body);
  demand(
    await one(q, "SELECT id FROM service_fields WHERE id=$1 AND enabled=true", [
      terms.fieldId,
    ]),
    "INVALID_FIELD",
    422,
  );
  for (const skill of terms.skillIds)
    demand(
      await one(q, "SELECT id FROM skills WHERE id=$1", [skill]),
      "INVALID_SKILL",
      422,
    );
  return terms;
}
export async function linkOwned(
  q: Sql,
  actor: string,
  mediaIds: string[],
  type: string,
  target: string,
) {
  for (const mediaId of [...new Set(mediaIds)]) {
    const m = await one(
      q,
      "SELECT * FROM media_objects WHERE id=$1 FOR UPDATE",
      [mediaId],
    );
    demand(
      m?.owner_id === actor && m.state === "READY",
      "MEDIA_NOT_READY_OR_OWNED",
      422,
    );
    const upload = await one(
      q,
      "SELECT purpose,target_id FROM uploads WHERE media_id=$1",
      [mediaId],
    );
    const allowed: Record<string, string[]> = {
      PROJECT_REVISION: ["PROJECT"],
      WORKROOM: ["WORKROOM"],
      COMPLETION: ["WORKROOM"],
      MESSAGE: ["WORKROOM", "PROPOSAL", "DIRECT_REQUEST"],
      PROPOSAL_REVISION: ["PROPOSAL"],
      DIRECT_TERMS: ["DIRECT_REQUEST"],
      PORTFOLIO_VERSION: ["PORTFOLIO"],
    };
    demand(
      upload && allowed[type]?.includes(upload.purpose),
      "MEDIA_PURPOSE_MISMATCH",
      422,
    );
    let context: any;
    if (type === "WORKROOM") context = { target: target };
    if (type === "PROJECT_REVISION")
      context = await one(
        q,
        "SELECT project_id AS target FROM project_revisions WHERE id=$1",
        [target],
      );
    if (type === "COMPLETION")
      context = await one(
        q,
        "SELECT w.id AS target FROM completion_requests r JOIN workrooms w ON w.project_id=r.project_id WHERE r.id=$1",
        [target],
      );
    if (type === "PROPOSAL_REVISION")
      context = await one(
        q,
        "SELECT p.project_id AS target FROM proposal_revisions r JOIN proposals p ON p.id=r.proposal_id WHERE r.id=$1",
        [target],
      );
    if (type === "MESSAGE") {
      const conv = await one(
        q,
        "SELECT c.* FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1",
        [target],
      );
      if (upload.purpose === "WORKROOM")
        context = await one(
          q,
          "SELECT id AS target FROM workrooms WHERE conversation_id=$1",
          [conv.id],
        );
      if (upload.purpose === "PROPOSAL") context = { target: conv.project_id };
      if (upload.purpose === "DIRECT_REQUEST")
        context = { target: conv.direct_request_id };
    }
    if (
      [
        "PROJECT_REVISION",
        "WORKROOM",
        "COMPLETION",
        "PROPOSAL_REVISION",
        "MESSAGE",
      ].includes(type)
    )
      demand(
        context?.target &&
          ((!upload.target_id && upload.purpose === "DIRECT_REQUEST") ||
            upload.target_id === context.target),
        "MEDIA_TARGET_MISMATCH",
        422,
      );
    await q.query(
      "INSERT INTO media_links(media_id,target_type,target_id,linked_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [mediaId, type, target, actor],
    );
  }
}
export async function createConversation(
  q: Sql,
  ownerId: string,
  providerId: string,
  projectId?: string,
  requestId?: string,
) {
  let c = await one(
    q,
    projectId
      ? "SELECT * FROM conversations WHERE project_id=$1 AND applicant_id=$2"
      : "SELECT * FROM conversations WHERE direct_request_id=$1",
    projectId ? [projectId, providerId] : [requestId],
  );
  if (!c) {
    c = { id: id() };
    await q.query(
      "INSERT INTO conversations(id,project_id,applicant_id,direct_request_id) VALUES($1,$2,$3,$4)",
      [
        c.id,
        projectId || null,
        projectId ? providerId : null,
        requestId || null,
      ],
    );
    for (const uid of [ownerId, providerId])
      await q.query(
        "INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2)",
        [c.id, uid],
      );
  }
  return c.id;
}
export async function createMatch(
  q: Sql,
  p: any,
  providerId: string,
  terms: any,
  source: { proposalRevisionId?: string; requestId?: string; termsId?: string },
) {
  const matchId = id(),
    workroomId = id(),
    contractId = id(),
    versionId = id();
  await q.query(
    "INSERT INTO matches(id,project_id,provider_id,proposal_revision_id,direct_request_id,direct_terms_id,agreed_terms) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      matchId,
      p.id,
      providerId,
      source.proposalRevisionId || null,
      source.requestId || null,
      source.termsId || null,
      JSON.stringify(terms),
    ],
  );
  const conversationId = await createConversation(
    q,
    p.owner_id,
    providerId,
    source.requestId ? undefined : p.id,
    source.requestId,
  );
  await q.query(
    "INSERT INTO workrooms(id,project_id,match_id,conversation_id) VALUES($1,$2,$3,$4)",
    [workroomId, p.id, matchId, conversationId],
  );
  await q.query("INSERT INTO contracts(id,workroom_id) VALUES($1,$2)", [
    contractId,
    workroomId,
  ]);
  const body = {
    scope: terms.content,
    deliverables: terms.deliverables,
    amount: terms.budgetMin,
    days: terms.days,
    revisions: terms.requirements || "",
    otherAgreements: "",
    ownerId: p.owner_id,
    providerId,
  };
  await q.query(
    "INSERT INTO contract_versions(id,contract_id,sequence,author_id,body) VALUES($1,$2,1,$3,$4)",
    [versionId, contractId, p.owner_id, JSON.stringify(body)],
  );
  await q.query("UPDATE contracts SET review_version_id=$2 WHERE id=$1", [
    contractId,
    versionId,
  ]);
  await q.query(
    `UPDATE projects SET status='MATCHED',version=version+1 WHERE id=$1`,
    [p.id],
  );
  await emit(
    q,
    "project.matched",
    p.id,
    p.version + 1,
    [p.owner_id, providerId],
    { projectId: p.id, workroomId, conversationId },
  );
  return { projectId: p.id, matchId, workroomId, contractId };
}
export function matching(h: Http) {
  const draft = z
    .object({
      terms: z
        .record(z.unknown())
        .refine(
          (v) =>
            Object.keys(v).every((k) =>
              [
                "title",
                "summary",
                "content",
                "deliverables",
                "requirements",
                "referenceUrl",
                "mediaIds",
                "fieldId",
                "skillIds",
                "tags",
                "budgetType",
                "budgetMin",
                "budgetMax",
                "days",
                "mode",
              ].includes(k),
            ),
          "Unknown term field",
        )
        .default({}),
      closesAt: z.string().datetime({ offset: true }).optional(),
    })
    .strict();
  h.add("post", "/projects", "member", draft, async (c) => {
    const pid = id();
    await c.q.query(
      "INSERT INTO projects(id,owner_id,terms,closes_at) VALUES($1,$2,$3,$4)",
      [pid, c.user.id, JSON.stringify(c.body.terms), c.body.closesAt || null],
    );
    return { id: pid, status: "DRAFT", version: 1 };
  });
  h.add(
    "patch",
    "/projects/:id",
    "member",
    draft.extend({ expectedVersion: z.number().int().positive() }),
    async (c) => {
      const p = await project(c.q, c.params.id, c.user.id, true);
      owner(p, c.user.id);
      expected(p, c.body);
      demand(["DRAFT", "OPEN", "CLOSED"].includes(p.status));
      const merged = { ...p.terms, ...c.body.terms };
      if (p.status !== "DRAFT") await validateTerms(c.q, merged);
      let revision = p.current_revision_id;
      if (p.status !== "DRAFT") {
        revision = id();
        await c.q.query(
          "INSERT INTO project_revisions(id,project_id,revision_no,terms) VALUES($1,$2,$3,$4)",
          [revision, p.id, p.version + 1, JSON.stringify(merged)],
        );
        await linkOwned(
          c.q,
          c.user.id,
          merged.mediaIds || [],
          "PROJECT_REVISION",
          revision,
        );
      }
      await c.q.query(
        "UPDATE projects SET terms=$2,closes_at=coalesce($3,closes_at),current_revision_id=$4,version=version+1 WHERE id=$1",
        [p.id, JSON.stringify(merged), c.body.closesAt || null, revision],
      );
      const recipients = (
        await c.q.query(
          "SELECT applicant_id FROM proposals WHERE project_id=$1",
          [p.id],
        )
      ).rows.map((x) => x.applicant_id);
      await emit(c.q, "project.updated", p.id, p.version + 1, recipients, {
        projectId: p.id,
      });
      return {
        ...p,
        terms: merged,
        version: p.version + 1,
        currentRevisionId: revision,
      };
    },
  );
  for (const action of ["publish", "close", "cancel"])
    h.add(
      "post",
      `/projects/:id/${action}`,
      "member",
      versionInput.strict(),
      async (c) => {
        const p = await project(c.q, c.params.id, c.user.id, true);
        owner(p, c.user.id);
        expected(p, c.body);
        let revision = p.current_revision_id;
        if (action === "publish") {
          await h.verified(c.q, c.user.id);
          demand(p.status === "DRAFT");
          await validateTerms(c.q, p.terms);
          demand(
            p.closes_at && new Date(p.closes_at).getTime() > Date.now(),
            "INVALID_DEADLINE",
            422,
          );
          revision = id();
          await c.q.query(
            "INSERT INTO project_revisions(id,project_id,revision_no,terms) VALUES($1,$2,$3,$4)",
            [revision, p.id, p.version + 1, JSON.stringify(p.terms)],
          );
          await linkOwned(
            c.q,
            c.user.id,
            p.terms.mediaIds || [],
            "PROJECT_REVISION",
            revision,
          );
        } else
          demand(
            action === "close"
              ? p.status === "OPEN"
              : ["DRAFT", "OPEN", "CLOSED"].includes(p.status),
          );
        const status =
          action === "publish"
            ? "OPEN"
            : action === "close"
              ? "CLOSED"
              : "CANCELLED";
        await c.q.query(
          "UPDATE projects SET status=$2,current_revision_id=$3,version=version+1 WHERE id=$1",
          [p.id, status, revision],
        );
        const recipients = (
          await c.q.query(
            `SELECT applicant_id FROM proposals WHERE project_id=$1 AND status IN ('SUBMITTED','IN_DISCUSSION')`,
            [p.id],
          )
        ).rows.map((x) => x.applicant_id);
        if (action === "cancel")
          await c.q.query(
            `UPDATE proposals SET status='REJECTED',rejection_reason='PROJECT_CANCELLED',version=version+1 WHERE project_id=$1 AND status IN ('SUBMITTED','IN_DISCUSSION')`,
            [p.id],
          );
        await emit(
          c.q,
          `project.${action === "cancel" ? "cancelled" : "updated"}`,
          p.id,
          p.version + 1,
          recipients,
          { projectId: p.id },
        );
        return {
          id: p.id,
          status,
          version: p.version + 1,
          currentRevisionId: revision,
        };
      },
    );
  const proposalInput = z
    .object({
      content: text(),
      amount: money,
      days,
      portfolioVersionIds: z.array(uuid).max(3).default([]),
      explicitShareIds: z.array(uuid).max(3).default([]),
      mediaIds: ids,
    })
    .strict();
  const revision = async (
    c: Context,
    p: any,
    proposalId: string,
    seq: number,
  ) => {
    const rid = id();
    await c.q.query(
      "INSERT INTO proposal_revisions(id,proposal_id,revision_no,project_revision_id,amount,days,content) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        rid,
        proposalId,
        seq,
        p.current_revision_id,
        c.body.amount,
        c.body.days,
        c.body.content,
      ],
    );
    for (const vid of c.body.portfolioVersionIds) {
      const v = await one(
        c.q,
        "SELECT v.*,p.owner_id,p.visibility,p.published_version_id FROM portfolio_versions v JOIN portfolios p ON p.id=v.portfolio_id WHERE v.id=$1",
        [vid],
      );
      demand(v?.owner_id === c.user.id, "PORTFOLIO_NOT_OWNED", 422);
      const shared = c.body.explicitShareIds.includes(vid);
      demand(
        (v.visibility === "PUBLIC" && v.published_version_id === vid) || shared,
        "EXPLICIT_SHARE_REQUIRED",
        422,
      );
      await c.q.query(
        "INSERT INTO proposal_portfolio_snapshots VALUES($1,$2,$3,$4)",
        [rid, vid, shared, JSON.stringify(v.body)],
      );
    }
    await linkOwned(c.q, c.user.id, c.body.mediaIds, "PROPOSAL_REVISION", rid);
    return rid;
  };
  h.add(
    "post",
    "/projects/:id/proposals",
    "verified",
    proposalInput,
    async (c) => {
      const p = await project(c.q, c.params.id, c.user.id, true);
      visibleProject(p, c.user.id);
      demand(
        p.visibility === "PUBLIC" &&
          p.status === "OPEN" &&
          new Date(p.closes_at).getTime() > Date.now(),
        "RECRUITMENT_CLOSED",
      );
      demand(p.owner_id !== c.user.id, "SELF_APPLICATION", 422);
      const pid = id();
      await c.q.query(
        "INSERT INTO proposals(id,project_id,applicant_id) VALUES($1,$2,$3)",
        [pid, p.id, c.user.id],
      );
      const rid = await revision(c, p, pid, 1);
      await c.q.query(
        "UPDATE proposals SET current_revision_id=$2 WHERE id=$1",
        [pid, rid],
      );
      await emit(c.q, "proposal.submitted", pid, 1, [p.owner_id], {
        projectId: p.id,
        proposalId: pid,
      });
      return { id: pid, revisionId: rid, status: "SUBMITTED", version: 1 };
    },
  );
  h.add("get", "/projects/:id/proposals", "member", undefined, async (c) => {
    const p = await project(c.q, c.params.id);
    owner(p, c.user.id);
    const result = paginated(
      (
        await c.q.query(
          "SELECT p.*,r.amount,r.days,r.content FROM proposals p JOIN proposal_revisions r ON r.id=p.current_revision_id WHERE p.project_id=$1 ORDER BY p.created_at DESC,p.id",
          [p.id],
        )
      ).rows,
      c.query,
    );
    return {
      ...result,
      data: await Promise.all(
        result.data.map(async (a: any) => ({
          ...a,
          applicant: await summary(c.q, a.applicant_id),
        })),
      ),
    };
  });
  const ownProposal = async (c: Context, lock = false) => {
    const raw = await one(c.q, "SELECT * FROM proposals WHERE id=$1", [
      c.params.id,
    ]);
    demand(raw, "NOT_FOUND", 404);
    const p = await project(c.q, raw.project_id, c.user.id, lock);
    const proposal = lock
      ? await one(c.q, "SELECT * FROM proposals WHERE id=$1 FOR UPDATE", [
          raw.id,
        ])
      : raw;
    demand(
      [proposal.applicant_id, p.owner_id].includes(c.user.id),
      "NOT_FOUND",
      404,
    );
    return { p, proposal };
  };
  h.add("get", "/proposals/:id", "member", undefined, async (c) => {
    const { proposal } = await ownProposal(c);
    return {
      ...proposal,
      applicant: await summary(c.q, proposal.applicant_id),
      attachments: (
        await c.q.query(
          "SELECT m.id AS media_id,m.filename AS name FROM media_links l JOIN media_objects m ON m.id=l.media_id WHERE l.target_type='PROPOSAL_REVISION' AND l.target_id=$1 AND m.state='READY'",
          [proposal.current_revision_id],
        )
      ).rows,
      revisions: (
        await c.q.query(
          "SELECT * FROM proposal_revisions WHERE proposal_id=$1 ORDER BY revision_no",
          [proposal.id],
        )
      ).rows,
      portfolios: (
        await c.q.query(
          "SELECT * FROM proposal_portfolio_snapshots WHERE proposal_revision_id=$1",
          [proposal.current_revision_id],
        )
      ).rows,
    };
  });
  h.add(
    "patch",
    "/proposals/:id",
    "member",
    proposalInput.extend({ expectedVersion: z.number().int().positive() }),
    async (c) => {
      const { p, proposal } = await ownProposal(c, true);
      demand(proposal.applicant_id === c.user.id, "NOT_FOUND", 404);
      expected(proposal, c.body);
      demand(
        ["SUBMITTED", "IN_DISCUSSION"].includes(proposal.status) &&
          ["OPEN", "CLOSED"].includes(p.status),
      );
      const rid = await revision(c, p, proposal.id, proposal.version + 1);
      await c.q.query(
        "UPDATE proposals SET current_revision_id=$2,version=version+1 WHERE id=$1",
        [proposal.id, rid],
      );
      await emit(
        c.q,
        "proposal.updated",
        proposal.id,
        proposal.version + 1,
        [p.owner_id],
        { projectId: p.id, proposalId: proposal.id },
      );
      return {
        id: proposal.id,
        revisionId: rid,
        version: proposal.version + 1,
      };
    },
  );
  for (const action of ["withdraw", "reject"])
    h.add(
      "post",
      `/proposals/:id/${action}`,
      "member",
      versionInput.strict(),
      async (c) => {
        const { p, proposal } = await ownProposal(c, true);
        expected(proposal, c.body);
        demand(
          (action === "withdraw" ? proposal.applicant_id : p.owner_id) ===
            c.user.id,
          "FORBIDDEN",
          403,
        );
        demand(
          ["SUBMITTED", "IN_DISCUSSION"].includes(proposal.status) &&
            ["OPEN", "CLOSED"].includes(p.status),
        );
        const status = action === "withdraw" ? "WITHDRAWN" : "REJECTED";
        await c.q.query(
          "UPDATE proposals SET status=$2,version=version+1 WHERE id=$1",
          [proposal.id, status],
        );
        await emit(
          c.q,
          "proposal.resolved",
          proposal.id,
          proposal.version + 1,
          [p.owner_id, proposal.applicant_id],
          { projectId: p.id, proposalId: proposal.id },
        );
        return { status, version: proposal.version + 1 };
      },
    );
  h.add(
    "post",
    "/projects/:id/selection",
    "verified",
    versionInput
      .extend({
        proposalId: uuid,
        proposalRevisionId: uuid,
        acknowledgedProjectRevisionId: uuid,
      })
      .strict(),
    async (c) => {
      const p = await project(c.q, c.params.id, c.user.id, true);
      owner(p, c.user.id);
      expected(p, c.body);
      demand(["OPEN", "CLOSED"].includes(p.status), "PROJECT_ALREADY_MATCHED");
      demand(
        c.body.acknowledgedProjectRevisionId === p.current_revision_id,
        "PROJECT_REVISION_CHANGED",
      );
      const a = await one(
        c.q,
        "SELECT * FROM proposals WHERE id=$1 AND project_id=$2 FOR UPDATE",
        [c.body.proposalId, p.id],
      );
      demand(
        a &&
          ["SUBMITTED", "IN_DISCUSSION"].includes(a.status) &&
          a.current_revision_id === c.body.proposalRevisionId,
        "PROPOSAL_REVISION_CHANGED",
      );
      await h.verified(c.q, a.applicant_id);
      const r = await one(c.q, "SELECT * FROM proposal_revisions WHERE id=$1", [
        a.current_revision_id,
      ]);
      const original = await one(
        c.q,
        "SELECT terms FROM project_revisions WHERE id=$1",
        [r.project_revision_id],
      );
      const result = await createMatch(
        c.q,
        p,
        a.applicant_id,
        {
          ...original.terms,
          budgetType: "FIXED",
          budgetMin: Number(r.amount),
          budgetMax: Number(r.amount),
          days: r.days,
        },
        { proposalRevisionId: r.id },
      );
      await c.q.query(
        `UPDATE proposals SET status='SELECTED',version=version+1 WHERE id=$1`,
        [a.id],
      );
      const others = (
        await c.q.query(
          `UPDATE proposals SET status='REJECTED',rejection_reason='MATCHED_ELSEWHERE',version=version+1 WHERE project_id=$1 AND id<>$2 AND status IN ('SUBMITTED','IN_DISCUSSION') RETURNING applicant_id`,
          [p.id, a.id],
        )
      ).rows;
      await emit(
        c.q,
        "proposal.resolved",
        a.id,
        a.version + 1,
        others.map((x) => x.applicant_id),
        { projectId: p.id },
      );
      return result;
    },
  );
  h.add(
    "post",
    "/direct-requests",
    "verified",
    z
      .object({
        recipientId: uuid,
        terms: z.record(z.unknown()),
        expiresAt: z.string().datetime({ offset: true }),
        mediaIds: ids,
      })
      .strict(),
    async (c) => {
      demand(c.body.recipientId !== c.user.id, "SELF_REQUEST", 422);
      await h.verified(c.q, c.body.recipientId);
      demand(
        await one(
          c.q,
          `SELECT id FROM profiles WHERE user_id=$1 AND visibility='PUBLIC'`,
          [c.body.recipientId],
        ),
        "RECIPIENT_UNAVAILABLE",
        404,
      );
      const terms = await validateTerms(c.q, c.body.terms);
      demand(Date.parse(c.body.expiresAt) > Date.now(), "INVALID_EXPIRY", 422);
      const rid = id(),
        tid = id();
      await c.q.query(
        "INSERT INTO direct_requests(id,sender_id,recipient_id,expires_at) VALUES($1,$2,$3,$4)",
        [rid, c.user.id, c.body.recipientId, c.body.expiresAt],
      );
      await c.q.query(
        `INSERT INTO direct_request_terms(id,direct_request_id,revision_no,kind,author_id,terms) VALUES($1,$2,1,'ORIGINAL',$3,$4)`,
        [tid, rid, c.user.id, JSON.stringify(terms)],
      );
      await c.q.query(
        "UPDATE direct_requests SET latest_terms_id=$2 WHERE id=$1",
        [rid, tid],
      );
      await linkOwned(c.q, c.user.id, c.body.mediaIds, "DIRECT_TERMS", tid);
      await emit(c.q, "direct_request.received", rid, 1, [c.body.recipientId], {
        requestId: rid,
      });
      return { id: rid, latestTermsId: tid, status: "PENDING", version: 1 };
    },
  );
  const direct = async (c: Context, lock = false) => {
    const r = await one(
      c.q,
      `SELECT * FROM direct_requests WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [c.params.id],
    );
    demand(
      r && [r.sender_id, r.recipient_id].includes(c.user.id),
      "NOT_FOUND",
      404,
    );
    return r;
  };
  for (const suffix of ["", "/quotes"])
    h.add(
      "get",
      `/direct-requests/:id${suffix}`,
      "member",
      undefined,
      async (c) => {
        const r = await direct(c);
        const terms = (
          await c.q.query(
            "SELECT * FROM direct_request_terms WHERE direct_request_id=$1 ORDER BY revision_no",
            [r.id],
          )
        ).rows;
        return suffix
          ? { data: terms, meta: { total: terms.length } }
          : { ...r, terms };
      },
    );
  h.add(
    "post",
    "/direct-requests/:id/quotes",
    "verified",
    versionInput
      .extend({ terms: z.record(z.unknown()), mediaIds: ids })
      .strict(),
    async (c) => {
      const r = await direct(c, true);
      expected(r, c.body);
      demand(r.recipient_id === c.user.id, "FORBIDDEN", 403);
      demand(
        r.status === "PENDING" && new Date(r.expires_at).getTime() > Date.now(),
        "REQUEST_CLOSED",
      );
      const terms = await validateTerms(c.q, c.body.terms),
        tid = id();
      await c.q.query(
        `INSERT INTO direct_request_terms(id,direct_request_id,revision_no,kind,author_id,terms) VALUES($1,$2,$3,'QUOTE',$4,$5)`,
        [tid, r.id, r.version + 1, c.user.id, JSON.stringify(terms)],
      );
      await c.q.query(
        "UPDATE direct_requests SET latest_terms_id=$2,version=version+1 WHERE id=$1",
        [r.id, tid],
      );
      await linkOwned(c.q, c.user.id, c.body.mediaIds, "DIRECT_TERMS", tid);
      await emit(
        c.q,
        "direct_request.quoted",
        r.id,
        r.version + 1,
        [r.sender_id],
        { requestId: r.id },
      );
      return { termsId: tid, version: r.version + 1 };
    },
  );
  for (const action of ["accept", "reject", "cancel"])
    h.add(
      "post",
      `/direct-requests/:id/${action}`,
      "member",
      versionInput
        .extend(action === "accept" ? { termsId: uuid } : {})
        .strict(),
      async (c) => {
        const r = await direct(c, true);
        expected(r, c.body);
        demand(
          r.status === "PENDING" &&
            new Date(r.expires_at).getTime() > Date.now(),
          "REQUEST_CLOSED",
        );
        let result: any = {};
        if (action === "accept") {
          const t = await one(
            c.q,
            "SELECT * FROM direct_request_terms WHERE id=$1",
            [r.latest_terms_id],
          );
          demand(t.id === c.body.termsId, "TERMS_CHANGED");
          demand(
            c.user.id ===
              (t.kind === "ORIGINAL" ? r.recipient_id : r.sender_id),
            "FORBIDDEN",
            403,
          );
          await h.verified(c.q, r.sender_id);
          await h.verified(c.q, r.recipient_id);
          const pid = id(),
            revisionId = id();
          await c.q.query(
            `INSERT INTO projects(id,owner_id,terms,visibility,status) VALUES($1,$2,$3,'DIRECT_ONLY','MATCHED')`,
            [pid, r.sender_id, JSON.stringify(t.terms)],
          );
          await c.q.query(
            "INSERT INTO project_revisions(id,project_id,revision_no,terms) VALUES($1,$2,1,$3)",
            [revisionId, pid, JSON.stringify(t.terms)],
          );
          await c.q.query(
            "UPDATE projects SET current_revision_id=$2 WHERE id=$1",
            [pid, revisionId],
          );
          result = await createMatch(
            c.q,
            { id: pid, owner_id: r.sender_id, version: 1 },
            r.recipient_id,
            t.terms,
            { requestId: r.id, termsId: t.id },
          );
        } else
          demand(
            c.user.id === (action === "reject" ? r.recipient_id : r.sender_id),
            "FORBIDDEN",
            403,
          );
        const status =
          action === "accept"
            ? "ACCEPTED"
            : action === "reject"
              ? "REJECTED"
              : "CANCELLED";
        await c.q.query(
          "UPDATE direct_requests SET status=$2,accepted_terms_id=$3,version=version+1 WHERE id=$1",
          [r.id, status, action === "accept" ? r.latest_terms_id : null],
        );
        await emit(
          c.q,
          "direct_request.resolved",
          r.id,
          r.version + 1,
          [r.sender_id, r.recipient_id],
          { requestId: r.id },
        );
        return { ...result, status, version: r.version + 1 };
      },
    );
}
