import { describe, expect, it } from "vitest";
import { callReducer, initialCallState, type CallState } from "@/lib/call/session";
import type { DoctorCard, DrugCard } from "@/lib/tools/cards";

const drug = (strength: string | null): DrugCard => ({
  kind: "drug",
  data: { name: "Eliquis", heardAs: "eliquiss", ingredients: [{ rxcui: "1364430", name: "apixaban" }], strength, strengths: ["2.5 mg", "5 mg"], coverage: [] },
});
const doctor: DoctorCard = {
  kind: "doctor",
  data: { npi: "1", name: "Jasmin Patel", specialty: null, city: "Chicago", practiceName: null, acceptsMedicare: true, included: [], plans: [] },
};

const run = (...actions: Parameters<typeof callReducer>[1][]): CallState => actions.reduce(callReducer, initialCallState);

describe("call screen state", () => {
  it("dedupes repeated utterances (Tavus sends PAL turns twice)", () => {
    const s = run(
      { type: "line", id: "inf1-pal", role: "pal", text: "Hello" },
      { type: "line", id: "inf1-pal", role: "pal", text: "Hello" },
    );
    expect(s.lines).toHaveLength(1);
  });

  it("shows a typed message once, even if Tavus echoes it back as speech", () => {
    const s = run(
      { type: "line", id: "typed-1", role: "user", text: "Eliquis", typed: true },
      { type: "line", id: "inf2-user", role: "user", text: "Eliquis" },
    );
    expect(s.lines).toHaveLength(1);
  });

  it("turns a tool call into one activity row: working, then what was found", () => {
    const started = run({ type: "tool_started", toolCallId: "a", name: "check_drug", args: { drug_name: "eliquiss" } });
    expect(started.activity[0]).toMatchObject({ done: false, label: "Checking eliquiss in the national drug database" });
    const done = callReducer(started, { type: "tool_finished", toolCallId: "a", name: "check_drug", card: drug("5 mg") });
    expect(done.activity).toHaveLength(1);
    expect(done.activity[0]).toMatchObject({ done: true, summary: "Eliquis 5 mg: covered by 0 of 0 plans" });
  });

  it("updates a drug in the file in place instead of stacking duplicates", () => {
    const s = run(
      { type: "tool_finished", toolCallId: "a", name: "check_drug", card: drug(null) },
      { type: "tool_finished", toolCallId: "b", name: "check_drug", card: drug("5 mg") },
    );
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: "drug", data: { strength: "5 mg" } });
  });

  it("replaces the 'which one?' list once a doctor is verified, and the open times once booked", () => {
    const s = run(
      { type: "tool_finished", name: "lookup_doctor", card: { kind: "doctor_options", data: [] } },
      { type: "tool_finished", name: "get_advisor_availability", card: { kind: "availability", data: [] } },
      { type: "tool_finished", name: "lookup_doctor", card: doctor },
      { type: "tool_finished", name: "book_advisor_call", card: { kind: "booking", data: { when: "Thursday", advisor: "Maria Lopez" } } },
    );
    expect(s.items.map((i) => i.kind)).toEqual(["booking", "doctor"]);
  });

  it("closes a server-side tool's row by name (no tool_call_id comes back to the browser)", () => {
    const s = run(
      { type: "tool_started", toolCallId: "x", name: "book_advisor_call", args: {} },
      { type: "tool_finished", name: "book_advisor_call", card: { kind: "booking", data: { when: "Thursday", advisor: "Maria Lopez" } } },
    );
    expect(s.activity).toHaveLength(1);
    expect(s.activity[0].done).toBe(true);
  });
});
