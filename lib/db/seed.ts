// Demo catalog for the fictional broker "Harbor Medicare Advisors". Like a real broker, Harbor
// sells plans run by insurance companies (carriers), which are fictional here too. Plans, prices,
// tiers and networks are made up and labelled as demo data in the UI. Ingredient ids are real RxNorm RXCUIs so the
// live RxNorm lookup joins onto this table.

export type SeedPlan = {
  id: string;
  name: string;
  carrier: string; // the insurance company that runs the plan
  planType: "HMO" | "PPO" | "HMO-POS" | "PDP";
  premium: number; // dollars / month
  drugDeductible: number;
  moop: number | null;
  stars: number;
  pcpCopay: number | null;
  specialistCopay: number | null;
  networkBreadth: number | null;
  extras: string;
  summary: string;
  tierCopays: [number, number, number, number]; // monthly copay for tiers 1-4
  notCovered: string[]; // ingredient rxcuis excluded from this plan's formulary
};

export const PLANS: SeedPlan[] = [
  {
    id: "harbor-advantage-hmo",
    name: "Larkspur Health Advantage HMO",
    carrier: "Larkspur Health",
    planType: "HMO",
    premium: 0,
    drugDeductible: 0,
    moop: 4900,
    stars: 4,
    pcpCopay: 0,
    specialistCopay: 35,
    networkBreadth: 55,
    extras: "Dental cleanings, $150 quarterly over-the-counter allowance",
    summary: "$0 premium with a narrower local network; referrals needed for specialists.",
    tierCopays: [0, 5, 47, 100],
    notCovered: ["1114195"], // rivaroxaban
  },
  {
    id: "harbor-advantage-ppo",
    name: "Larkspur Health Advantage PPO",
    carrier: "Larkspur Health",
    planType: "PPO",
    premium: 39,
    drugDeductible: 0,
    moop: 6700,
    stars: 4.5,
    pcpCopay: 10,
    specialistCopay: 45,
    networkBreadth: 85,
    extras: "In- and out-of-network coverage, dental and vision",
    summary: "Broad network, no referrals, out-of-network coverage at a higher cost.",
    tierCopays: [2, 10, 47, 110],
    notCovered: [],
  },
  {
    id: "harbor-choice-hmo-pos",
    name: "Cedar Ridge Choice HMO-POS",
    carrier: "Cedar Ridge Care",
    planType: "HMO-POS",
    premium: 19,
    drugDeductible: 0,
    moop: 5500,
    stars: 3.5,
    pcpCopay: 5,
    specialistCopay: 40,
    networkBreadth: 65,
    extras: "Some out-of-network services through point-of-service option",
    summary: "Middle ground: low premium, some flexibility outside the network.",
    tierCopays: [0, 8, 45, 105],
    notCovered: ["1991302"], // semaglutide
  },
  {
    id: "harbor-rx-saver-pdp",
    name: "Northwind Rx Saver (Part D)",
    carrier: "Northwind Rx",
    planType: "PDP",
    premium: 14.5,
    drugDeductible: 615,
    moop: null,
    stars: 4,
    pcpCopay: null,
    specialistCopay: null,
    networkBreadth: null,
    extras: "Drug coverage only; pairs with Original Medicare and a Medigap plan",
    summary: "Keeps Original Medicare: see any doctor who accepts Medicare.",
    tierCopays: [1, 6, 47, 95],
    notCovered: [],
  },
];

export type SeedDrug = { rxcui: string; name: string; tier: 1 | 2 | 3 | 4; priorAuth?: boolean };

// Verified against RxNav /REST/rxcui.json?name=… (2026-10-07).
export const DRUGS: SeedDrug[] = [
  { rxcui: "1364430", name: "apixaban", tier: 3 },
  { rxcui: "1114195", name: "rivaroxaban", tier: 3 },
  { rxcui: "274783", name: "insulin glargine", tier: 3 },
  { rxcui: "593411", name: "sitagliptin", tier: 3 },
  { rxcui: "1545653", name: "empagliflozin", tier: 3 },
  { rxcui: "1991302", name: "semaglutide", tier: 4, priorAuth: true },
  { rxcui: "6809", name: "metformin", tier: 1 },
  { rxcui: "83367", name: "atorvastatin", tier: 1 },
  { rxcui: "301542", name: "rosuvastatin", tier: 1 },
  { rxcui: "29046", name: "lisinopril", tier: 1 },
  { rxcui: "52175", name: "losartan", tier: 1 },
  { rxcui: "17767", name: "amlodipine", tier: 1 },
  { rxcui: "10582", name: "levothyroxine", tier: 1 },
  { rxcui: "32968", name: "clopidogrel", tier: 1 },
  { rxcui: "7646", name: "omeprazole", tier: 2 },
  { rxcui: "25480", name: "gabapentin", tier: 2 },
];

export function seedStatements(): { text: string; params: unknown[] }[] {
  const cents = (d: number) => Math.round(d * 100);
  const out: { text: string; params: unknown[] }[] = [];
  PLANS.forEach((p, i) => {
    out.push({
      text: `INSERT INTO plans (id, name, plan_type, monthly_premium_cents, drug_deductible_cents, moop_cents,
               star_rating, pcp_copay_cents, specialist_copay_cents, network_breadth, extras, summary, sort_order, carrier)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, carrier=EXCLUDED.carrier, plan_type=EXCLUDED.plan_type,
               monthly_premium_cents=EXCLUDED.monthly_premium_cents, drug_deductible_cents=EXCLUDED.drug_deductible_cents,
               moop_cents=EXCLUDED.moop_cents, star_rating=EXCLUDED.star_rating, pcp_copay_cents=EXCLUDED.pcp_copay_cents,
               specialist_copay_cents=EXCLUDED.specialist_copay_cents, network_breadth=EXCLUDED.network_breadth,
               extras=EXCLUDED.extras, summary=EXCLUDED.summary, sort_order=EXCLUDED.sort_order`,
      params: [
        p.id, p.name, p.planType, cents(p.premium), cents(p.drugDeductible),
        p.moop === null ? null : cents(p.moop), p.stars,
        p.pcpCopay === null ? null : cents(p.pcpCopay),
        p.specialistCopay === null ? null : cents(p.specialistCopay),
        p.networkBreadth, p.extras, p.summary, i, p.carrier,
      ],
    });
    out.push({ text: `DELETE FROM formulary WHERE plan_id = $1`, params: [p.id] });
    for (const d of DRUGS) {
      if (p.notCovered.includes(d.rxcui)) continue;
      out.push({
        text: `INSERT INTO formulary (plan_id, ingredient_rxcui, ingredient_name, tier, monthly_copay_cents, prior_auth)
               VALUES ($1,$2,$3,$4,$5,$6)`,
        params: [p.id, d.rxcui, d.name, d.tier, cents(p.tierCopays[d.tier - 1]), d.priorAuth ?? false],
      });
    }
  });
  return out;
}
