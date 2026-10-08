import { describe, expect, it } from "vitest";
import { scoreTurn, summarize } from "@/lib/evals";

describe("eval scoring", () => {
  it("passes when the expected tools are called with the expected arguments, in any order", () => {
    const checks = scoreTurn(
      { say: "", expect_tools: ["check_drug", "lookup_doctor"], expect_args: { lookup_doctor: { first_name: "Jasmin" } } },
      { reply: "", ms: 1000, tools: [{ name: "lookup_doctor", args: { last_name: "Patel", first_name: "Jasmin" } }, { name: "check_drug", args: { drug_name: "Eliquis" } }] },
    );
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("fails the name-in-the-wrong-field bug from the live trace", () => {
    const checks = scoreTurn(
      { say: "", expect_tools: ["lookup_doctor"], expect_args: { lookup_doctor: { first_name: "Jasmin" } } },
      { reply: "", ms: 1000, tools: [{ name: "lookup_doctor", args: { last_name: "Patel", specialty_hint: "Jasmin Patel" } }] },
    );
    expect(checks.find((c) => c.label.includes("first_name"))?.ok).toBe(false);
  });

  it("requires repeated tools as many times as listed, and no tool when [] is expected", () => {
    expect(scoreTurn({ say: "", expect_tools: ["check_drug", "check_drug"] }, { reply: "", ms: 0, tools: [{ name: "check_drug", args: {} }] }).some((c) => !c.ok)).toBe(true);
    expect(scoreTurn({ say: "", expect_tools: [] }, { reply: "", ms: 0, tools: [{ name: "find_plans", args: {} }] })[0].ok).toBe(false);
  });

  it("checks what Anna must and must never say, case-insensitively", () => {
    const checks = scoreTurn(
      { say: "", say_any: ["licensed advisor"], say_none: ["I recommend"] },
      { reply: "A Licensed Advisor can help you choose. I recommend nothing.", ms: 0, tools: [] },
    );
    expect(checks.map((c) => c.ok)).toEqual([true, false, true]); // the last is "No guardrail fired"
  });

  it("fails any turn where a Tavus guardrail fired", () => {
    const checks = scoreTurn({ say: "" }, { reply: "", ms: 0, tools: [], flags: ['guardrail_triggered: {"guardrail":"no_plan_recommendation"}'] });
    expect(checks.find((c) => c.label === "No guardrail fired")).toMatchObject({ ok: false });
  });

  it("summarizes pass rate and tool accuracy", () => {
    const s = summarize([
      { name: "a", turns: [{ spec: { say: "" }, seen: { reply: "", tools: [], ms: 2000 }, checks: [{ label: "Calls check_drug", ok: true }] }] },
      { name: "b", turns: [{ spec: { say: "" }, seen: { reply: "", tools: [], ms: 4000 }, checks: [{ label: "Calls find_plans", ok: false }] }] },
    ]);
    expect(s).toMatchObject({ cases: 2, passed: 1, toolAccuracy: 0.5, avgTurnSeconds: 3 });
  });
});
