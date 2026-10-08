import "server-only";
import { timingSafeEqual } from "node:crypto";
import { queryOne } from "../db";

// Every video call spends real Tavus minutes from the moment it's created, so a public
// deployment is gated twice: an optional invite code at sign-up, and call caps per account
// per hour plus a global cap per day.

export type GateResult = { ok: true } | { ok: false; status: number; reason: string };

export function checkInviteCode(given: string | undefined): boolean {
  const expected = process.env.INVITE_CODE;
  if (!expected) return true;
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Fixed-window counter. Returns the count after incrementing.
export async function hit(key: string, windowSeconds: number): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `INSERT INTO rate_limits (key, count, expires_at) VALUES ($1, 1, now() + make_interval(secs => $2))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.expires_at < now() THEN 1 ELSE rate_limits.count + 1 END,
       expires_at = CASE WHEN rate_limits.expires_at < now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
     RETURNING count`,
    [key, windowSeconds],
  );
  return row!.count;
}

export async function gateCall(contactId: string): Promise<GateResult> {
  const perHour = Number(process.env.CALLS_PER_ACCOUNT_PER_HOUR ?? 4);
  const perDay = Number(process.env.CALLS_PER_DAY ?? 30);
  if ((await hit(`call:contact:${contactId}`, 3600)) > perHour) {
    return { ok: false, status: 429, reason: "You've started several calls this hour. Please try again a little later." };
  }
  if ((await hit("call:day", 86_400)) > perDay) {
    return { ok: false, status: 429, reason: "Anna has reached today's call limit. Please try again tomorrow." };
  }
  return { ok: true };
}
