import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, openSession, sealSession, verifyPassword } from "@/lib/auth";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters";
});

describe("passwords", () => {
  it("hashes with a fresh salt and verifies only the right password", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse", a)).toBe(true);
    expect(await verifyPassword("wrong horse", a)).toBe(false);
    expect(await verifyPassword("correct horse", "not-a-hash")).toBe(false);
  });
});

describe("session cookie", () => {
  it("round-trips the contact id", () => {
    expect(openSession(sealSession("contact-1"))).toBe("contact-1");
  });

  it("rejects a tampered token (someone else's id with my signature)", () => {
    const token = sealSession("contact-1");
    expect(openSession(token.replace("contact-1", "contact-2"))).toBeNull();
    expect(openSession("garbage")).toBeNull();
    expect(openSession(undefined)).toBeNull();
  });

  it("expires after 30 days", () => {
    const issued = Date.parse("2026-10-01T00:00:00Z");
    const token = sealSession("contact-1", issued);
    expect(openSession(token, issued + 29 * 86_400_000)).toBe("contact-1");
    expect(openSession(token, issued + 31 * 86_400_000)).toBeNull();
  });
});
