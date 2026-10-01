import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const id = randomUUID;
export const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export function canonical(v: any): string {
  return JSON.stringify(sort(v));
}
function sort(v: any): any {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = code,
    public fieldErrors: any[] = [],
  ) {
    super(message);
  }
}
export function demand(
  test: unknown,
  code = "INVALID_STATE",
  status = 409,
): asserts test {
  if (!test) throw new ApiError(status, code);
}
export const uuid = z.string().uuid();
export const versionInput = z.object({
  expectedVersion: z.number().int().positive(),
});
export const text = (max = 10000) => z.string().trim().min(1).max(max);
export const money = z.number().int().positive().max(1000000000);
export const days = z.number().int().min(1).max(365);
export const ids = z.array(uuid).max(10).default([]);
export function expected(row: any, body: any) {
  demand(
    Number.isInteger(body.expectedVersion) &&
      row.version === body.expectedVersion,
    "VERSION_CONFLICT",
  );
}
export function secureEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function page(query: any) {
  const page = z.coerce.number().int().min(1).default(1).parse(query.page),
    pageSize = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .parse(query.pageSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}
export function paginated(rows: any[], q: any) {
  const p = page(q);
  return {
    data: rows.slice(p.offset, p.offset + p.pageSize),
    meta: { page: p.page, pageSize: p.pageSize, total: rows.length },
  };
}
export function publicUser(u: any) {
  return {
    userId: u.id,
    displayName: u.display_name,
    profileId: u.profile_id || null,
    avatarUrl: null,
    schoolVerified: !!u.verified,
  };
}
export const termsSchema = z
  .object({
    title: text(80),
    summary: text(160),
    content: text(),
    deliverables: text(),
    requirements: z.string().max(10000).default(""),
    referenceUrl: z
      .string()
      .url()
      .refine((v) => /^https?:/.test(v))
      .optional()
      .nullable(),
    fieldId: text(100),
    mediaIds: ids,
    skillIds: z.array(z.string().max(100)).max(30).default([]),
    tags: z.array(z.string().max(50)).max(20).default([]),
    budgetType: z.enum(["FIXED", "RANGE", "NEGOTIABLE"]),
    budgetMin: money.nullable(),
    budgetMax: money.nullable(),
    days,
    mode: z.enum(["ONLINE", "OFFLINE", "HYBRID"]),
  })
  .strict()
  .superRefine((v, c) => {
    const valid =
      v.budgetType === "NEGOTIABLE"
        ? v.budgetMin === null && v.budgetMax === null
        : v.budgetMin !== null &&
          v.budgetMax !== null &&
          (v.budgetType === "FIXED"
            ? v.budgetMin === v.budgetMax
            : v.budgetMin <= v.budgetMax);
    if (!valid)
      c.addIssue({
        code: "custom",
        path: ["budgetMin"],
        message: "Invalid budget interval",
      });
  });
