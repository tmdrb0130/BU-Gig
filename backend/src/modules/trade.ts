import { z } from "zod";
import { Http, Context } from "../http";
import { one } from "../db";
import {
  demand,
  id,
  expected,
  versionInput,
  uuid,
  text,
  money,
  days,
  ids,
  hash,
  canonical,
} from "../shared";
import {
  project,
  member,
  room,
  conversation,
  unrestricted,
  emit,
} from "../policy";
import { linkOwned, createConversation } from "./matching";
export function trade(h: Http) {
  h.add("get", "/projects/:id/my-review", "member", undefined, async (c) => {
    const p = await project(c.q, c.params.id);
    member(p, c.user.id);
    return (
      (await one(
        c.q,
        "SELECT * FROM reviews WHERE project_id=$1 AND author_id=$2",
        [p.id, c.user.id],
      )) || null
    );
  });
  h.add(
    "patch",
    "/me/reviews/:id",
    "member",
    z
      .object({
        visibility: z.enum(["PUBLIC", "PRIVATE"]),
        homeFeaturedOptIn: z.boolean(),
      })
      .strict(),
    async (c) => {
      const r = await one(
        c.q,
        "UPDATE reviews SET visibility=$3,home_featured_opt_in=$4 WHERE id=$1 AND author_id=$2 RETURNING id",
        [c.params.id, c.user.id, c.body.visibility, c.body.homeFeaturedOptIn],
      );
      demand(r, "NOT_FOUND", 404);
      return r;
    },
  );
  h.add("get", "/workrooms/:id", "member", undefined, async (c) => {
    const r = await room(c.q, c.params.id, c.user.id),
      contract = await one(
        c.q,
        "SELECT * FROM contracts WHERE workroom_id=$1",
        [r.id],
      );
    return {
      ...r,
      contractId: contract.id,
      signedVersion:
        (await one(c.q, "SELECT * FROM contract_versions WHERE id=$1", [
          contract.signed_version_id,
        ])) || null,
      reviewVersion:
        (await one(c.q, "SELECT * FROM contract_versions WHERE id=$1", [
          contract.review_version_id,
        ])) || null,
      activeCompletionRequest:
        (await one(
          c.q,
          `SELECT * FROM completion_requests WHERE project_id=$1 AND state='PENDING'`,
          [r.project_id],
        )) || null,
      activeCancellationRequest:
        (await one(
          c.q,
          `SELECT * FROM cancellation_requests WHERE project_id=$1 AND state='PENDING'`,
          [r.project_id],
        )) || null,
      participants: [r.project.owner_id, r.project.provider_id],
      version: r.project.version,
    };
  });
  h.add(
    "post",
    "/conversations",
    "verified",
    z
      .object({
        projectId: uuid.optional(),
        applicantId: uuid.optional(),
        directRequestId: uuid.optional(),
      })
      .strict(),
    async (c) => {
      let cid: string;
      if (c.body.directRequestId) {
        demand(!c.body.projectId, "INVALID_CONTEXT", 422);
        const r = await one(
          c.q,
          "SELECT * FROM direct_requests WHERE id=$1 FOR UPDATE",
          [c.body.directRequestId],
        );
        demand(
          r && [r.sender_id, r.recipient_id].includes(c.user.id),
          "NOT_FOUND",
          404,
        );
        demand(
          r.status === "PENDING" &&
            new Date(r.expires_at).getTime() > Date.now(),
        );
        cid = await createConversation(
          c.q,
          r.sender_id,
          r.recipient_id,
          undefined,
          r.id,
        );
      } else {
        demand(c.body.projectId, "CONTEXT_REQUIRED", 422);
        const p = await project(c.q, c.body.projectId, c.user.id, true);
        demand(
          p.visibility === "PUBLIC" &&
            p.status === "OPEN" &&
            new Date(p.closes_at).getTime() > Date.now(),
        );
        const applicant =
          p.owner_id === c.user.id ? c.body.applicantId : c.user.id;
        demand(applicant && applicant !== p.owner_id, "INVALID_APPLICANT", 422);
        await h.verified(c.q, applicant);
        if (p.owner_id === c.user.id)
          demand(
            await one(
              c.q,
              "SELECT id FROM proposals WHERE project_id=$1 AND applicant_id=$2",
              [p.id, applicant],
            ),
            "NOT_FOUND",
            404,
          );
        cid = await createConversation(c.q, p.owner_id, applicant, p.id);
        await c.q.query(
          `UPDATE proposals SET status='IN_DISCUSSION',version=version+1 WHERE project_id=$1 AND applicant_id=$2 AND status='SUBMITTED'`,
          [p.id, applicant],
        );
      }
      return { id: cid };
    },
  );
  h.add("get", "/conversations", "member", undefined, async (c) => ({
    data: (
      await c.q.query(
        "SELECT c.*,m.last_read_sequence,coalesce(p.terms->>'title',t.terms->>'title') AS title,w.id AS workroom_id FROM conversations c JOIN conversation_members m ON c.id=m.conversation_id LEFT JOIN projects p ON p.id=c.project_id LEFT JOIN direct_requests d ON d.id=c.direct_request_id LEFT JOIN direct_request_terms t ON t.id=d.latest_terms_id LEFT JOIN workrooms w ON w.conversation_id=c.id WHERE m.user_id=$1 ORDER BY c.id",
        [c.user.id],
      )
    ).rows,
    meta: {},
  }));
  h.add(
    "get",
    "/conversations/:id/messages",
    "member",
    undefined,
    async (c) => {
      await conversation(c.q, c.params.id, c.user.id);
      const after = z.coerce
        .number()
        .int()
        .min(0)
        .default(0)
        .parse(c.query.cursor);
      const rows = (
        await c.q.query(
          "SELECT m.*,ARRAY(SELECT media_id FROM media_links WHERE target_type='MESSAGE' AND target_id=m.id) AS media_ids FROM messages m WHERE conversation_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 51",
          [c.params.id, after],
        )
      ).rows;
      return {
        data: rows.slice(0, 50),
        meta: {
          nextCursor: rows.length
            ? rows[Math.min(rows.length, 50) - 1].sequence
            : after,
          hasMore: rows.length > 50,
        },
      };
    },
  );
  h.add(
    "post",
    "/conversations/:id/messages",
    "member",
    z
      .object({ text: text(3000), clientMessageId: uuid, mediaIds: ids })
      .strict(),
    async (c) => {
      const conv = await conversation(c.q, c.params.id, c.user.id);
      await c.q.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [
        conv.id,
      ]);
      const duplicate = await one(
        c.q,
        "SELECT * FROM messages WHERE conversation_id=$1 AND sender_id=$2 AND client_message_id=$3",
        [conv.id, c.user.id, c.body.clientMessageId],
      );
      if (duplicate) {
        demand(duplicate.text === c.body.text, "MESSAGE_ID_REUSED");
        return duplicate;
      }
      const seq = await one(
        c.q,
        "UPDATE conversations SET next_sequence=next_sequence+1 WHERE id=$1 RETURNING next_sequence",
        [conv.id],
      );
      const mid = id();
      await c.q.query(
        `INSERT INTO messages(id,conversation_id,sender_id,client_message_id,sequence,kind,text) VALUES($1,$2,$3,$4,$5,'USER',$6)`,
        [
          mid,
          conv.id,
          c.user.id,
          c.body.clientMessageId,
          seq.next_sequence,
          c.body.text,
        ],
      );
      await linkOwned(c.q, c.user.id, c.body.mediaIds, "MESSAGE", mid);
      const recipients = (
        await c.q.query(
          "SELECT user_id FROM conversation_members WHERE conversation_id=$1",
          [conv.id],
        )
      ).rows.map((x) => x.user_id);
      await emit(
        c.q,
        "message.created",
        conv.id,
        seq.next_sequence,
        recipients,
        { conversationId: conv.id, messageId: mid },
      );
      return { id: mid, sequence: seq.next_sequence, text: c.body.text };
    },
    false,
  );
  h.add(
    "put",
    "/conversations/:id/read",
    "member",
    z.object({ lastReadSequence: z.number().int().min(0) }).strict(),
    async (c) => {
      const conv = await conversation(c.q, c.params.id, c.user.id);
      demand(
        c.body.lastReadSequence <= conv.next_sequence,
        "INVALID_READ_SEQUENCE",
        422,
      );
      await c.q.query(
        "UPDATE conversation_members SET last_read_sequence=greatest(last_read_sequence,$3) WHERE conversation_id=$1 AND user_id=$2",
        [conv.id, c.user.id, c.body.lastReadSequence],
      );
      await emit(
        c.q,
        "message.read",
        conv.id,
        conv.next_sequence,
        (
          await c.q.query(
            "SELECT user_id FROM conversation_members WHERE conversation_id=$1",
            [conv.id],
          )
        ).rows.map((x) => x.user_id),
        { conversationId: conv.id },
      );
      return { read: true };
    },
  );
  const contractBody = z
    .object({
      scope: text(),
      deliverables: text(),
      amount: money,
      days,
      revisions: z.string().max(2000).default(""),
      otherAgreements: z.string().max(10000).default(""),
    })
    .strict();
  const getContract = async (c: Context, byVersion = false, lock = false) => {
    let contract;
    if (byVersion) {
      const v = await one(
        c.q,
        "SELECT contract_id FROM contract_versions WHERE id=$1",
        [c.params.id],
      );
      demand(v, "NOT_FOUND", 404);
      contract = await one(c.q, "SELECT * FROM contracts WHERE id=$1", [
        v.contract_id,
      ]);
    } else
      contract = await one(c.q, "SELECT * FROM contracts WHERE id=$1", [
        c.params.id,
      ]);
    demand(contract, "NOT_FOUND", 404);
    const r = await room(c.q, contract.workroom_id, c.user.id, lock);
    if (lock)
      contract = await one(
        c.q,
        "SELECT * FROM contracts WHERE id=$1 FOR UPDATE",
        [contract.id],
      );
    return { contract, r };
  };
  h.add("get", "/contracts/:id", "member", undefined, async (c) => {
    const { contract } = await getContract(c);
    return {
      ...contract,
      versions: (
        await c.q.query(
          "SELECT * FROM contract_versions WHERE contract_id=$1 ORDER BY sequence",
          [contract.id],
        )
      ).rows,
      acceptances: (
        await c.q.query(
          "SELECT a.* FROM contract_acceptances a JOIN contract_versions v ON v.id=a.contract_version_id WHERE v.contract_id=$1",
          [contract.id],
        )
      ).rows,
    };
  });
  h.add(
    "post",
    "/workrooms/:id/contracts/versions",
    "member",
    versionInput
      .extend({ body: contractBody, baseSignedVersionId: uuid.nullable() })
      .strict(),
    async (c) => {
      const r = await room(c.q, c.params.id, c.user.id, true);
      await unrestricted(c.q, r.project_id);
      demand(["MATCHED", "IN_PROGRESS"].includes(r.project.status));
      const contract = await one(
        c.q,
        "SELECT * FROM contracts WHERE workroom_id=$1 FOR UPDATE",
        [r.id],
      );
      expected(contract, c.body);
      demand(
        contract.signed_version_id === c.body.baseSignedVersionId,
        "BASE_CONTRACT_CHANGED",
      );
      if (contract.review_version_id)
        await c.q.query(
          `UPDATE contract_versions SET status='SUPERSEDED' WHERE id=$1 AND status IN ('DRAFT','WAITING_ACCEPTANCE')`,
          [contract.review_version_id],
        );
      const seq = Number(
          (
            await one(
              c.q,
              "SELECT coalesce(max(sequence),0)+1 AS n FROM contract_versions WHERE contract_id=$1",
              [contract.id],
            )
          ).n,
        ),
        vid = id();
      await c.q.query(
        "INSERT INTO contract_versions(id,contract_id,sequence,author_id,base_signed_version_id,body) VALUES($1,$2,$3,$4,$5,$6)",
        [
          vid,
          contract.id,
          seq,
          c.user.id,
          contract.signed_version_id,
          JSON.stringify({
            ...c.body.body,
            ownerId: r.project.owner_id,
            providerId: r.project.provider_id,
          }),
        ],
      );
      await c.q.query(
        "UPDATE contracts SET review_version_id=$2,version=version+1 WHERE id=$1",
        [contract.id, vid],
      );
      return {
        id: vid,
        contractId: contract.id,
        version: contract.version + 1,
        status: "DRAFT",
      };
    },
  );
  for (const action of ["publish", "withdraw", "acceptances"])
    h.add(
      "post",
      `/contract-versions/:id/${action}`,
      "member",
      versionInput
        .extend(action === "acceptances" ? { contentHash: text(64) } : {})
        .strict(),
      async (c) => {
        const { contract, r } = await getContract(c, true, true);
        expected(contract, c.body);
        await unrestricted(c.q, r.project_id);
        demand(["MATCHED", "IN_PROGRESS"].includes(r.project.status));
        demand(
          contract.review_version_id === c.params.id,
          "CONTRACT_VERSION_CHANGED",
        );
        const v = await one(
          c.q,
          "SELECT * FROM contract_versions WHERE id=$1",
          [c.params.id],
        );
        if (action !== "acceptances")
          demand(v.author_id === c.user.id, "FORBIDDEN", 403);
        let status = v.status;
        if (action === "publish") {
          demand(v.status === "DRAFT");
          contractBody.parse(
            Object.fromEntries(
              Object.entries(v.body).filter(
                ([k]) => !["ownerId", "providerId"].includes(k),
              ),
            ),
          );
          const contentHash = hash(canonical(v.body));
          await c.q.query(
            `UPDATE contract_versions SET status='WAITING_ACCEPTANCE',content_hash=$2 WHERE id=$1`,
            [v.id, contentHash],
          );
          status = "WAITING_ACCEPTANCE";
        } else if (action === "withdraw") {
          demand(["DRAFT", "WAITING_ACCEPTANCE"].includes(v.status));
          await c.q.query(
            `UPDATE contract_versions SET status='CANCELLED' WHERE id=$1`,
            [v.id],
          );
          await c.q.query(
            "UPDATE contracts SET review_version_id=NULL WHERE id=$1",
            [contract.id],
          );
          status = "CANCELLED";
        } else {
          demand(
            v.status === "WAITING_ACCEPTANCE" &&
              v.content_hash === c.body.contentHash,
            "CONTRACT_HASH_CHANGED",
          );
          await c.q.query(
            "INSERT INTO contract_acceptances(contract_version_id,user_id,content_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [v.id, c.user.id, v.content_hash],
          );
          const n = Number(
            (
              await one(
                c.q,
                "SELECT count(*) AS n FROM contract_acceptances WHERE contract_version_id=$1",
                [v.id],
              )
            ).n,
          );
          if (n === 2) {
            status = "SIGNED";
            await c.q.query(
              `UPDATE contract_versions SET status='SIGNED' WHERE id=$1`,
              [v.id],
            );
            await c.q.query(
              "UPDATE contracts SET signed_version_id=$2,review_version_id=NULL WHERE id=$1",
              [contract.id, v.id],
            );
            if (r.project.status === "MATCHED")
              await c.q.query(
                `UPDATE projects SET status='IN_PROGRESS',version=version+1 WHERE id=$1`,
                [r.project_id],
              );
          }
        }
        await c.q.query("UPDATE contracts SET version=version+1 WHERE id=$1", [
          contract.id,
        ]);
        await emit(
          c.q,
          `contract.${status === "SIGNED" ? "signed" : action === "acceptances" ? "accepted" : action === "withdraw" ? "withdrawn" : "published"}`,
          contract.id,
          contract.version + 1,
          [r.project.owner_id, r.project.provider_id],
          {
            projectId: r.project_id,
            workroomId: r.id,
            versionId: v.id,
            conversationId: r.conversation_id,
          },
        );
        return {
          id: v.id,
          status,
          version: contract.version + 1,
          contentHash: (
            await one(
              c.q,
              "SELECT content_hash FROM contract_versions WHERE id=$1",
              [v.id],
            )
          ).content_hash,
        };
      },
    );
  h.add(
    "post",
    "/workrooms/:id/completion-requests",
    "member",
    versionInput
      .extend({ signedVersionId: uuid, note: text(), mediaIds: ids })
      .strict(),
    async (c) => {
      const r = await room(c.q, c.params.id, c.user.id, true);
      expected(r.project, c.body);
      demand(c.user.id === r.project.provider_id, "FORBIDDEN", 403);
      demand(r.project.status === "IN_PROGRESS");
      await unrestricted(c.q, r.project_id);
      const contract = await one(
        c.q,
        "SELECT * FROM contracts WHERE workroom_id=$1 FOR UPDATE",
        [r.id],
      );
      demand(
        contract.signed_version_id === c.body.signedVersionId &&
          !contract.review_version_id,
        "CONTRACT_UNRESOLVED",
      );
      const rid = id();
      await c.q.query(
        "INSERT INTO completion_requests(id,project_id,requester_id,contract_version_id,note) VALUES($1,$2,$3,$4,$5)",
        [rid, r.project_id, c.user.id, c.body.signedVersionId, c.body.note],
      );
      await linkOwned(c.q, c.user.id, c.body.mediaIds, "COMPLETION", rid);
      await c.q.query(
        `UPDATE projects SET status='COMPLETION_REQUESTED',version=version+1 WHERE id=$1`,
        [r.project_id],
      );
      await emit(c.q, "completion.requested", rid, 1, [r.project.owner_id], {
        projectId: r.project_id,
        completionRequestId: rid,
      });
      return { id: rid, state: "PENDING", version: 1 };
    },
  );
  for (const type of ["completion", "cancellation"]) {
    h.add("get", `/${type}-requests/:id`, "member", undefined, async (c) => {
      const r = await one(c.q, `SELECT * FROM ${type}_requests WHERE id=$1`, [
        c.params.id,
      ]);
      demand(r, "NOT_FOUND", 404);
      member(await project(c.q, r.project_id), c.user.id);
      return r;
    });
    for (const action of type === "completion"
      ? ["approve", "request-changes", "cancel"]
      : ["approve", "reject", "withdraw"])
      h.add(
        "post",
        `/${type}-requests/:id/${action}`,
        "member",
        versionInput
          .extend({ reason: z.string().max(2000).optional() })
          .strict(),
        async (c) => {
          const raw = await one(
            c.q,
            `SELECT * FROM ${type}_requests WHERE id=$1`,
            [c.params.id],
          );
          demand(raw, "NOT_FOUND", 404);
          const p = await project(c.q, raw.project_id, c.user.id, true);
          member(p, c.user.id);
          const r = await one(
            c.q,
            `SELECT * FROM ${type}_requests WHERE id=$1 FOR UPDATE`,
            [raw.id],
          );
          expected(r, c.body);
          demand(r.state === "PENDING");
          let state: string;
          if (type === "completion") {
            await unrestricted(c.q, p.id);
            demand(p.status === "COMPLETION_REQUESTED");
            demand(
              c.user.id === (action === "cancel" ? p.provider_id : p.owner_id),
              "FORBIDDEN",
              403,
            );
            const contract = await one(
              c.q,
              "SELECT c.* FROM contracts c JOIN workrooms w ON w.id=c.workroom_id WHERE w.project_id=$1",
              [p.id],
            );
            demand(
              contract.signed_version_id === r.contract_version_id &&
                !contract.review_version_id,
              "CONTRACT_CHANGED",
            );
            if (action === "request-changes") text(2000).parse(c.body.reason);
            state =
              action === "approve"
                ? "APPROVED"
                : action === "cancel"
                  ? "CANCELLED"
                  : "CHANGES_REQUESTED";
            await c.q.query(
              "UPDATE projects SET status=$2,version=version+1 WHERE id=$1",
              [p.id, action === "approve" ? "COMPLETED" : "IN_PROGRESS"],
            );
          } else {
            demand(
              ["MATCHED", "IN_PROGRESS", "COMPLETION_REQUESTED"].includes(
                p.status,
              ),
            );
            demand(
              action === "withdraw"
                ? c.user.id === r.requester_id
                : c.user.id !== r.requester_id,
              "FORBIDDEN",
              403,
            );
            state =
              action === "approve"
                ? "APPROVED"
                : action === "reject"
                  ? "REJECTED"
                  : "WITHDRAWN";
            if (action === "approve") {
              await cancelTrade(c.q, p.id);
            }
          }
          await c.q.query(
            `UPDATE ${type}_requests SET state=$2,decided_by=$3,version=version+1${type === "completion" ? ",reason=$4" : ""} WHERE id=$1`,
            type === "completion"
              ? [r.id, state, c.user.id, c.body.reason || null]
              : [r.id, state, c.user.id],
          );
          await emit(
            c.q,
            `${type}.resolved`,
            r.id,
            r.version + 1,
            [p.owner_id, p.provider_id],
            { projectId: p.id, state },
          );
          if (type === "completion" && state === "APPROVED")
            await emit(
              c.q,
              "project.completed",
              p.id,
              p.version + 1,
              [p.owner_id, p.provider_id],
              { projectId: p.id },
            );
          return { id: r.id, state, version: r.version + 1 };
        },
      );
  }
  h.add(
    "post",
    "/projects/:id/cancellation-requests",
    "member",
    versionInput.extend({ reason: text(2000) }).strict(),
    async (c) => {
      const p = await project(c.q, c.params.id, c.user.id, true);
      member(p, c.user.id);
      expected(p, c.body);
      demand(
        ["MATCHED", "IN_PROGRESS", "COMPLETION_REQUESTED"].includes(p.status),
      );
      const rid = id();
      await c.q.query(
        "INSERT INTO cancellation_requests(id,project_id,requester_id,reason) VALUES($1,$2,$3,$4)",
        [rid, p.id, c.user.id, c.body.reason],
      );
      await emit(
        c.q,
        "cancellation.requested",
        rid,
        1,
        [p.owner_id, p.provider_id],
        { projectId: p.id, cancellationRequestId: rid },
      );
      return { id: rid, state: "PENDING", version: 1 };
    },
  );
  h.add(
    "post",
    "/projects/:id/reviews",
    "member",
    z
      .object({
        rating: z.number().int().min(1).max(5),
        body: text(2000),
        homeFeaturedOptIn: z.boolean().default(false),
      })
      .strict(),
    async (c) => {
      const p = await project(c.q, c.params.id, c.user.id, true);
      member(p, c.user.id);
      demand(p.status === "COMPLETED");
      const rid = id(),
        subject = p.owner_id === c.user.id ? p.provider_id : p.owner_id;
      await c.q.query(
        "INSERT INTO reviews(id,project_id,author_id,subject_id,subject_role,rating,body,home_featured_opt_in) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          rid,
          p.id,
          c.user.id,
          subject,
          p.owner_id === c.user.id ? "PROVIDER" : "REQUESTER",
          c.body.rating,
          c.body.body,
          c.body.homeFeaturedOptIn,
        ],
      );
      await emit(c.q, "review.created", rid, 1, [subject], {
        projectId: p.id,
        reviewId: rid,
      });
      return { id: rid };
    },
  );
}
export async function cancelTrade(q: any, projectId: string) {
  await q.query(
    `UPDATE projects SET status='CANCELLED',version=version+1 WHERE id=$1`,
    [projectId],
  );
  await q.query(
    `UPDATE contract_versions SET status='CANCELLED' WHERE contract_id IN (SELECT c.id FROM contracts c JOIN workrooms w ON w.id=c.workroom_id WHERE w.project_id=$1) AND status IN ('DRAFT','WAITING_ACCEPTANCE')`,
    [projectId],
  );
  await q.query(
    "UPDATE contracts SET review_version_id=NULL,version=version+1 WHERE workroom_id IN (SELECT id FROM workrooms WHERE project_id=$1)",
    [projectId],
  );
  await q.query(
    `UPDATE completion_requests SET state='CANCELLED',version=version+1 WHERE project_id=$1 AND state='PENDING'`,
    [projectId],
  );
}
