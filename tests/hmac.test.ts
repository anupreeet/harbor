import { describe, expect, it } from "vitest";
import { sign, verifySignature } from "@/lib/tavus/hmac";

const body = JSON.stringify({ arguments: '{"slot_id":"2026-10-08T15:00:00.000Z"}', conversation_id: "c1", name: "book_advisor_call", tool_call_id: "call_1" });

describe("Tavus tool-call signatures", () => {
  it("accepts the exact signed bytes", () => {
    expect(verifySignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, or a missing signature", () => {
    const sig = sign(body, "s3cret");
    expect(verifySignature(body.replace("call_1", "call_2"), sig, "s3cret")).toBe(false);
    expect(verifySignature(body, sig, "other")).toBe(false);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
  });

  it("refuses everything when no secret is configured (unsigned writes would be open to anyone)", () => {
    expect(verifySignature(body, sign(body, ""), undefined)).toBe(false);
  });

  it("is sensitive to re-serialisation, which is why the route verifies raw text", () => {
    const reserialised = JSON.stringify(JSON.parse(body), null, 1);
    expect(verifySignature(reserialised, sign(body, "s3cret"), "s3cret")).toBe(false);
  });
});
