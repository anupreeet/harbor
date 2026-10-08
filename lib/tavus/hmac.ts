import { createHmac, timingSafeEqual } from "node:crypto";

// Tavus signs API-delivered tool calls: X-Tavus-Signature = hex HMAC-SHA256 of the exact
// request body bytes. Verify the raw text you received — re-serialising the parsed JSON
// changes the bytes and breaks the signature. There's no timestamp in the envelope, so
// replay protection is idempotency on tool_call_id (see lib/tools/run.ts).

export function sign(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifySignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature) return false; // secret is mandatory: unsigned server tools would let anyone write
  const expected = Buffer.from(sign(rawBody, secret), "utf8");
  const given = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
