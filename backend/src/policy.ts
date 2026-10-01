import { Sql, one } from "./db";
import { demand, id } from "./shared";
export async function project(
  q: Sql,
  projectId: string,
  actor?: string,
  lock = false,
) {
  const p = await one(
    q,
    `SELECT * FROM projects WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
    [projectId],
  );
  demand(p, "NOT_FOUND", 404);
  const match = await one(q, "SELECT * FROM matches WHERE project_id=$1", [
    p.id,
  ]);
  const account = await one(q, "SELECT status FROM users WHERE id=$1", [
    p.owner_id,
  ]);
  return {
    ...p,
    owner_active: account?.status === "ACTIVE",
    provider_id: match?.provider_id,
  };
}
export function member(p: any, actor: string) {
  demand(
    actor && (p.owner_id === actor || p.provider_id === actor),
    "NOT_FOUND",
    404,
  );
}
export function owner(p: any, actor: string) {
  demand(p.owner_id === actor, "NOT_FOUND", 404);
}
export function visibleProject(p: any, actor?: string) {
  demand(
    (p.owner_active !== false &&
      p.visibility === "PUBLIC" &&
      !["DRAFT", "CANCELLED"].includes(p.status)) ||
      (actor && (p.owner_id === actor || p.provider_id === actor)),
    "NOT_FOUND",
    404,
  );
}
export async function room(
  q: Sql,
  roomId: string,
  actor: string,
  lock = false,
) {
  const r = await one(q, "SELECT * FROM workrooms WHERE id=$1", [roomId]);
  demand(r, "NOT_FOUND", 404);
  const p = await project(q, r.project_id, actor, lock);
  member(p, actor);
  return { ...r, project: p };
}
export async function conversation(
  q: Sql,
  conversationId: string,
  actor: string,
) {
  const c = await one(
    q,
    "SELECT c.* FROM conversations c JOIN conversation_members m ON c.id=m.conversation_id WHERE c.id=$1 AND m.user_id=$2",
    [conversationId, actor],
  );
  demand(c, "NOT_FOUND", 404);
  return c;
}
export async function unrestricted(q: Sql, projectId: string) {
  demand(
    !(await one(
      q,
      `SELECT id FROM cancellation_requests WHERE project_id=$1 AND state='PENDING' UNION ALL SELECT id FROM reports WHERE project_id=$1 AND dispute_active=true`,
      [projectId],
    )),
    "TRADE_RESTRICTED",
  );
}
export async function emit(
  q: Sql,
  type: string,
  aggregateId: string,
  version: number,
  recipients: string[],
  data: any = {},
) {
  await q.query(
    "INSERT INTO outbox_events(id,type,aggregate_id,aggregate_version,recipients,data) VALUES($1,$2,$3,$4,$5,$6)",
    [
      id(),
      type,
      aggregateId,
      version,
      [...new Set(recipients)].sort(),
      JSON.stringify(data),
    ],
  );
}
export async function audit(
  q: Sql,
  actor: string,
  action: string,
  target: string,
  reason: string,
) {
  await q.query(
    "INSERT INTO audit_logs(id,actor_id,action,target_id,reason) VALUES($1,$2,$3,$4,$5)",
    [id(), actor, action, target, reason],
  );
}
