import { describe, expect, it } from "vitest";
import { parseScript, toolsPerStep } from "@/components/call/TestScript";
import type { Activity } from "@/lib/call/session";

describe("pasted test scripts", () => {
  it("splits lines and reads the expected tool after ->", () => {
    expect(parseScript("I take Eliquis -> check_drug\n\n  Which plan should I pick? -> none \nHello")).toEqual([
      { text: "I take Eliquis", expect: "check_drug" },
      { text: "Which plan should I pick?", expect: "none" },
      { text: "Hello", expect: undefined },
    ]);
  });

  it("credits each tool call to the line that was sent before it", () => {
    const a = (name: string, at: number): Activity => ({ id: name + at, name, label: "", args: {}, done: true, at });
    const got = toolsPerStep({ steps: [{ text: "1" }, { text: "2" }], sentAt: [100, 200] }, [a("check_drug", 150), a("lookup_doctor", 250), a("find_plans", 50)]);
    expect(got).toEqual([["check_drug"], ["lookup_doctor"]]);
  });
});
