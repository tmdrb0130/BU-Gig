import { z } from "zod";
import { Http } from "../http";
import { one } from "../db";
import {
  id,
  text,
  uuid,
  demand,
  expected,
  versionInput,
  paginated,
} from "../shared";
import { audit, emit, project, member } from "../policy";
import { cancelTrade } from "./trade";
export function operations(h: Http) {
  h.add(
    "get",
    "/me/notification-preferences",
    "member",
    undefined,
    async (c) =>
      (await one(
        c.q,
        "SELECT messages,matching FROM notification_preferences WHERE user_id=$1",
        [c.user.id],
      )) || { messages: true, matching: true },
  );
  h.add(
    "put",
    "/me/notification-preferences",
    "member",
    z.object({ messages: z.boolean(), matching: z.boolean() }).strict(),
    async (c) => {
      await c.q.query(
        "INSERT INTO notification_preferences(user_id,messages,matching) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET messages=$2,matching=$3",
        [c.user.id, c.body.messages, c.body.matching],
      );
      return c.body;
    },
  );
  h.add("get", "/me/school-verifications", "member", undefined, async (c) => ({
    data: (
      await c.q.query(
        "SELECT id,method,affiliation_type,state,expires_at,reason,version FROM school_verifications WHERE user_id=$1 ORDER BY created_at DESC",
        [c.user.id],
      )
    ).rows,
    meta: {},
  }));
  h.add(
    "post",
    "/me/school-verifications",
    "member",
    z
      .object({
        method: z.literal("EVIDENCE"),
        affiliationType: z.enum(["STUDENT", "FACULTY", "STAFF"]),
        evidenceMediaId: uuid,
      })
      .strict(),
    async (c) => {
      const media = await one(
        c.q,
        `SELECT m.id FROM media_objects m JOIN uploads u ON u.media_id=m.id WHERE m.id=$1 AND m.owner_id=$2 AND m.state='READY' AND u.purpose='VERIFICATION'`,
        [c.body.evidenceMediaId, c.user.id],
      );
      demand(media, "INVALID_EVIDENCE", 422);
      const rid = id();
      await c.q.query(
        "INSERT INTO school_verifications(id,user_id,method,affiliation_type,evidence_media_id) VALUES($1,$2,$3,$4,$5)",
        [
          rid,
          c.user.id,
          c.body.method,
          c.body.affiliationType,
          c.body.evidenceMediaId,
        ],
      );
      return { id: rid, state: "PENDING", version: 1 };
    },
  );
  h.add(
    "get",
    "/admin/verifications",
    "staff:verification",
    undefined,
    async (c) =>
      paginated(
        (
          await c.q.query(
            "SELECT id,user_id,state,affiliation_type,version FROM school_verifications ORDER BY created_at DESC",
          )
        ).rows,
        c.query,
      ),
  );
  h.add(
    "get",
    "/admin/verifications/:id",
    "staff:verification",
    undefined,
    async (c) => {
      const r = await one(
        c.q,
        "SELECT * FROM school_verifications WHERE id=$1",
        [c.params.id],
      );
      demand(r, "NOT_FOUND", 404);
      await audit(
        c.q,
        c.user.id,
        "verification.read",
        r.id,
        "Assigned verification scope",
      );
      return r;
    },
  );
  h.add(
    "patch",
    "/admin/verifications/:id",
    "staff:verification",
    versionInput
      .extend({
        state: z.enum(["VERIFIED", "REJECTED", "REVOKED"]),
        expiresAt: z.string().datetime({ offset: true }).optional(),
        reason: text(2000),
      })
      .strict(),
    async (c) => {
      const raw = await one(
        c.q,
        "SELECT * FROM school_verifications WHERE id=$1",
        [c.params.id],
      );
      demand(raw, "NOT_FOUND", 404);
      await c.q.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        raw.user_id,
      ]);
      const r = await one(
        c.q,
        "SELECT * FROM school_verifications WHERE id=$1 FOR UPDATE",
        [raw.id],
      );
      expected(r, c.body);
      demand(
        c.body.state === "REVOKED"
          ? r.state === "VERIFIED"
          : r.state === "PENDING",
      );
      if (c.body.state === "VERIFIED") {
        demand(
          c.body.expiresAt && Date.parse(c.body.expiresAt) > Date.now(),
          "INVALID_EXPIRY",
          422,
        );
        await c.q.query(
          `UPDATE school_verifications SET state='EXPIRED',version=version+1 WHERE user_id=$1 AND state='VERIFIED'`,
          [r.user_id],
        );
      }
      await c.q.query(
        "UPDATE school_verifications SET state=$2,expires_at=$3,reason=$4,version=version+1 WHERE id=$1",
        [r.id, c.body.state, c.body.expiresAt || null, c.body.reason],
      );
      await audit(c.q, c.user.id, "verification.decide", r.id, c.body.reason);
      await emit(
        c.q,
        "verification.changed",
        r.user_id,
        r.version + 1,
        [r.user_id],
        { userId: r.user_id },
      );
      return { id: r.id, state: c.body.state, version: r.version + 1 };
    },
  );
  h.add("get", "/me/notifications", "member", undefined, async (c) => {
    const after = c.query.cursor ? uuid.parse(c.query.cursor) : null;
    if (after)
      demand(
        await one(
          c.q,
          "SELECT id FROM notifications WHERE id=$1 AND recipient_id=$2",
          [after, c.user.id],
        ),
        "INVALID_CURSOR",
        400,
      );
    const rows = (
      await c.q.query(
        "SELECT * FROM notifications WHERE recipient_id=$1 AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM notifications WHERE id=$2 AND recipient_id=$1)) ORDER BY created_at DESC,id DESC LIMIT 51",
        [c.user.id, after],
      )
    ).rows;
    const unread = Number(
      (
        await one(
          c.q,
          "SELECT count(*) n FROM notifications WHERE recipient_id=$1 AND read_at IS NULL",
          [c.user.id],
        )
      ).n,
    );
    return {
      data: rows.slice(0, 50),
      meta: {
        nextCursor: rows.length > 50 ? rows[49].id : null,
        hasMore: rows.length > 50,
        unreadCount: unread,
      },
    };
  });
  h.add(
    "put",
    "/me/notifications/:id/read",
    "member",
    z.object({}).strict(),
    async (c) => {
      const n = await one(
        c.q,
        "UPDATE notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND recipient_id=$2 RETURNING id",
        [c.params.id, c.user.id],
      );
      demand(n, "NOT_FOUND", 404);
      return { read: true };
    },
  );
  h.add(
    "post",
    "/me/tickets",
    "member",
    z.object({ subject: text(100), body: text() }).strict(),
    async (c) => {
      const tid = id();
      await c.q.query(
        "INSERT INTO support_tickets(id,requester_id,subject) VALUES($1,$2,$3)",
        [tid, c.user.id, c.body.subject],
      );
      await c.q.query(
        "INSERT INTO ticket_replies(id,ticket_id,author_id,body) VALUES($1,$2,$3,$4)",
        [id(), tid, c.user.id, c.body.body],
      );
      return { id: tid, status: "OPEN" };
    },
  );
  for (const admin of [false, true]) {
    const prefix = admin ? "/admin" : "/me",
      access = admin ? "staff:support" : "member";
    h.add("get", `${prefix}/tickets`, access, undefined, async (c) =>
      paginated(
        (
          await c.q.query(
            `SELECT * FROM support_tickets ${admin ? "" : "WHERE requester_id=$1"} ORDER BY created_at DESC`,
            admin ? [] : [c.user.id],
          )
        ).rows,
        c.query,
      ),
    );
    const ticket = async (c: any) => {
      const t = await one(c.q, "SELECT * FROM support_tickets WHERE id=$1", [
        c.params.id,
      ]);
      demand(t && (admin || t.requester_id === c.user.id), "NOT_FOUND", 404);
      if (admin)
        await audit(c.q, c.user.id, "ticket.read", t.id, "Support scope");
      return t;
    };
    h.add(
      "get",
      `${prefix}/tickets/:id${admin ? "/replies" : ""}`,
      access,
      undefined,
      async (c) => {
        const t = await ticket(c);
        return {
          ...t,
          replies: (
            await c.q.query(
              "SELECT * FROM ticket_replies WHERE ticket_id=$1 ORDER BY created_at,id",
              [t.id],
            )
          ).rows,
        };
      },
    );
    h.add(
      "post",
      `${prefix}/tickets/:id/replies`,
      access,
      z.object({ body: text() }).strict(),
      async (c) => {
        const t = await ticket(c),
          rid = id();
        await c.q.query(
          "INSERT INTO ticket_replies(id,ticket_id,author_id,body) VALUES($1,$2,$3,$4)",
          [rid, t.id, c.user.id, c.body.body],
        );
        if (admin)
          await emit(c.q, "ticket.replied", t.id, 1, [t.requester_id], {
            ticketId: t.id,
          });
        return { id: rid };
      },
    );
  }
  h.add(
    "post",
    "/me/reports",
    "member",
    z.object({ projectId: uuid, reason: text(2000) }).strict(),
    async (c) => {
      const p = await project(c.q, c.body.projectId);
      member(p, c.user.id);
      const rid = id();
      await c.q.query(
        `INSERT INTO reports(id,reporter_id,project_id,target_type,target_id,reason) VALUES($1,$2,$3,'PROJECT',$3,$4)`,
        [rid, c.user.id, p.id, c.body.reason],
      );
      return { id: rid, status: "OPEN", version: 1 };
    },
  );
  for (const admin of [false, true]) {
    const prefix = admin ? "/admin" : "/me",
      access = admin ? "staff:dispute" : "member";
    h.add("get", `${prefix}/reports`, access, undefined, async (c) =>
      paginated(
        (
          await c.q.query(
            `SELECT * FROM reports ${admin ? "" : "WHERE reporter_id=$1"} ORDER BY created_at DESC`,
            admin ? [] : [c.user.id],
          )
        ).rows,
        c.query,
      ),
    );
    h.add("get", `${prefix}/reports/:id`, access, undefined, async (c) => {
      const r = await one(c.q, "SELECT * FROM reports WHERE id=$1", [
        c.params.id,
      ]);
      demand(r && (admin || r.reporter_id === c.user.id), "NOT_FOUND", 404);
      if (admin)
        await audit(c.q, c.user.id, "report.read", r.id, "Dispute scope");
      return r;
    });
  }
  h.add(
    "patch",
    "/admin/reports/:id",
    "staff:dispute",
    versionInput
      .extend({
        status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED"]),
        disputeActive: z.boolean(),
        reason: text(2000),
      })
      .strict(),
    async (c) => {
      const raw = await one(c.q, "SELECT * FROM reports WHERE id=$1", [
        c.params.id,
      ]);
      demand(raw, "NOT_FOUND", 404);
      await project(c.q, raw.project_id, c.user.id, true);
      const r = await one(c.q, "SELECT * FROM reports WHERE id=$1 FOR UPDATE", [
        raw.id,
      ]);
      expected(r, c.body);
      await c.q.query(
        "UPDATE reports SET status=$2,dispute_active=$3,version=version+1 WHERE id=$1",
        [r.id, c.body.status, c.body.disputeActive],
      );
      await audit(c.q, c.user.id, "report.resolve", r.id, c.body.reason);
      return { version: r.version + 1, status: c.body.status };
    },
  );
  h.add(
    "post",
    "/admin/projects/:id/cancel",
    "staff:dispute",
    versionInput.extend({ reason: text(2000) }).strict(),
    async (c) => {
      const p = await project(c.q, c.params.id, c.user.id, true);
      expected(p, c.body);
      demand(
        ["MATCHED", "IN_PROGRESS", "COMPLETION_REQUESTED"].includes(p.status),
      );
      await cancelTrade(c.q, p.id);
      await c.q.query(
        `UPDATE cancellation_requests SET state='WITHDRAWN',decided_by=$2,version=version+1 WHERE project_id=$1 AND state='PENDING'`,
        [p.id, c.user.id],
      );
      await audit(c.q, c.user.id, "project.force_cancel", p.id, c.body.reason);
      await emit(
        c.q,
        "project.cancelled",
        p.id,
        p.version + 1,
        [p.owner_id, p.provider_id],
        { projectId: p.id },
      );
      return { status: "CANCELLED" };
    },
  );
  h.add("get", "/admin/audit-logs", "staff:audit", undefined, async (c) => {
    await audit(c.q, c.user.id, "audit.read", c.user.id, "Audit scope");
    return paginated(
      (await c.q.query("SELECT * FROM audit_logs ORDER BY created_at DESC"))
        .rows,
      c.query,
    );
  });
  h.add("get", "/admin/jobs", "staff:operations", undefined, async (c) =>
    paginated(
      (
        await c.q.query(
          "SELECT id,handler,state,attempts,next_run_at,last_error FROM jobs ORDER BY next_run_at",
        )
      ).rows,
      c.query,
    ),
  );
  h.add(
    "post",
    "/admin/jobs/:id/retry",
    "staff:operations",
    z.object({ reason: text(2000) }).strict(),
    async (c) => {
      const j = await one(
        c.q,
        `UPDATE jobs SET state='PENDING',attempts=0,next_run_at=now(),lease_until=NULL,lease_token=NULL WHERE id=$1 AND state='FAILED' RETURNING id`,
        [c.params.id],
      );
      demand(j, "JOB_NOT_FAILED");
      await audit(c.q, c.user.id, "job.retry", j.id, c.body.reason);
      return { id: j.id, state: "PENDING" };
    },
  );
}
