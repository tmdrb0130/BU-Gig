import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import sharp from "sharp";
import { createApp } from "../src/app";
import { configuration } from "../src/config";
import { Database, one } from "../src/db";
import { emit } from "../src/policy";

let runtime: Awaited<ReturnType<typeof createApp>>,
  base: string,
  fieldId: string;
let owner: Client, provider: Client, outsider: Client;
class Client {
  cookie = "";
  csrf = "";
  userId = "";
  async request(
    method: string,
    path: string,
    body?: any,
    status = 200,
    key = randomUUID(),
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        cookie: this.cookie,
        origin: runtime.config.origin,
        "x-csrf-token": this.csrf,
        "idempotency-key": key,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.headers.get("set-cookie"))
      this.cookie = response.headers.get("set-cookie")!.split(";")[0];
    const json =
      response.status === 204 ? {} : ((await response.json()) as any);
    assert.equal(
      response.status,
      status,
      `${method} ${path}: ${JSON.stringify(json)}`,
    );
    if (json.data?.csrfToken) this.csrf = json.data.csrfToken;
    return json.data;
  }
  async init(name: string) {
    await this.request("GET", "/auth/csrf");
    await this.request("POST", "/auth/signup", {
      email: `${name}@example.test`,
      password: "Strong-password-123!",
      displayName: name,
      consents: [
        { type: "TERMS", version: "1" },
        { type: "PRIVACY", version: "1" },
      ],
    });
    const login = await this.request("POST", "/auth/login", {
      email: `${name}@example.test`,
      password: "Strong-password-123!",
    });
    this.userId = login.user.id;
    await runtime.db.query(
      "INSERT INTO school_verifications(id,user_id,method,affiliation_type,state,expires_at) VALUES($1,$2,'EVIDENCE','STUDENT','VERIFIED',now()+interval '30 days')",
      [randomUUID(), this.userId],
    );
    await runtime.db.query(
      "UPDATE profiles SET visibility='PUBLIC' WHERE user_id=$1",
      [this.userId],
    );
    return this;
  }
}
before(async () => {
  const config = configuration({
    APP_ENV: "test",
    SESSION_SECRET: "test-secret-32-characters-long-only",
    WORKER_INLINE: "false",
    DATA_DIR: resolve(".data", `test-${randomUUID()}`),
  });
  runtime = await createApp({ db: new Database(), config });
  await runtime.app.listen(0, "127.0.0.1");
  base = await runtime.app.getUrl();
  runtime.config.baseUrl = base;
  base += "/api/v1";
  fieldId = (await one(runtime.db, "SELECT id FROM service_fields LIMIT 1")).id;
  owner = await new Client().init("owner");
  provider = await new Client().init("provider");
  outsider = await new Client().init("outsider");
});
after(async () => {
  await runtime?.close();
});
function terms() {
  return {
    title: "테스트 프로젝트",
    summary: "설계 구현 검증",
    content: "반응형 웹 디자인 작업",
    deliverables: "디자인 원본과 결과물",
    fieldId,
    budgetType: "FIXED",
    budgetMin: 100000,
    budgetMax: 100000,
    days: 7,
    mode: "ONLINE",
  };
}
async function openProject() {
  const p = await owner.request("POST", "/projects", {
    terms: terms(),
    closesAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const pub = await owner.request("POST", `/projects/${p.id}/publish`, {
    expectedVersion: 1,
  });
  return { ...p, ...pub };
}
async function match() {
  const p = await openProject();
  const a = await provider.request("POST", `/projects/${p.id}/proposals`, {
    content: "지원합니다",
    amount: 100000,
    days: 7,
  });
  return owner.request("POST", `/projects/${p.id}/selection`, {
    expectedVersion: p.version,
    proposalId: a.id,
    proposalRevisionId: a.revisionId,
    acknowledgedProjectRevisionId: p.currentRevisionId,
  });
}
async function sign(m: any) {
  const contract = await owner.request("GET", `/contracts/${m.contractId}`);
  const v = contract.versions.at(-1);
  const pub = await owner.request(
    "POST",
    `/contract-versions/${v.id}/publish`,
    { expectedVersion: contract.version },
  );
  const first = await owner.request(
    "POST",
    `/contract-versions/${v.id}/acceptances`,
    { expectedVersion: pub.version, contentHash: pub.contentHash },
  );
  await provider.request(
    "POST",
    `/contract-versions/${v.id}/acceptances`,
    { expectedVersion: pub.version, contentHash: pub.contentHash },
    409,
  );
  const signed = await provider.request(
    "POST",
    `/contract-versions/${v.id}/acceptances`,
    { expectedVersion: first.version, contentHash: pub.contentHash },
  );
  assert.equal(signed.status, "SIGNED");
  return v.id;
}

test("draft privacy, CSRF, strict server-owned fields, idempotency", async () => {
  const key = randomUUID(),
    body = { terms: terms() };
  const p = await owner.request("POST", "/projects", body, 200, key);
  assert.equal(
    (await owner.request("POST", "/projects", body, 200, key)).id,
    p.id,
  );
  await owner.request("POST", "/projects", { terms: {} }, 409, key);
  await new Client().request("GET", `/projects/${p.id}`, undefined, 404);
  await outsider.request("GET", `/projects/${p.id}`, undefined, 404);
  await outsider.request(
    "PATCH",
    `/projects/${p.id}`,
    { expectedVersion: 1, terms: {} },
    404,
  );
  await owner.request(
    "POST",
    "/projects",
    { terms: terms(), ownerId: outsider.userId },
    422,
  );
  const csrf = owner.csrf;
  owner.csrf = "invalid";
  await owner.request("POST", "/projects", body, 403);
  owner.csrf = csrf;
  await owner.request("GET", "/admin/verifications", undefined, 403);
});
test("concurrent selection yields one match; full signed contract → completion → reviews", async () => {
  const p = await openProject();
  const a = await provider.request("POST", `/projects/${p.id}/proposals`, {
    content: "지원합니다",
    amount: 100000,
    days: 7,
  });
  const b = await outsider.request("POST", `/projects/${p.id}/proposals`, {
    content: "두 번째 지원",
    amount: 90000,
    days: 6,
  });
  const select = (proposal: any) =>
    fetch(base + `/projects/${p.id}/selection`, {
      method: "POST",
      headers: {
        cookie: owner.cookie,
        origin: runtime.config.origin,
        "x-csrf-token": owner.csrf,
        "idempotency-key": randomUUID(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: p.version,
        proposalId: proposal.id,
        proposalRevisionId: proposal.revisionId,
        acknowledgedProjectRevisionId: p.currentRevisionId,
      }),
    });
  const responses = await Promise.all([select(a), select(b)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const m = ((await responses.find((r) => r.status === 200)!.json()) as any)
    .data;
  const selected = await one(
    runtime.db,
    "SELECT provider_id FROM matches WHERE project_id=$1",
    [p.id],
  );
  // Keep helper roles independent of request scheduling.
  if (selected.provider_id !== provider.userId) {
    const swap = provider;
    provider = outsider;
    outsider = swap;
  }
  assert.equal(
    Number(
      (
        await one(
          runtime.db,
          "SELECT count(*) n FROM matches WHERE project_id=$1",
          [p.id],
        )
      ).n,
    ),
    1,
  );
  await outsider.request("GET", `/workrooms/${m.workroomId}`, undefined, 404);
  const vid = await sign(m);
  const room = await provider.request("GET", `/workrooms/${m.workroomId}`);
  const complete = await provider.request(
    "POST",
    `/workrooms/${m.workroomId}/completion-requests`,
    { expectedVersion: room.version, signedVersionId: vid, note: "납품 완료" },
  );
  await provider.request(
    "POST",
    `/completion-requests/${complete.id}/approve`,
    { expectedVersion: 1 },
    403,
  );
  await owner.request("POST", `/completion-requests/${complete.id}/approve`, {
    expectedVersion: 1,
  });
  await owner.request("POST", `/projects/${p.id}/reviews`, {
    rating: 5,
    body: "만족합니다",
  });
  await owner.request(
    "POST",
    `/projects/${p.id}/reviews`,
    { rating: 4, body: "중복 후기" },
    409,
  );
  await provider.request("POST", `/projects/${p.id}/reviews`, {
    rating: 5,
    body: "요청이 명확했습니다",
  });
  await runtime.worker.tick();
  await runtime.worker.tick();
  const doc = await owner.request("GET", `/contract-versions/${vid}/document`);
  assert.equal(doc.status, "READY");
  const pdf = await fetch(doc.url, { headers: { cookie: owner.cookie } });
  assert.equal(pdf.status, 200);
  assert.ok(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .equals(Buffer.from("%PDF-")),
  );
  const count = Number(
    (await one(runtime.db, "SELECT count(*) n FROM notifications")).n,
  );
  await runtime.worker.tick();
  assert.equal(
    Number((await one(runtime.db, "SELECT count(*) n FROM notifications")).n),
    count,
  );
  await assert.rejects(
    runtime.db.query("UPDATE contract_versions SET body='{}' WHERE id=$1", [
      vid,
    ]),
  );
});
test("direct request quote locks latest terms and receiving role", async () => {
  const r = await owner.request("POST", "/direct-requests", {
    recipientId: provider.userId,
    terms: terms(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await outsider.request("GET", `/direct-requests/${r.id}`, undefined, 404);
  const quote = await provider.request(
    "POST",
    `/direct-requests/${r.id}/quotes`,
    {
      expectedVersion: 1,
      terms: { ...terms(), budgetMin: 200000, budgetMax: 200000 },
    },
  );
  await owner.request(
    "POST",
    `/direct-requests/${r.id}/accept`,
    { expectedVersion: 2, termsId: r.latestTermsId },
    409,
  );
  await provider.request(
    "POST",
    `/direct-requests/${r.id}/accept`,
    { expectedVersion: 2, termsId: quote.termsId },
    403,
  );
  const matched = await owner.request(
    "POST",
    `/direct-requests/${r.id}/accept`,
    { expectedVersion: 2, termsId: quote.termsId },
  );
  await new Client().request(
    "GET",
    `/projects/${matched.projectId}`,
    undefined,
    404,
  );
  const p = await owner.request("GET", `/projects/${matched.projectId}`);
  assert.equal(p.budgetMin, 200000);
});
test("cancellation blocks signing and preserves signed history", async () => {
  const m = await match(),
    vid = await sign(m),
    r = await owner.request("GET", `/workrooms/${m.workroomId}`);
  const cancel = await owner.request(
    "POST",
    `/projects/${m.projectId}/cancellation-requests`,
    { expectedVersion: r.version, reason: "일정 변경" },
  );
  await provider.request(
    "POST",
    `/workrooms/${m.workroomId}/completion-requests`,
    { expectedVersion: r.version, signedVersionId: vid, note: "완료" },
    409,
  );
  await owner.request(
    "POST",
    `/cancellation-requests/${cancel.id}/approve`,
    { expectedVersion: 1 },
    403,
  );
  await provider.request(
    "POST",
    `/cancellation-requests/${cancel.id}/approve`,
    { expectedVersion: 1 },
  );
  assert.equal(
    (await owner.request("GET", `/projects/${m.projectId}`)).status,
    "CANCELLED",
  );
  assert.equal(
    (
      await one(
        runtime.db,
        "SELECT status FROM contract_versions WHERE id=$1",
        [vid],
      )
    ).status,
    "SIGNED",
  );
});
test("upload scanning, file access and message retry deduplication", async () => {
  const m = await match();
  const r = await owner.request("GET", `/workrooms/${m.workroomId}`);
  const upload = async (content: string, purpose = "WORKROOM") => {
    const u = await provider.request("POST", "/uploads", {
      filename: "test.txt",
      size: Buffer.byteLength(content),
      mime: "text/plain",
      purpose,
      ...(purpose === "WORKROOM" ? { targetId: m.workroomId } : {}),
    });
    assert.equal(
      (await fetch(u.url, { method: "PUT", body: content })).status,
      200,
    );
    await provider.request("POST", `/uploads/${u.uploadId}/complete`, {}, 202);
    await runtime.worker.tick();
    return u;
  };
  const u = await upload("작업 결과물");
  assert.equal(
    (await provider.request("GET", `/uploads/${u.uploadId}`)).state,
    "READY",
  );
  await provider.request("POST", `/workrooms/${m.workroomId}/files`, {
    mediaId: u.mediaId,
  });
  await owner.request("GET", `/media/${u.mediaId}/download`);
  await outsider.request("GET", `/media/${u.mediaId}/download`, undefined, 404);
  const message = {
    text: "납품 파일입니다",
    clientMessageId: randomUUID(),
    mediaIds: [u.mediaId],
  };
  const first = await provider.request(
    "POST",
    `/conversations/${r.conversationId}/messages`,
    message,
  );
  const second = await provider.request(
    "POST",
    `/conversations/${r.conversationId}/messages`,
    message,
  );
  assert.equal(first.id, second.id);
  const bad = await upload("EICAR-STANDARD-ANTIVIRUS-TEST-FILE");
  assert.equal(
    (await provider.request("GET", `/uploads/${bad.uploadId}`)).state,
    "REJECTED",
  );
  await provider.request(
    "POST",
    `/workrooms/${m.workroomId}/files`,
    { mediaId: bad.mediaId },
    422,
  );
  const evidence = await upload("학생 증빙", "VERIFICATION");
  await provider.request(
    "POST",
    `/workrooms/${m.workroomId}/files`,
    { mediaId: evidence.mediaId },
    422,
  );
});
test("public discovery endpoints and generated OpenAPI are usable", async () => {
  const guest = new Client();
  for (const path of [
    "/home",
    "/search?q=테스트",
    "/projects?budgetMin=1&budgetMax=200000",
    "/experts",
    "/portfolios",
    "/categories",
    "/skills",
  ])
    await guest.request("GET", path);
  const schema = runtime.http.openapi();
  assert.ok(Object.keys(schema.paths).length > 70);
});
test("private portfolio sharing is explicit and freezes the submitted version", async () => {
  const p = await provider.request("POST", "/portfolios", {
    title: "비공개 작업",
    summary: "제안서 공유용",
    role: "디자이너",
    fieldId,
  });
  await outsider.request("GET", `/portfolios/${p.id}`, undefined, 404);
  const project = await openProject();
  const body = {
    content: "대표작 제안",
    amount: 100000,
    days: 7,
    portfolioVersionIds: [p.currentVersionId],
  };
  await provider.request(
    "POST",
    `/projects/${project.id}/proposals`,
    body,
    422,
  );
  const proposal = await provider.request(
    "POST",
    `/projects/${project.id}/proposals`,
    { ...body, explicitShareIds: [p.currentVersionId] },
  );
  await provider.request("PATCH", `/portfolios/${p.id}`, {
    expectedVersion: 1,
    title: "수정된 작업",
    summary: "수정 내용",
    role: "디자이너",
    fieldId,
  });
  const detail = await owner.request("GET", `/proposals/${proposal.id}`);
  assert.equal(detail.portfolios[0].metadata.title, "비공개 작업");
  await outsider.request("GET", `/proposals/${proposal.id}`, undefined, 404);
});
test("contract amendments keep prior signed version and reject superseded acceptance", async () => {
  const m = await match(),
    signed = await sign(m);
  const original = await owner.request("GET", `/contracts/${m.contractId}`);
  const draft = await provider.request(
    "POST",
    `/workrooms/${m.workroomId}/contracts/versions`,
    {
      expectedVersion: original.version,
      baseSignedVersionId: signed,
      body: {
        scope: "변경 범위",
        deliverables: "변경 결과물",
        amount: 200000,
        days: 10,
      },
    },
  );
  const pub = await provider.request(
    "POST",
    `/contract-versions/${draft.id}/publish`,
    { expectedVersion: draft.version },
  );
  const replacement = await owner.request(
    "POST",
    `/workrooms/${m.workroomId}/contracts/versions`,
    {
      expectedVersion: pub.version,
      baseSignedVersionId: signed,
      body: {
        scope: "다시 변경",
        deliverables: "최종 결과물",
        amount: 200000,
        days: 14,
      },
    },
  );
  await owner.request(
    "POST",
    `/contract-versions/${draft.id}/acceptances`,
    { expectedVersion: replacement.version, contentHash: pub.contentHash },
    409,
  );
  const latest = await owner.request("GET", `/contracts/${m.contractId}`);
  assert.equal(latest.signedVersionId, signed);
  assert.equal(latest.reviewVersionId, replacement.id);
});
test("image re-encoding, avatar read and verification staff scope audit", async () => {
  const image = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();
  const upload = async (purpose: string) => {
    const u = await provider.request("POST", "/uploads", {
      filename: "image.png",
      size: image.length,
      mime: "image/png",
      purpose,
    });
    assert.equal(
      (await fetch(u.url, { method: "PUT", body: image })).status,
      200,
    );
    await provider.request("POST", `/uploads/${u.uploadId}/complete`, {}, 202);
    await runtime.worker.tick();
    return u;
  };
  const avatar = await upload("AVATAR");
  const profile = await provider.request("GET", "/me/profile");
  await provider.request("PATCH", "/me/profile", {
    expectedVersion: profile.version,
    avatarMediaId: avatar.mediaId,
  });
  assert.equal(
    (await fetch(base + `/media/${avatar.mediaId}/preview`)).status,
    200,
  );
  const evidence = await upload("VERIFICATION");
  const request = await provider.request("POST", "/me/school-verifications", {
    method: "EVIDENCE",
    affiliationType: "STUDENT",
    evidenceMediaId: evidence.mediaId,
  });
  await outsider.request(
    "GET",
    `/media/${evidence.mediaId}/download`,
    undefined,
    404,
  );
  await runtime.db.query(
    "UPDATE users SET staff_scopes=ARRAY['verification'] WHERE id=$1",
    [outsider.userId],
  );
  await outsider.request("GET", `/admin/verifications/${request.id}`);
  await outsider.request("GET", `/media/${evidence.mediaId}/download`);
  await outsider.request("PATCH", `/admin/verifications/${request.id}`, {
    expectedVersion: 1,
    state: "VERIFIED",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    reason: "증빙 확인",
  });
  assert.ok(
    Number(
      (
        await one(
          runtime.db,
          "SELECT count(*) n FROM audit_logs WHERE action='verification.media_read'",
        )
      ).n,
    ) > 0,
  );
  await outsider.request("GET", "/admin/reports", undefined, 403);
});
test("SSE delivers recipient events and password reset revokes sessions and tokens", async () => {
  await runtime.worker.tick();
  const abort = new AbortController();
  const stream = await fetch(base + "/events", {
    headers: { cookie: owner.cookie },
    signal: abort.signal,
  });
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  const chunk = await reader.read();
  assert.match(new TextDecoder().decode(chunk.value), /event:|heartbeat/);
  abort.abort();
  await reader.cancel().catch(() => {});
  const account = await new Client().init("reset-user");
  await account.request("POST", "/auth/password-resets", {
    email: "reset-user@example.test",
  });
  await runtime.worker.tick();
  const mailDir = resolve(runtime.config.dataDir, "mail");
  const files = await readdir(mailDir);
  const mails = await Promise.all(
    files.map((f) => readFile(resolve(mailDir, f), "utf8").then(JSON.parse)),
  );
  const mail = mails.find((m) => m.to === "reset-user@example.test");
  assert.ok(mail?.token);
  const guest = new Client();
  await guest.request("GET", "/auth/csrf");
  await guest.request("POST", "/auth/password-resets/confirm", {
    token: mail.token,
    newPassword: "New-password-456!",
  });
  await account.request("GET", "/me", undefined, 401);
  await guest.request(
    "POST",
    "/auth/password-resets/confirm",
    { token: mail.token, newPassword: "New-password-456!" },
    422,
  );
  await guest.request("POST", "/auth/login", {
    email: "reset-user@example.test",
    password: "New-password-456!",
  });
});
test("expiry worker closes recruitment and expires requests without creating matches", async () => {
  const p = await openProject();
  await runtime.db.query(
    "UPDATE projects SET closes_at=now()-interval '1 second' WHERE id=$1",
    [p.id],
  );
  const r = await owner.request("POST", "/direct-requests", {
    recipientId: provider.userId,
    terms: terms(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await runtime.db.query(
    "UPDATE direct_requests SET expires_at=now()-interval '1 second' WHERE id=$1",
    [r.id],
  );
  await runtime.worker.tick();
  assert.equal(
    (await owner.request("GET", `/projects/${p.id}`)).status,
    "CLOSED",
  );
  assert.equal(
    (await owner.request("GET", `/direct-requests/${r.id}`)).status,
    "EXPIRED",
  );
});
test("project reference attachments follow revision ownership and public visibility", async () => {
  const p = await owner.request("POST", "/projects", {
    terms: terms(),
    closesAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const u = await owner.request("POST", "/uploads", {
    filename: "brief.txt",
    size: 5,
    mime: "text/plain",
    purpose: "PROJECT",
    targetId: p.id,
  });
  assert.equal(
    (await fetch(u.url, { method: "PUT", body: "brief" })).status,
    200,
  );
  await owner.request("POST", `/uploads/${u.uploadId}/complete`, {}, 202);
  await runtime.worker.tick();
  await owner.request("PATCH", `/projects/${p.id}`, {
    expectedVersion: 1,
    terms: { mediaIds: [u.mediaId] },
  });
  await new Client().request(
    "GET",
    `/media/${u.mediaId}/download`,
    undefined,
    404,
  );
  await owner.request("POST", `/projects/${p.id}/publish`, {
    expectedVersion: 2,
  });
  const detail = await new Client().request("GET", `/projects/${p.id}`);
  assert.equal(detail.attachments[0].mediaId, u.mediaId);
  await new Client().request("GET", `/media/${u.mediaId}/download`);
  await owner.request("POST", `/projects/${p.id}/cancel`, {
    expectedVersion: 3,
  });
  await new Client().request(
    "GET",
    `/media/${u.mediaId}/download`,
    undefined,
    404,
  );
});
test("failed jobs preserve retry identity and operations scope is mandatory", async () => {
  const job = randomUUID();
  await runtime.db.query(
    "INSERT INTO jobs(id,handler,dedup_key,payload,attempts) VALUES($1,'unknown-test',$2,'{}',4)",
    [job, job],
  );
  await runtime.worker.tick();
  assert.equal(
    (await one(runtime.db, "SELECT state FROM jobs WHERE id=$1", [job])).state,
    "FAILED",
  );
  await owner.request(
    "POST",
    `/admin/jobs/${job}/retry`,
    { reason: "재처리" },
    403,
  );
  await runtime.db.query(
    "UPDATE users SET staff_scopes=ARRAY['verification','operations'] WHERE id=$1",
    [outsider.userId],
  );
  await outsider.request("POST", `/admin/jobs/${job}/retry`, {
    reason: "운영 검증",
  });
  const retried = await one(
    runtime.db,
    "SELECT state,attempts,dedup_key FROM jobs WHERE id=$1",
    [job],
  );
  assert.equal(retried.state, "PENDING");
  assert.equal(retried.attempts, 0);
  assert.equal(retried.dedup_key, job);
});
test("unverified users can save drafts but cannot publish", async () => {
  const account = await new Client().init("unverified");
  await runtime.db.query(
    "UPDATE school_verifications SET state='REVOKED' WHERE user_id=$1",
    [account.userId],
  );
  const p = await account.request("POST", "/projects", {
    terms: terms(),
    closesAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await account.request(
    "POST",
    `/projects/${p.id}/publish`,
    { expectedVersion: 1 },
    403,
  );
  await runtime.db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [
    account.userId,
  ]);
  await account.request("GET", "/me", undefined, 401);
});
test("launch home uses opted-in completed public trades and removes hidden reviews", async () => {
  const initial = await new Client().request("GET", "/home");
  assert.deepEqual(initial.reviews, []);
  const reviewIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const m = await match(),
      vid = await sign(m),
      r = await provider.request("GET", `/workrooms/${m.workroomId}`);
    const request = await provider.request(
      "POST",
      `/workrooms/${m.workroomId}/completion-requests`,
      { expectedVersion: r.version, signedVersionId: vid, note: "완료" },
    );
    await owner.request("POST", `/completion-requests/${request.id}/approve`, {
      expectedVersion: 1,
    });
    const review = await owner.request(
      "POST",
      `/projects/${m.projectId}/reviews`,
      {
        rating: i + 2,
        body: "실제 공개 완료 거래 후기",
        homeFeaturedOptIn: true,
      },
    );
    reviewIds.push(review.id);
    const home = await new Client().request("GET", "/home");
    assert.equal(home.reviews.length, i === 2 ? 3 : 0);
    assert.ok(
      home.projects.every(
        (p: any) => p.status === "OPEN" && Date.parse(p.closesAt) > Date.now(),
      ),
    );
    assert.equal(
      (await owner.request("GET", `/projects/${m.projectId}/my-review`)).id,
      review.id,
    );
  }
  await owner.request("PATCH", `/me/reviews/${reviewIds[0]}`, {
    visibility: "PRIVATE",
    homeFeaturedOptIn: false,
  });
  assert.deepEqual((await new Client().request("GET", "/home")).reviews, []);
  await outsider.request(
    "PATCH",
    `/me/reviews/${reviewIds[1]}`,
    { visibility: "PRIVATE", homeFeaturedOptIn: false },
    404,
  );
});
test("profile publishing requires real headline and taxonomy; public configuration exposes no secrets", async () => {
  const c = await new Client().init("profile-check");
  const p = await c.request("GET", "/me/profile");
  await c.request(
    "PATCH",
    "/me/profile",
    { expectedVersion: p.version, visibility: "PUBLIC" },
    422,
  );
  await c.request("PATCH", "/me/profile", {
    expectedVersion: p.version,
    visibility: "PUBLIC",
    headline: "실제 활동 소개",
    fieldIds: [fieldId],
  });
  const config = await new Client().request("GET", "/public-config");
  assert.equal(config.registrationEnabled, true);
  assert.ok(!("secret" in config));
});
test("expired verification disappears immediately and session reads do not consume login attempts", async () => {
  const c = await new Client().init("expired-check");
  await runtime.db.query(
    "UPDATE school_verifications SET expires_at=now()-interval '1 second' WHERE user_id=$1",
    [c.userId],
  );
  const session = await c.request("GET", "/auth/session");
  assert.notEqual(session.verification.state, "VERIFIED");
  const profile = await c.request("GET", "/me/profile");
  assert.equal(
    (await c.request("GET", `/experts/${profile.id}`)).schoolVerified,
    false,
  );
  const project = await c.request("POST", "/projects", {
    terms: terms(),
    closesAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await c.request(
    "POST",
    `/projects/${project.id}/publish`,
    { expectedVersion: 1 },
    403,
  );
  for (let i = 0; i < 61; i++) await c.request("GET", "/auth/session");
  await c.request("POST", "/auth/login", {
    email: "expired-check@example.test",
    password: "Strong-password-123!",
  });
});

test("notification preferences are private and suppress optional notices without suppressing events or essential notices", async () => {
  await new Client().request(
    "GET",
    "/me/notification-preferences",
    undefined,
    401,
  );
  const member = await new Client().init("preferences-check");
  assert.deepEqual(
    await member.request("GET", "/me/notification-preferences"),
    { messages: true, matching: true },
  );
  await member.request("PUT", "/me/notification-preferences", {
    messages: false,
    matching: false,
  });
  assert.deepEqual(
    await member.request("GET", "/me/notification-preferences"),
    { messages: false, matching: false },
  );
  assert.deepEqual(
    await outsider.request("GET", "/me/notification-preferences"),
    { messages: true, matching: true },
  );
  const aggregate = randomUUID();
  for (const type of [
    "message.created",
    "proposal.submitted",
    "contract.review_requested",
  ])
    await emit(runtime.db, type, aggregate, 1, [member.userId], {});
  for (let i = 0; i < 20; i++) {
    await runtime.worker.tick();
    const delivered = await one(
      runtime.db,
      "SELECT count(*) AS n FROM user_events WHERE recipient_id=$1",
      [member.userId],
    );
    if (Number(delivered.n) === 3) break;
  }
  const notices = await runtime.db.query(
    "SELECT type FROM notifications WHERE recipient_id=$1",
    [member.userId],
  );
  assert.deepEqual(
    notices.rows.map((r) => r.type),
    ["contract.review_requested"],
  );
  const events = await runtime.db.query(
    "SELECT type FROM user_events WHERE recipient_id=$1",
    [member.userId],
  );
  assert.equal(events.rows.length, 3);
});
