import "server-only";
import { recordFact } from "../crm";
import { resolveDrug } from "../integrations/rxnorm";
import { coverageFor, listPlans } from "../plans";
import type { ToolHandler } from "./types";

export type DrugFact = {
  key: string;
  name: string;
  ingredients: { rxcui: string; name: string }[];
  strength: string | null;
};

export const checkDrug: ToolHandler = async (args, ctx) => {
  const drug = await resolveDrug(args.drug_name as string);
  if (!drug) return { speak: { status: "not_found", heard: args.drug_name, ask: "Ask them to read the name on the bottle, or hold the bottle up to the camera, or share their prescription list on screen." } };

  const rxcuis = drug.ingredients.map((i) => i.rxcui);
  const [coverage, plans] = await Promise.all([coverageFor(rxcuis), listPlans()]);

  // A combination drug is covered only if every ingredient is on the plan's formulary.
  const perPlan = plans.map((p) => {
    const lines = rxcuis.map((r) => coverage.get(r)?.find((c) => c.planId === p.id));
    if (lines.some((l) => !l)) return { plan: p.name, covered: false as const };
    return {
      plan: p.name,
      covered: true as const,
      tier: Math.max(...lines.map((l) => l!.tier)),
      monthly_copay: lines.reduce((s, l) => s + l!.monthlyCopay, 0),
      prior_auth: lines.some((l) => l!.priorAuth),
    };
  });

  const strength = (args.strength as string | undefined) ?? null;
  const fact: DrugFact = { key: rxcuis.join("+"), name: drug.displayName, ingredients: drug.ingredients, strength };
  await recordFact(ctx.contact.id, "drug", fact.key, fact, ctx.conversationId);

  return {
    speak: {
      status: "found",
      drug: drug.displayName,
      generic_name: drug.ingredients.map((i) => i.name).join(" / "),
      ...(strength ? { strength } : drug.strengths.length > 1 ? { strengths_to_ask: drug.strengths } : {}),
      coverage: perPlan,
    },
    card: {
      kind: "drug",
      data: { name: drug.displayName, heardAs: drug.heardAs, ingredients: drug.ingredients, strength, strengths: drug.strengths, coverage: perPlan },
    },
  };
};
