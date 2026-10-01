import { randomBytes, createHmac } from "node:crypto";
import { z } from "zod";
import { Http } from "../http";
import { Sql, one } from "../db";
import { Storage } from "../storage";
import { demand, id, hash, uuid, text } from "../shared";
import {
  audit,
  room,
  project,
  member,
  conversation,
  visibleProject,
} from "../policy";
import { linkOwned } from "./matching";
export async function canReadMedia(q: Sql, mediaId: string, user: any) {
  const m = await one(q, "SELECT * FROM media_objects WHERE id=$1", [mediaId]);
  demand(m?.state === "READY", "NOT_FOUND", 404);
  if (user?.id === m.owner_id) return m;
  if (
    user?.staff_scopes?.includes("verification") &&
    (await one(
      q,
      "SELECT id FROM school_verifications WHERE evidence_media_id=$1",
      [mediaId],
    ))
  ) {
    await audit(
      q,
      user.id,
      "verification.media_read",
      mediaId,
      "Verification scope",
    );
    return m;
  }
  if (
    m.mime.startsWith("image/") &&
    (await one(
      q,
      "SELECT p.id FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.avatar_media_id=$1 AND u.status='ACTIVE'",
      [mediaId],
    ))
  )
    return m;
  const links = (
    await q.query("SELECT * FROM media_links WHERE media_id=$1", [mediaId])
  ).rows;
  for (const link of links)
    try {
      if (link.target_type === "PROJECT_REVISION") {
        const revision = await one(
          q,
          "SELECT project_id FROM project_revisions WHERE id=$1",
          [link.target_id],
        );
        const p = await project(q, revision.project_id);
        visibleProject(p, user?.id);
        if (
          p.current_revision_id === link.target_id ||
          (user?.id && (user.id === p.owner_id || user.id === p.provider_id))
        )
          return m;
      }
      if (link.target_type === "WORKROOM") {
        await room(q, link.target_id, user?.id);
        return m;
      }
      if (link.target_type === "MESSAGE") {
        const msg = await one(
          q,
          "SELECT conversation_id FROM messages WHERE id=$1",
          [link.target_id],
        );
        await conversation(q, msg.conversation_id, user?.id);
        return m;
      }
      if (link.target_type === "COMPLETION") {
        const r = await one(
          q,
          "SELECT project_id FROM completion_requests WHERE id=$1",
          [link.target_id],
        );
        member(await project(q, r.project_id), user?.id);
        return m;
      }
      if (link.target_type === "CONTRACT") {
        const r = await one(
          q,
          "SELECT c.workroom_id FROM contract_versions v JOIN contracts c ON c.id=v.contract_id WHERE v.id=$1",
          [link.target_id],
        );
        await room(q, r.workroom_id, user?.id);
        return m;
      }
      if (link.target_type === "DIRECT_TERMS") {
        const r = await one(
          q,
          "SELECT r.sender_id,r.recipient_id FROM direct_request_terms t JOIN direct_requests r ON r.id=t.direct_request_id WHERE t.id=$1",
          [link.target_id],
        );
        if ([r.sender_id, r.recipient_id].includes(user?.id)) return m;
      }
      if (link.target_type === "PROPOSAL_REVISION") {
        const r = await one(
          q,
          "SELECT p.applicant_id,x.owner_id FROM proposal_revisions r JOIN proposals p ON p.id=r.proposal_id JOIN projects x ON x.id=p.project_id WHERE r.id=$1",
          [link.target_id],
        );
        if ([r.applicant_id, r.owner_id].includes(user?.id)) return m;
      }
      if (link.target_type === "PORTFOLIO_VERSION") {
        // Public access only serves re-encoded images. Originals are never made public by association.
        if (
          m.mime.startsWith("image/") &&
          (await one(
            q,
            `SELECT p.id FROM portfolios p JOIN users u ON u.id=p.owner_id WHERE p.published_version_id=$1 AND p.visibility='PUBLIC' AND u.status='ACTIVE'`,
            [link.target_id],
          ))
        )
          return m;
        if (
          user?.id &&
          (await one(
            q,
            `SELECT s.portfolio_version_id FROM proposal_portfolio_snapshots s JOIN proposal_revisions r ON r.id=s.proposal_revision_id JOIN proposals a ON a.id=r.proposal_id JOIN projects p ON p.id=a.project_id WHERE s.portfolio_version_id=$1 AND (a.applicant_id=$2 OR p.owner_id=$2)`,
            [link.target_id, user.id],
          ))
        )
          return m;
      }
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }
  demand(false, "NOT_FOUND", 404);
}
export function media(h: Http, storage: Storage) {
  h.add(
    "post",
    "/uploads",
    "member",
    z
      .object({
        filename: text(150).refine((v) => !/[\/\\\r\n]/.test(v)),
        size: z
          .number()
          .int()
          .positive()
          .max(20 * 1024 * 1024),
        mime: z.enum([
          "image/png",
          "image/jpeg",
          "image/webp",
          "application/pdf",
          "text/plain",
        ]),
        purpose: z.enum([
          "PROJECT",
          "PROPOSAL",
          "DIRECT_REQUEST",
          "WORKROOM",
          "PORTFOLIO",
          "VERIFICATION",
          "AVATAR",
        ]),
        targetId: uuid.optional(),
      })
      .strict(),
    async (c) => {
      await c.q.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        c.user.id,
      ]);
      if (c.body.purpose === "AVATAR")
        demand(c.body.mime.startsWith("image/"), "IMAGE_REQUIRED", 422);
      if (c.body.mime.startsWith("image/"))
        demand(c.body.size <= 10 * 1024 * 1024, "FILE_TOO_LARGE", 413);
      if (c.body.purpose === "WORKROOM") {
        demand(c.body.targetId, "TARGET_REQUIRED", 422);
        const r = await room(c.q, c.body.targetId, c.user.id, true);
        demand(!["COMPLETED", "CANCELLED"].includes(r.project.status));
      }
      if (c.body.purpose === "PROJECT") {
        demand(c.body.targetId, "TARGET_REQUIRED", 422);
        const p = await project(c.q, c.body.targetId);
        demand(p.owner_id === c.user.id, "NOT_FOUND", 404);
      }
      if (c.body.purpose === "PROPOSAL") {
        demand(c.body.targetId, "TARGET_REQUIRED", 422);
        const p = await project(c.q, c.body.targetId);
        visibleProject(p, c.user.id);
        demand(p.owner_id !== c.user.id && p.status === "OPEN");
      }
      const used = Number(
        (
          await one(
            c.q,
            `SELECT coalesce(sum(size),0) AS n FROM media_objects WHERE owner_id=$1 AND state NOT IN ('DELETED','REJECTED','EXPIRED')`,
            [c.user.id],
          )
        ).n,
      );
      demand(used + c.body.size <= 200 * 1024 * 1024, "STORAGE_QUOTA", 413);
      const uid = id(),
        mid = id(),
        token = randomBytes(32).toString("hex"),
        key = `quarantine/${mid}`;
      await c.q.query(
        "INSERT INTO media_objects(id,owner_id,filename,object_key,mime,size) VALUES($1,$2,$3,$4,$5,$6)",
        [mid, c.user.id, c.body.filename, key, c.body.mime, c.body.size],
      );
      await c.q.query(
        "INSERT INTO uploads(id,media_id,purpose,target_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          uid,
          mid,
          c.body.purpose,
          c.body.targetId || null,
          hash(token),
          new Date(Date.now() + 600000),
        ],
      );
      return {
        uploadId: uid,
        mediaId: mid,
        url:
          h.config.storage === "s3"
            ? await storage.uploadUrl(key, c.body.mime, c.body.size)
            : `${h.config.baseUrl}/api/v1/uploads/${uid}/content?token=${token}`,
        method: "PUT",
        expiresIn: 600,
      };
    },
  );
  h.add(
    "put",
    "/uploads/:id/content",
    "public",
    undefined,
    async (c) => {
      demand(h.config.storage === "local", "NOT_FOUND", 404);
      const u = await one(
        c.q,
        "SELECT u.*,m.state,m.object_key,m.size,m.mime FROM uploads u JOIN media_objects m ON m.id=u.media_id WHERE u.id=$1 FOR UPDATE",
        [c.params.id],
      );
      demand(
        u &&
          u.token_hash === hash(String(c.query.token || "")) &&
          new Date(u.expires_at).getTime() > Date.now() &&
          u.state === "UPLOADING",
        "INVALID_UPLOAD_TOKEN",
        403,
      );
      demand(
        Buffer.isBuffer(c.req.body) && c.req.body.length === Number(u.size),
        "SIZE_MISMATCH",
        422,
      );
      await storage.put(u.object_key, c.req.body, u.mime);
      return { uploaded: true };
    },
    false,
  );
  h.add(
    "post",
    "/uploads/:id/complete",
    "member",
    z.object({}).strict(),
    async (c) => {
      const u = await one(
        c.q,
        "SELECT u.*,m.* FROM uploads u JOIN media_objects m ON m.id=u.media_id WHERE u.id=$1 AND m.owner_id=$2 FOR UPDATE",
        [c.params.id, c.user.id],
      );
      demand(u, "NOT_FOUND", 404);
      demand(new Date(u.expires_at).getTime() > Date.now(), "UPLOAD_EXPIRED");
      demand(u.state === "UPLOADING");
      demand(
        (await storage.size(u.object_key)) === Number(u.size),
        "SIZE_MISMATCH",
        422,
      );
      const buffer = await storage.get(u.object_key);
      const checksum = hash(buffer);
      await c.q.query(
        `UPDATE media_objects SET state='SCANNING',checksum=$2 WHERE id=$1`,
        [u.media_id, checksum],
      );
      await c.q.query(
        "INSERT INTO jobs(id,handler,dedup_key,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [
          id(),
          "scan",
          u.media_id,
          JSON.stringify({ mediaId: u.media_id, checksum }),
        ],
      );
      return { statusCode: 202, mediaId: u.media_id, state: "SCANNING" };
    },
  );
  h.add("get", "/uploads/:id", "member", undefined, async (c) => {
    const u = await one(
      c.q,
      "SELECT u.id,u.media_id,m.state,m.filename,m.mime,m.size FROM uploads u JOIN media_objects m ON m.id=u.media_id WHERE u.id=$1 AND m.owner_id=$2",
      [c.params.id, c.user.id],
    );
    demand(u, "NOT_FOUND", 404);
    return u;
  });
  h.add(
    "post",
    "/workrooms/:id/files",
    "member",
    z.object({ mediaId: uuid }).strict(),
    async (c) => {
      const r = await room(c.q, c.params.id, c.user.id, true);
      demand(!["COMPLETED", "CANCELLED"].includes(r.project.status));
      await linkOwned(c.q, c.user.id, [c.body.mediaId], "WORKROOM", r.id);
      return { mediaId: c.body.mediaId };
    },
  );
  h.add("get", "/workrooms/:id/files", "member", undefined, async (c) => {
    const r = await room(c.q, c.params.id, c.user.id);
    const rows = (
      await c.q.query(
        `SELECT DISTINCT m.id AS media_id,m.filename AS name,m.mime,m.size,m.owner_id AS uploaded_by,m.created_at,m.state FROM media_objects m JOIN media_links l ON l.media_id=m.id WHERE m.state='READY' AND ((l.target_type='WORKROOM' AND l.target_id=$1) OR (l.target_type='MESSAGE' AND l.target_id IN (SELECT id FROM messages WHERE conversation_id=$2)) OR (l.target_type='COMPLETION' AND l.target_id IN (SELECT id FROM completion_requests WHERE project_id=$3)) OR (l.target_type='CONTRACT' AND l.target_id IN (SELECT v.id FROM contract_versions v JOIN contracts c ON c.id=v.contract_id WHERE c.workroom_id=$1))) ORDER BY m.created_at DESC,m.id`,
        [r.id, r.conversation_id, r.project_id],
      )
    ).rows;
    const cursor = c.query.cursor ? uuid.parse(c.query.cursor) : null;
    const position = cursor
      ? rows.findIndex((row) => row.media_id === cursor)
      : -1;
    if (cursor) demand(position >= 0, "INVALID_CURSOR", 400);
    const items = rows.slice(position + 1, position + 51);
    const hasMore = rows.length > position + 51;
    return {
      data: items,
      meta: { nextCursor: hasMore ? items.at(-1).media_id : null, hasMore },
    };
  });
  const signed = (mid: string, expiry: number) =>
    createHmac("sha256", h.config.secret)
      .update(`${mid}:${expiry}`)
      .digest("hex");
  const download = async (c: any, mid: string) => {
    const m = await canReadMedia(c.q, mid, c.user);
    const expires = Date.now() + 120000;
    return {
      url:
        h.config.storage === "s3"
          ? await storage.downloadUrl(m.ready_key, m.filename)
          : `${h.config.baseUrl}/api/v1/media/${mid}/content?expires=${expires}&signature=${signed(mid, expires)}`,
      expiresAt: new Date(expires),
    };
  };
  h.add("get", "/media/:id/preview", "public", undefined, async (c) => {
    const m = await canReadMedia(c.q, c.params.id, c.user);
    demand(m.mime.startsWith("image/"), "NOT_FOUND", 404);
    c.res.setHeader("Content-Type", m.mime);
    c.res.setHeader("Content-Disposition", "inline");
    c.res.send(await storage.get(m.ready_key));
    return null;
  });
  h.add("get", "/media/:id/download", "public", undefined, (c) =>
    download(c, c.params.id),
  );
  h.add("get", "/media/:id/content", "public", undefined, async (c) => {
    demand(h.config.storage === "local", "NOT_FOUND", 404);
    const expires = Number(c.query.expires);
    demand(
      Number.isFinite(expires) &&
        expires > Date.now() &&
        c.query.signature === signed(c.params.id, expires),
      "INVALID_DOWNLOAD_TOKEN",
      403,
    );
    const m = await canReadMedia(c.q, c.params.id, c.user);
    c.res.setHeader("Content-Type", m.mime);
    c.res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(m.filename)}`,
    );
    c.res.send(await storage.get(m.ready_key));
    return null;
  });
  h.add(
    "get",
    "/contract-versions/:id/document",
    "member",
    undefined,
    async (c) => {
      const v = await one(
        c.q,
        "SELECT v.*,c.workroom_id FROM contract_versions v JOIN contracts c ON c.id=v.contract_id WHERE v.id=$1",
        [c.params.id],
      );
      demand(v, "NOT_FOUND", 404);
      await room(c.q, v.workroom_id, c.user.id);
      return {
        status: v.document_status,
        ...(v.document_media_id ? await download(c, v.document_media_id) : {}),
      };
    },
  );
}
