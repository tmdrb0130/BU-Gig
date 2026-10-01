import { createConnection } from "node:net";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import nodemailer from "nodemailer";
import { Database, one } from "./db";
import { Config } from "./config";
import { Storage } from "./storage";
import { demand, hash, id } from "./shared";
import { emit } from "./policy";
import { decrypt } from "./modules/identity";
export class Worker {
  private running = false;
  constructor(
    public db: Database,
    public config: Config,
    public storage: Storage,
  ) {}
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.maintenance();
      await this.db.tx(async (q) => {
        const events = (
          await q.query(
            "SELECT * FROM outbox_events WHERE dispatched_at IS NULL ORDER BY occurred_at FOR UPDATE SKIP LOCKED LIMIT 30",
          )
        ).rows;
        for (const event of events) {
          for (const handler of event.type === "contract.signed"
            ? ["notify", "pdf"]
            : ["notify"])
            await q.query(
              "INSERT INTO jobs(id,event_id,handler,dedup_key,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
              [
                id(),
                event.id,
                handler,
                event.id,
                JSON.stringify({ eventId: event.id, ...event.data }),
              ],
            );
          await q.query(
            "UPDATE outbox_events SET dispatched_at=now() WHERE id=$1",
            [event.id],
          );
        }
      });
      for (let i = 0; i < 30; i++) {
        const job = await this.db.tx(async (q) => {
          const j = await one(
            q,
            `SELECT * FROM jobs WHERE ((state IN ('PENDING','RETRY_WAIT') AND next_run_at<=now()) OR (state='RUNNING' AND lease_until<now())) ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 1`,
          );
          if (!j) return null;
          return one(
            q,
            `UPDATE jobs SET state='RUNNING',attempts=attempts+1,lease_token=$2,lease_until=now()+interval '120 seconds' WHERE id=$1 RETURNING *`,
            [j.id, id()],
          );
        });
        if (!job) break;
        try {
          if (job.handler === "notify") await this.notify(job);
          else if (job.handler === "scan") await this.scan(job);
          else if (job.handler === "pdf") await this.pdf(job);
          else if (job.handler === "mail") await this.mail(job);
          else throw new Error("Unknown job handler");
          await this.db.query(
            `UPDATE jobs SET state='SUCCEEDED',lease_until=NULL WHERE id=$1 AND lease_token=$2`,
            [job.id, job.lease_token],
          );
        } catch (e: any) {
          await this.db.query(
            `UPDATE jobs SET state=$3,last_error=$4,next_run_at=$5,lease_until=NULL WHERE id=$1 AND lease_token=$2`,
            [
              job.id,
              job.lease_token,
              job.attempts >= 5 ? "FAILED" : "RETRY_WAIT",
              String(e.code || e.name || "JOB_FAILED").slice(0, 100),
              new Date(Date.now() + Math.min(300000, 1000 * 2 ** job.attempts)),
            ],
          );
          if (job.handler === "pdf")
            await this.db.query(
              `UPDATE contract_versions SET document_status='FAILED' WHERE id=$1 AND document_status<>'READY'`,
              [job.payload.versionId],
            );
        }
      }
    } finally {
      this.running = false;
    }
  }
  async maintenance() {
    await this.db.tx(async (q) => {
      await q.query(
        "DELETE FROM sessions WHERE absolute_expires_at<now() OR idle_expires_at<now() OR revoked_at IS NOT NULL",
      );
      await q.query("DELETE FROM auth_tokens WHERE expires_at<now()");
      await q.query("DELETE FROM idempotency_records WHERE expires_at<now()");
      await q.query(
        "DELETE FROM user_events WHERE created_at<now()-interval '7 days'",
      );
      await q.query(
        "UPDATE media_objects SET state='EXPIRED' WHERE state='UPLOADING' AND id IN (SELECT media_id FROM uploads WHERE expires_at<now())",
      );
      const schools = (
        await q.query(
          "UPDATE school_verifications SET state='EXPIRED',version=version+1 WHERE state='VERIFIED' AND expires_at<=now() RETURNING *",
        )
      ).rows;
      for (const v of schools)
        await emit(
          q,
          "verification.changed",
          v.user_id,
          v.version,
          [v.user_id],
          { userId: v.user_id },
        );
      const requests = (
        await q.query(
          "UPDATE direct_requests SET status='EXPIRED',version=version+1 WHERE status='PENDING' AND expires_at<=now() RETURNING *",
        )
      ).rows;
      for (const r of requests)
        await emit(
          q,
          "direct_request.resolved",
          r.id,
          r.version,
          [r.sender_id, r.recipient_id],
          { requestId: r.id },
        );
      const projects = (
        await q.query(
          "UPDATE projects SET status='CLOSED',version=version+1 WHERE status='OPEN' AND closes_at<=now() RETURNING *",
        )
      ).rows;
      for (const p of projects)
        await emit(q, "project.updated", p.id, p.version, [p.owner_id], {
          projectId: p.id,
        });
    });
  }
  async drain() {
    while (this.running)
      await new Promise((resolve) => setTimeout(resolve, 20));
  }
  async notify(job: any) {
    await this.db.tx(async (q) => {
      const claimed = await one(
        q,
        `INSERT INTO processed_events(consumer,event_id) VALUES('notify',$1) ON CONFLICT DO NOTHING RETURNING event_id`,
        [job.event_id],
      );
      if (!claimed) return;
      const event = await one(q, "SELECT * FROM outbox_events WHERE id=$1", [
        job.event_id,
      ]);
      for (const uid of [...event.recipients].sort()) {
        if (
          !(await one(
            q,
            `SELECT id FROM users WHERE id=$1 AND status='ACTIVE'`,
            [uid],
          ))
        )
          continue;
        await q.query(
          "INSERT INTO recipient_streams(user_id) VALUES($1) ON CONFLICT DO NOTHING",
          [uid],
        );
        const stream = await one(
          q,
          "UPDATE recipient_streams SET last_sequence=last_sequence+1 WHERE user_id=$1 RETURNING last_sequence",
          [uid],
        );
        await q.query(
          "INSERT INTO user_events(recipient_id,sequence,event_id,type,data) VALUES($1,$2,$3,$4,$5)",
          [
            uid,
            stream.last_sequence,
            event.id,
            event.type,
            JSON.stringify({
              ...event.data,
              aggregateId: event.aggregate_id,
              aggregateVersion: event.aggregate_version,
              eventId: event.id,
            }),
          ],
        );
        if (event.type !== "message.read")
          await q.query(
            "INSERT INTO notifications(id,recipient_id,event_id,type,target_ref) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
            [id(), uid, event.id, event.type, JSON.stringify(event.data)],
          );
      }
      if (event.data.conversationId && !event.type.startsWith("message.")) {
        const conv = await one(
          q,
          "UPDATE conversations SET next_sequence=next_sequence+1 WHERE id=$1 RETURNING next_sequence",
          [event.data.conversationId],
        );
        if (conv)
          await q.query(
            `INSERT INTO messages(id,conversation_id,source_event_id,sequence,kind,text) VALUES($1,$2,$3,$4,'SYSTEM',$5) ON CONFLICT DO NOTHING`,
            [
              id(),
              event.data.conversationId,
              event.id,
              conv.next_sequence,
              event.type,
            ],
          );
      }
    });
  }
  async scan(job: any) {
    const m = await one(this.db, "SELECT * FROM media_objects WHERE id=$1", [
      job.payload.mediaId,
    ]);
    if (!m || ["READY", "REJECTED"].includes(m.state)) return;
    const buffer = await this.storage.get(m.object_key);
    let bytes: Buffer = buffer;
    let rejected = false;
    if (
      hash(buffer) !== job.payload.checksum ||
      buffer.length !== Number(m.size)
    )
      rejected = true;
    if (this.config.scanner === "clamd") {
      if (!(await clamScan(buffer))) rejected = true;
    } else if (
      buffer.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"))
    )
      rejected = true;
    if (
      m.mime === "application/pdf" &&
      !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))
    )
      rejected = true;
    if (
      m.mime === "text/plain" &&
      (buffer.includes(0) ||
        Buffer.from(buffer.toString("utf8")).compare(buffer) !== 0)
    )
      rejected = true;
    if (m.mime.startsWith("image/")) {
      try {
        const image = sharp(buffer, { limitInputPixels: 40000000 }),
          meta = await image.metadata();
        demand(`image/${meta.format}` === m.mime, "MIME_MISMATCH", 422);
        bytes = await image
          .rotate()
          .toFormat(meta.format as any)
          .toBuffer();
      } catch {
        rejected = true;
      }
    }
    const key = `ready/${m.id}`;
    if (!rejected) await this.storage.put(key, bytes, m.mime);
    await this.db.tx(async (q) => {
      const j = await one(
        q,
        "SELECT lease_token FROM jobs WHERE id=$1 FOR UPDATE",
        [job.id],
      );
      if (j.lease_token !== job.lease_token) return;
      await q.query(
        "UPDATE media_objects SET state=$2,ready_key=$3,checksum=$4,size=$5 WHERE id=$1",
        [
          m.id,
          rejected ? "REJECTED" : "READY",
          rejected ? null : key,
          hash(bytes),
          bytes.length,
        ],
      );
      await emit(
        q,
        rejected ? "media.rejected" : "media.ready",
        m.id,
        1,
        [m.owner_id],
        { mediaId: m.id },
      );
    });
  }
  async pdf(job: any) {
    const v = await one(
      this.db,
      `SELECT v.*,w.project_id,p.owner_id,m.provider_id FROM contract_versions v JOIN contracts c ON c.id=v.contract_id JOIN workrooms w ON w.id=c.workroom_id JOIN projects p ON p.id=w.project_id JOIN matches m ON m.id=w.match_id WHERE v.id=$1`,
      [job.payload.versionId],
    );
    demand(v?.status === "SIGNED", "NOT_SIGNED");
    if (v.document_status === "READY") return;
    const font =
      process.env.PDF_FONT_PATH ||
      (process.platform === "win32" ? "C:/Windows/Fonts/malgun.ttf" : "");
    demand(font, "PDF_FONT_REQUIRED", 503);
    await readFile(font);
    const doc = new PDFDocument({ size: "A4", margin: 48 }),
      chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (d) => chunks.push(d));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc.font(font).fontSize(18).text("프로젝트 계약 체결본").moveDown();
    doc
      .fontSize(10)
      .text(`Version: ${v.id}\nHash: ${v.content_hash}`)
      .moveDown();
    for (const [k, value] of Object.entries(v.body))
      doc.text(`${k}: ${value}`).moveDown(0.5);
    const acceptances = (
      await this.db.query(
        "SELECT user_id,accepted_at FROM contract_acceptances WHERE contract_version_id=$1 ORDER BY user_id",
        [v.id],
      )
    ).rows;
    doc.moveDown().text("동의 기록");
    for (const a of acceptances)
      doc.text(`${a.user_id} / ${new Date(a.accepted_at).toISOString()}`);
    doc.end();
    const data = await done,
      key = `ready/contract-${v.id}.pdf`;
    await this.storage.put(key, data, "application/pdf");
    await this.db.tx(async (q) => {
      const j = await one(
        q,
        "SELECT lease_token FROM jobs WHERE id=$1 FOR UPDATE",
        [job.id],
      );
      if (j.lease_token !== job.lease_token) return;
      await q.query(
        `INSERT INTO media_objects(id,filename,object_key,ready_key,mime,size,checksum,state) VALUES($1,$2,$3,$3,'application/pdf',$4,$5,'READY') ON CONFLICT(id) DO NOTHING`,
        [v.id, `contract-${v.sequence}.pdf`, key, data.length, hash(data)],
      );
      await q.query(
        `INSERT INTO media_links(media_id,target_type,target_id) VALUES($1,'CONTRACT',$1) ON CONFLICT DO NOTHING`,
        [v.id],
      );
      await q.query(
        `UPDATE contract_versions SET document_media_id=$1,document_status='READY' WHERE id=$1`,
        [v.id],
      );
      await emit(
        q,
        "contract.document_ready",
        v.id,
        1,
        [v.owner_id, v.provider_id],
        { versionId: v.id, projectId: v.project_id },
      );
    });
  }
  async mail(job: any) {
    const payload = decrypt(job.payload.encrypted, this.config.secret);
    if (this.config.env === "staging")
      demand(
        (process.env.STAGING_RECIPIENT_ALLOWLIST || "")
          .split(",")
          .includes(payload.to),
        "RECIPIENT_NOT_ALLOWED",
        403,
      );
    if (this.config.mail === "smtp") {
      await nodemailer.createTransport(process.env.SMTP_URL!).sendMail({
        from: process.env.MAIL_FROM,
        to: payload.to,
        subject: payload.subject,
        text: `${payload.purpose}\nToken: ${payload.token}\nExpires in 30 minutes.`,
        messageId: `<${job.id}@bu-cmong.local>`,
      });
    } else {
      const dir = resolve(this.config.dataDir, "mail");
      await mkdir(dir, { recursive: true });
      await writeFile(
        resolve(dir, `${job.id}.json`),
        JSON.stringify(payload, null, 2),
        { mode: 0o600 },
      );
    }
  }
}
async function clamScan(data: Buffer): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({
      host: process.env.CLAMD_HOST || "127.0.0.1",
      port: Number(process.env.CLAMD_PORT || 3310),
    });
    const chunks: Buffer[] = [];
    socket.setTimeout(30000, () =>
      socket.destroy(new Error("Scanner timeout")),
    );
    socket.on("error", reject);
    socket.on("data", (b) => chunks.push(b));
    socket.on("end", () => {
      const response = Buffer.concat(chunks).toString();
      if (response.includes("FOUND")) resolve(false);
      else if (response.includes("OK")) resolve(true);
      else reject(new Error("Scanner unavailable"));
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < data.length; offset += 65536) {
        const part = data.subarray(offset, offset + 65536),
          size = Buffer.alloc(4);
        size.writeUInt32BE(part.length);
        socket.write(size);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
