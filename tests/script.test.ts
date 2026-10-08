import { describe, expect, it } from "vitest";
import { buildContext, buildGreeting, TPMO_DISCLAIMER } from "@/lib/conversation/script";

// The compliance-critical words live in code, so they're tested like code.
describe("greeting", () => {
  it("speaks the CMS TPMO disclaimer verbatim, early, for new and returning callers", () => {
    for (const returning of [false, true]) {
      const g = buildGreeting({ firstName: "Bob", returning });
      expect(g).toContain(TPMO_DISCLAIMER);
      // Well inside the first minute: under ~90 words at a slow ~150 words/minute pace.
      expect(g.split(/\s+/).length).toBeLessThan(90);
      expect(g).toMatch(/transcribed/);
      expect(g).not.toMatch(/recorded/); // we transcribe; we don't claim to record video
    }
  });

  it("greets returning callers differently", () => {
    expect(buildGreeting({ firstName: "Bob", returning: true })).toMatch(/^Welcome back, Bob!/);
    expect(buildGreeting({ firstName: "Bob", returning: false })).toMatch(/^Hi Bob, I'm Anna, a virtual assistant/);
  });
});

describe("conversational context", () => {
  const base = {
    now: new Date("2026-10-07T15:00:00Z"), timeZone: "America/Chicago", firstName: "Bob",
    city: "Chicago", state: "IL", countyName: "Cook County", topic: null, file: null,
  };

  it("tells Anna the location so she never asks for it, and that the greeting already played", () => {
    const c = buildContext(base);
    expect(c).toContain("Bob in Chicago, IL (Cook County)");
    expect(c).toMatch(/never ask for it/);
    expect(c).toMatch(/already been spoken/);
    expect(c).toContain("Wednesday, October 7, 2026");
  });

  it("starts from the topic picked on the home screen", () => {
    expect(buildContext({ ...base, topic: "drugs" })).toMatch(/prescriptions would cost/);
  });

  it("carries what earlier calls verified, so a returning caller isn't re-asked", () => {
    const c = buildContext({
      ...base,
      file: {
        doctors: [{ npi: "1", name: "Jasmin Patel", specialty: "Internal Medicine", city: "Chicago", practiceName: null, acceptsMedicare: true }],
        drugs: [{ key: "1364430", name: "Eliquis", ingredients: [{ rxcui: "1364430", name: "apixaban" }], strength: "5 mg" }],
        booking: { id: "b1", when: "Thursday, October 8, 10:00 AM CDT", advisor: "Maria Lopez" },
        preferences: ["Call me Bobby"],
      },
    });
    expect(c).toMatch(/talked with Harbor before/);
    expect(c).toContain("Jasmin Patel, Internal Medicine");
    expect(c).toContain("Eliquis 5 mg");
    expect(c).toContain("Maria Lopez");
    expect(c).toContain("Call me Bobby");
    expect(buildContext(base)).not.toMatch(/talked with Harbor before/);
  });
});
