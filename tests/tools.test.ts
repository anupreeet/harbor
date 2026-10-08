import { describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { nextSlots } from "@/lib/calendar";
import { runTool } from "@/lib/tools/run";
import { seedConversation } from "./helpers/db";

const call = (conversationId: string, name: string, args: unknown, channel: "client" | "server" = "client") =>
  runTool({ name, toolCallId: `tc_${crypto.randomUUID()}`, conversationId, rawArgs: JSON.stringify(args), channel });

describe("check_drug", () => {
  it("recognises a mis-heard brand and prices it per plan from the formulary", async () => {
    const { conversationId } = await seedConversation();
    const out = await call(conversationId, "check_drug", { drug_name: "eliquiss" });
    expect(out.status).toBe("success");
    const speak = out.result.speak as { drug: string; strengths_to_ask: string[]; coverage: { plan: string; covered: boolean; tier?: number; monthly_copay?: number }[] };
    expect(speak.drug).toBe("Eliquis");
    expect(speak.strengths_to_ask).toEqual(["2.5 mg", "5 mg"]);
    const hmo = speak.coverage.find((c) => c.plan === "Larkspur Health Advantage HMO")!;
    expect(hmo).toMatchObject({ covered: true, tier: 3, monthly_copay: 47 });
  });

  it("reports drugs a plan excludes", async () => {
    const { conversationId } = await seedConversation();
    const out = await call(conversationId, "check_drug", { drug_name: "xarelto", strength: "20 mg" });
    const speak = out.result.speak as { strength: string; coverage: { plan: string; covered: boolean }[] };
    expect(speak.strength).toBe("20 mg");
    expect(speak.coverage.find((c) => c.plan === "Larkspur Health Advantage HMO")!.covered).toBe(false);
  });

  it("asks the caller to read the bottle when nothing matches", async () => {
    const { conversationId } = await seedConversation();
    const out = await call(conversationId, "check_drug", { drug_name: "blood thinner" });
    expect(out.result.speak.status).toBe("not_found");
  });
});

describe("lookup_doctor", () => {
  it("asks for a first name when a common surname has many matches", async () => {
    const { conversationId } = await seedConversation();
    const out = await call(conversationId, "lookup_doctor", { last_name: "Patel" });
    expect(out.result.speak.status).toBe("too_many");
  });

  it("verifies one doctor against NPI + CMS and lists which plans include them", async () => {
    const { conversationId } = await seedConversation();
    const out = await call(conversationId, "lookup_doctor", { last_name: "Patel", first_name: "Jasmin" });
    const speak = out.result.speak as { status: string; accepts_medicare: unknown; included_in: string[] };
    expect(speak.status).toBe("found");
    expect(speak.accepts_medicare).toBe(true);
    // Part D-only plan keeps Original Medicare: any doctor who accepts Medicare is included.
    expect(speak.included_in).toContain("Northwind Rx Saver (Part D)");
  });
});

describe("find_plans + estimate_annual_cost", () => {
  it("compares plans using the doctors and drugs learned earlier in the call", async () => {
    const { conversationId } = await seedConversation();
    await call(conversationId, "check_drug", { drug_name: "xarelto" });
    await call(conversationId, "check_drug", { drug_name: "metformin" });
    const plans = await call(conversationId, "find_plans", {});
    const rows = (plans.result.speak as { plans: { plan: string; drugs_not_covered: string[] }[] }).plans;
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.plan === "Larkspur Health Advantage HMO")!.drugs_not_covered).toEqual(["Xarelto"]);

    const cost = await call(conversationId, "estimate_annual_cost", { plan_name: "the PPO" });
    // PPO: $39 x 12 premium + (Xarelto tier 3 $47 + metformin tier 1 $2) x 12 = 468 + 588
    expect(cost.result.speak).toMatchObject({ plan: "Larkspur Health Advantage PPO", premiums_per_year: 468, drug_costs_per_year: 588, estimated_total_per_year: 1056 });
  });
});

describe("runTool guarantees", () => {
  it("replays a duplicate tool_call_id instead of booking twice", async () => {
    const { conversationId, contact } = await seedConversation();
    const [slot] = nextSlots({ timeZone: "America/Chicago", taken: new Set() });
    const input = { name: "book_advisor_call", toolCallId: "tc_dup_1", conversationId, rawArgs: JSON.stringify({ slot_id: slot.slotId }), channel: "server" as const };
    const first = await runTool(input);
    const second = await runTool(input);
    expect(first.result.speak.status).toBe("booked");
    expect(second.replayed).toBe(true);
    const bookings = await query(`SELECT id FROM bookings WHERE contact_id = $1`, [contact.id]);
    expect(bookings).toHaveLength(1);
  });

  it("never hands back another tool's result for a reused tool_call_id", async () => {
    const { conversationId } = await seedConversation();
    const first = await runTool({ name: "find_plans", toolCallId: "tc_reused", conversationId, rawArgs: "{}", channel: "client" });
    const second = await runTool({ name: "check_drug", toolCallId: "tc_reused", conversationId, rawArgs: '{"drug_name":"eliquis"}', channel: "client" });
    expect(first.status).toBe("success");
    expect(second.status).toBe("error");
    expect(second.result.speak).not.toHaveProperty("plans");
  });

  it("refuses write tools from the browser (only Tavus, signed, may book)", async () => {
    const { conversationId, contact } = await seedConversation();
    const out = await call(conversationId, "book_advisor_call", { slot_id: "2030-01-01T15:00:00.000Z" }, "client");
    expect(out.status).toBe("error");
    expect(await query(`SELECT 1 FROM bookings WHERE contact_id = $1`, [contact.id])).toHaveLength(0);
  });

  it("writes nothing for a conversation this server never created", async () => {
    const out = await call("c_unknown", "check_drug", { drug_name: "eliquis" });
    expect(out.status).toBe("error");
    expect(await query(`SELECT 1 FROM tool_calls WHERE conversation_id = 'c_unknown'`)).toHaveLength(0);
  });

  it("turns bad arguments into something the rep can say", async () => {
    const { conversationId } = await seedConversation();
    const out = await runTool({ name: "check_drug", toolCallId: "tc_bad", conversationId, rawArgs: "{not json", channel: "client" });
    expect(out.status).toBe("error");
    expect(out.result.speak.say).toMatch(/repeat/);
  });
});

describe("tools after the call", () => {
  it("stop working once the conversation has ended", async () => {
    const { conversationId } = await seedConversation();
    await query(`UPDATE conversations SET status = 'ended' WHERE id = $1`, [conversationId]);
    const out = await call(conversationId, "check_drug", { drug_name: "eliquis" });
    expect(out.status).toBe("error");
  });
});

describe("show_plan_details", () => {
  it("opens one plan with the caller's doctors and drugs checked against it", async () => {
    const { conversationId } = await seedConversation();
    await call(conversationId, "check_drug", { drug_name: "xarelto" });
    const out = await call(conversationId, "show_plan_details", { plan_name: "the HMO" });
    expect(out.result.speak).toMatchObject({ status: "shown", plan: "Larkspur Health Advantage HMO", drugs_not_covered: ["Xarelto"] });
    expect(out.result.card).toMatchObject({ kind: "plan_details", data: { name: "Larkspur Health Advantage HMO", drugs: [{ name: "Xarelto", monthly: null }] } });
  });

  it("asks which plan when the name doesn't match", async () => {
    const { conversationId } = await seedConversation();
    const out = await call(conversationId, "show_plan_details", { plan_name: "the gold plan" });
    expect(out.result.speak.status).toBe("unknown_plan");
  });
});

describe("tools fired in parallel (seen in a live trace)", () => {
  it("plan tools wait for drug lookups from the same turn instead of answering without them", async () => {
    const { conversationId } = await seedConversation();
    const [, plans] = await Promise.all([
      call(conversationId, "check_drug", { drug_name: "xarelto" }),
      call(conversationId, "find_plans", {}),
    ]);
    const speak = plans.result.speak as { checked: { drugs: string[] } };
    expect(speak.checked.drugs).toEqual(["Xarelto"]);
  });
});
