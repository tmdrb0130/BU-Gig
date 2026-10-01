import { Http } from "../http";
import { one } from "../db";
import { z } from "zod";
import { conversation, project, member } from "../policy";
export function events(h: Http) {
  const connections = new Map<string, number>();
  const responses = new Set<import("express").Response>();
  h.add(
    "get",
    "/events",
    "member",
    undefined,
    async (c) => {
      const uid = c.user.id;
      if ((connections.get(uid) || 0) >= 5) {
        c.res.status(429).end();
        return null;
      }
      let cursor = z.coerce
          .number()
          .int()
          .min(0)
          .parse(c.req.headers["last-event-id"] || c.query.after || 0),
        busy = false,
        closed = false;
      c.res.setHeader("Content-Type", "text/event-stream");
      c.res.setHeader("Cache-Control", "no-store");
      c.res.setHeader("X-Accel-Buffering", "no");
      c.res.flushHeaders();
      connections.set(uid, (connections.get(uid) || 0) + 1);
      responses.add(c.res);
      const send = (type: string, data: any, sequence?: number) =>
        c.res.write(
          `${sequence !== undefined ? `id: ${sequence}\n` : ""}event: ${type}\ndata: ${JSON.stringify(data)}\n\n`,
        );
      const poll = async () => {
        if (busy || closed) return;
        busy = true;
        try {
          const session = await h.session(c.req);
          if (!session || session.status !== "ACTIVE") {
            c.res.end();
            return;
          }
          const limits = await one(
            h.db,
            "SELECT min(sequence) AS low,max(sequence) AS high FROM user_events WHERE recipient_id=$1",
            [uid],
          );
          if (
            (limits.low && cursor < Number(limits.low) - 1) ||
            (limits.high && cursor > Number(limits.high))
          ) {
            cursor = Number(limits.high || 0);
            send("stream.reset", { after: cursor }, cursor);
          }
          const rows = (
            await h.db.query(
              "SELECT * FROM user_events WHERE recipient_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 100",
              [uid, cursor],
            )
          ).rows;
          for (const row of rows) {
            let permitted = true;
            try {
              if (row.data.conversationId)
                await conversation(h.db, row.data.conversationId, uid);
              else if (row.data.projectId) {
                const p = await project(h.db, row.data.projectId);
                if (
                  ![p.owner_id, p.provider_id].includes(uid) &&
                  !(await one(
                    h.db,
                    "SELECT id FROM proposals WHERE project_id=$1 AND applicant_id=$2",
                    [p.id, uid],
                  ))
                )
                  permitted = false;
              }
              if (row.data.requestId) {
                const r = await one(
                  h.db,
                  "SELECT sender_id,recipient_id FROM direct_requests WHERE id=$1",
                  [row.data.requestId],
                );
                if (!r || ![r.sender_id, r.recipient_id].includes(uid))
                  permitted = false;
              }
            } catch {
              permitted = false;
            }
            cursor = Number(row.sequence);
            if (permitted) send(row.type, row.data, cursor);
            else send("stream.cursor", {}, cursor);
          }
          if (!rows.length) c.res.write(": heartbeat\n\n");
        } catch {
          c.res.end();
        } finally {
          busy = false;
        }
      };
      const timer = setInterval(poll, 1000);
      timer.unref();
      c.res.on("close", () => {
        responses.delete(c.res);
        closed = true;
        clearInterval(timer);
        connections.set(uid, Math.max(0, (connections.get(uid) || 1) - 1));
      });
      await poll();
      return null;
    },
    false,
  );
  return () => {
    for (const response of responses) response.end();
  };
}
