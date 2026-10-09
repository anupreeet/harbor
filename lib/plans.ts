import "server-only";
import { query } from "./db";

export type Plan = {
  id: string;
  name: string;
  carrier: string;
  planType: string;
  premium: number;
  drugDeductible: number;
  moop: number | null;
  stars: number;
  pcpCopay: number | null;
  specialistCopay: number | null;
  networkBreadth: number | null;
  extras: string;
  summary: string;
};

type PlanRow = {
  id: string; name: string; carrier: string; plan_type: string; monthly_premium_cents: number; drug_deductible_cents: number;
  moop_cents: number | null; star_rating: number; pcp_copay_cents: number | null; specialist_copay_cents: number | null;
  network_breadth: number | null; extras: string; summary: string;
};

const dollars = (c: number | null) => (c === null ? null : c / 100);

export async function listPlans(): Promise<Plan[]> {
  const rows = await query<PlanRow>(`SELECT * FROM plans ORDER BY sort_order`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    carrier: r.carrier,
    planType: r.plan_type,
    premium: r.monthly_premium_cents / 100,
    drugDeductible: r.drug_deductible_cents / 100,
    moop: dollars(r.moop_cents),
    stars: Number(r.star_rating),
    pcpCopay: dollars(r.pcp_copay_cents),
    specialistCopay: dollars(r.specialist_copay_cents),
    networkBreadth: r.network_breadth,
    extras: r.extras,
    summary: r.summary,
  }));
}

export type Coverage = { planId: string; tier: number; monthlyCopay: number; priorAuth: boolean };

export async function coverageFor(ingredientRxcuis: string[]): Promise<Map<string, Coverage[]>> {
  const byRxcui = new Map<string, Coverage[]>();
  if (ingredientRxcuis.length === 0) return byRxcui;
  const rows = await query<{ plan_id: string; ingredient_rxcui: string; tier: number; monthly_copay_cents: number; prior_auth: boolean }>(
    `SELECT plan_id, ingredient_rxcui, tier, monthly_copay_cents, prior_auth
       FROM formulary WHERE ingredient_rxcui = ANY($1)`,
    [ingredientRxcuis],
  );
  for (const r of rows) {
    const list = byRxcui.get(r.ingredient_rxcui) ?? [];
    list.push({ planId: r.plan_id, tier: r.tier, monthlyCopay: r.monthly_copay_cents / 100, priorAuth: r.prior_auth });
    byRxcui.set(r.ingredient_rxcui, list);
  }

  // Any real drug gets an answer, like any real doctor. Common ones are hand-set in the formulary;
  // any other ingredient gets a demo tier fixed per drug, priced at each plan's own copay for that
  // tier, and a few plans leave it off. Demo data, never a claim about a real plan's formulary.
  const unlisted = [...new Set(ingredientRxcuis.filter((r) => !byRxcui.has(r)))];
  if (unlisted.length) {
    const tierCopays = await query<{ plan_id: string; tier: number; copay: number | string }>(
      `SELECT plan_id, tier, MIN(monthly_copay_cents) AS copay FROM formulary GROUP BY plan_id, tier`,
    );
    for (const rxcui of unlisted) {
      const tier = demoTier(rxcui);
      byRxcui.set(
        rxcui,
        tierCopays
          .filter((t) => t.tier === tier && fnv1a(`${rxcui}:${t.plan_id}`) % 100 >= 10)
          .map((t) => ({ planId: t.plan_id, tier, monthlyCopay: Number(t.copay) / 100, priorAuth: tier === 4 })),
      );
    }
  }
  return byRxcui;
}

// Mostly generics (tier 1-2), some preferred brands (3), few specialty (4).
export function demoTier(rxcui: string): 1 | 2 | 3 | 4 {
  const h = fnv1a(rxcui) % 100;
  return h < 45 ? 1 : h < 70 ? 2 : h < 92 ? 3 : 4;
}

// Simulated network membership (demo data — never a claim about a real doctor's contracts).
// Deterministic per (doctor, plan) so the same doctor always gets the same answer.
// Part D-only plans keep Original Medicare, where any doctor who accepts Medicare works,
// so for those we use the *real* CMS assignment flag.
export function planIncludesDoctor(plan: Pick<Plan, "id" | "networkBreadth">, npi: string, acceptsMedicare: boolean | null) {
  if (plan.networkBreadth === null) return acceptsMedicare !== false;
  return fnv1a(`${npi}:${plan.id}`) % 100 < plan.networkBreadth;
}

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function matchPlan(plans: Plan[], spoken: string): Plan | null {
  const s = spoken.toLowerCase();
  const exact = plans.find((p) => p.id === s || p.name.toLowerCase() === s);
  if (exact) return exact;
  // "the PPO", "part d", "the HMO-POS", "rx saver" — most specific rule first, because
  // "hmo-pos" also contains "hmo".
  const typeRules: [RegExp, string][] = [
    [/\bpos\b|point.of.service/, "HMO-POS"],
    [/\bppo\b/, "PPO"],
    [/part\s*d|\bpdp\b|drug.only|\brx\b/, "PDP"],
    [/\bhmo\b/, "HMO"],
  ];
  for (const [re, type] of typeRules) {
    if (re.test(s)) return plans.find((p) => p.planType === type) ?? null;
  }
  const words = s.split(/\W+/).filter((w) => w.length > 3);
  return plans.find((p) => words.some((w) => p.name.toLowerCase().includes(w))) ?? null;
}
