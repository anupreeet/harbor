import "server-only";
import { listFacts } from "../crm";
import { queryOne } from "../db";
import { coverageFor, listPlans, matchPlan, planIncludesDoctor, type Plan } from "../plans";
import type { DoctorFact } from "./doctor";
import type { DrugFact } from "./drug";
import type { ToolHandler } from "./types";

// 2026 Medicare Part D annual out-of-pocket cap on covered drugs.
export const PART_D_OOP_CAP = 2100;

// Tavus's model can fire every tool in a turn at once (seen in a live trace: find_plans ran
// before check_drug had saved anything). Plan answers depend on those lookups, so wait for any
// still running on this call. Sibling calls from one turn arrive within milliseconds.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function settleLookups(conversationId: string, graceMs = 400) {
  await sleep(graceMs);
  for (let i = 0; i < 40; i++) {
    const running = await queryOne(
      `SELECT 1 FROM tool_calls WHERE conversation_id = $1 AND status = 'pending' AND name IN ('check_drug', 'lookup_doctor') LIMIT 1`,
      [conversationId],
    );
    if (!running) return;
    await sleep(250);
  }
}

async function learnedSoFar(contactId: string) {
  const [doctors, drugs] = await Promise.all([
    listFacts<DoctorFact>(contactId, "doctor"),
    listFacts<DrugFact>(contactId, "drug"),
  ]);
  const coverage = await coverageFor(drugs.flatMap((d) => d.ingredients.map((i) => i.rxcui)));
  const drugCopay = (plan: Plan, drug: DrugFact) => {
    const lines = drug.ingredients.map((i) => coverage.get(i.rxcui)?.find((c) => c.planId === plan.id));
    return lines.some((l) => !l) ? null : lines.reduce((s, l) => s + l!.monthlyCopay, 0);
  };
  return { doctors, drugs, drugCopay };
}

export const findPlans: ToolHandler = async (args, ctx) => {
  const type = args.plan_type as string | undefined;
  const plans = (await listPlans()).filter((p) => !type || p.planType === type);
  await settleLookups(ctx.conversationId);
  const { doctors, drugs, drugCopay } = await learnedSoFar(ctx.contact.id);

  const rows = plans.map((p) => ({
    plan: p.name,
    carrier: p.carrier,
    type: p.planType,
    monthly_premium: p.premium,
    stars: p.stars,
    max_out_of_pocket: p.moop,
    doctors_included: doctors.filter((d) => planIncludesDoctor(p, d.npi, d.acceptsMedicare)).map((d) => d.name),
    drugs_not_covered: drugs.filter((d) => drugCopay(p, d) === null).map((d) => d.name),
  }));

  return {
    speak: {
      area: ctx.contact.countyName ?? ctx.contact.city,
      checked: { doctors: doctors.map((d) => d.name), drugs: drugs.map((d) => d.name) },
      plans: rows,
      reminder: "Describe trade-offs only. A licensed advisor helps them choose.",
    },
    card: {
      kind: "plans",
      data: {
        area: ctx.contact.countyName ?? ctx.contact.city,
        doctors: doctors.map((d) => d.name),
        drugs: drugs.map((d) => d.name),
        plans: rows.map((r, i) => {
          const p = plans[i];
          return {
            ...r,
            id: p.id,
            summary: p.summary,
            drug_deductible: p.drugDeductible,
            pcp_copay: p.pcpCopay,
            specialist_copay: p.specialistCopay,
            extras: p.extras,
            estimated_yearly: drugs.length ? estimateCost(p, drugs, drugCopay).total : null,
          };
        }),
      },
    },
  };
};

export function estimateCost(plan: Plan, drugs: DrugFact[], drugCopay: (p: Plan, d: DrugFact) => number | null) {
  const premiums = Math.round(plan.premium * 12 * 100) / 100;
  const lines = drugs.map((d) => {
    const monthly = drugCopay(plan, d);
    return { drug: d.name, covered: monthly !== null, per_year: monthly === null ? null : monthly * 12 };
  });
  const copays = lines.reduce((s, l) => s + (l.per_year ?? 0), 0);
  const deductible = lines.some((l) => l.covered && (l.per_year ?? 0) > 0) ? plan.drugDeductible : 0;
  const drugCosts = Math.min(copays + deductible, PART_D_OOP_CAP);
  return { premiums, drugCosts, total: premiums + drugCosts, lines, capped: copays + deductible > PART_D_OOP_CAP };
}

export const estimateAnnualCost: ToolHandler = async (args, ctx) => {
  const plans = await listPlans();
  const plan = matchPlan(plans, args.plan_name as string);
  if (!plan) return { speak: { status: "unknown_plan", heard: args.plan_name, options: plans.map((p) => p.name) } };

  await settleLookups(ctx.conversationId);
  const { drugs, drugCopay } = await learnedSoFar(ctx.contact.id);
  const e = estimateCost(plan, drugs, drugCopay);
  return {
    speak: {
      status: "estimated",
      plan: plan.name,
      premiums_per_year: e.premiums,
      drug_costs_per_year: e.drugCosts,
      estimated_total_per_year: e.total,
      not_covered: e.lines.filter((l) => !l.covered).map((l) => l.drug),
      caveat: `Estimate for premiums and the medications discussed only; excludes doctor visits and other services.${e.capped ? ` Drug costs hit the 2026 Part D cap of $${PART_D_OOP_CAP}.` : ""}`,
    },
    card: { kind: "cost", data: { plan: plan.name, ...e } },
  };
};

export const showPlanDetails: ToolHandler = async (args, ctx) => {
  const plans = await listPlans();
  const plan = matchPlan(plans, args.plan_name as string);
  if (!plan) return { speak: { status: "unknown_plan", heard: args.plan_name, options: plans.map((p) => p.name) } };

  await settleLookups(ctx.conversationId);
  const { doctors, drugs, drugCopay } = await learnedSoFar(ctx.contact.id);
  const doctorRows = doctors.map((d) => ({ name: d.name, included: planIncludesDoctor(plan, d.npi, d.acceptsMedicare) }));
  const drugRows = drugs.map((d) => ({ name: `${d.name}${d.strength ? ` ${d.strength}` : ""}`, monthly: drugCopay(plan, d) }));
  const e = drugs.length ? estimateCost(plan, drugs, drugCopay) : null;

  return {
    speak: {
      status: "shown",
      plan: plan.name,
      insurance_company: plan.carrier,
      monthly_premium: plan.premium,
      max_out_of_pocket: plan.moop,
      extras: plan.extras,
      doctors_included: doctorRows.filter((d) => d.included).map((d) => d.name),
      drugs_not_covered: drugRows.filter((d) => d.monthly === null).map((d) => d.name),
      ...(e ? { estimated_total_per_year: e.total } : {}),
      reminder: "It's on their screen. Summarise in one or two sentences, facts only; a licensed advisor helps them choose.",
    },
    card: {
      kind: "plan_details",
      data: {
        name: plan.name, carrier: plan.carrier, type: plan.planType, premium: plan.premium, drugDeductible: plan.drugDeductible, moop: plan.moop,
        stars: plan.stars, pcpCopay: plan.pcpCopay, specialistCopay: plan.specialistCopay, extras: plan.extras, summary: plan.summary,
        doctors: doctorRows, drugs: drugRows, estimate: e && { premiums: e.premiums, drugCosts: e.drugCosts, total: e.total },
      },
    },
  };
};
