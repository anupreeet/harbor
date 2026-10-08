import { fetchJson, UpstreamError } from "./http";

// RxNorm / RxNav (US National Library of Medicine). Free, no key.
// Turns whatever speech-to-text heard ("eliquiss", "metformen") into a canonical drug,
// its active ingredient(s) and the oral strengths a pharmacy actually dispenses.

export type ResolvedDrug = {
  heardAs: string;
  displayName: string; // what the visitor would recognise, e.g. "Eliquis"
  ingredients: { rxcui: string; name: string }[];
  strengths: string[]; // e.g. ["2.5 mg", "5 mg"]
};

type ApproxResponse = { approximateGroup?: { candidate?: { rxcui: string; name?: string; score?: string }[] } };
type PropertiesResponse = { properties?: { rxcui: string; name: string; tty: string } };
type RelatedResponse = {
  relatedGroup?: { conceptGroup?: { tty: string; conceptProperties?: { rxcui: string; name: string }[] }[] };
};

const BASE = "https://rxnav.nlm.nih.gov/REST";

export async function resolveDrug(heardAs: string): Promise<ResolvedDrug | null> {
  const term = heardAs.trim();
  if (!term) throw new UpstreamError("rxnorm", "empty drug name");

  const approx = await fetchJson<ApproxResponse>(
    "rxnorm",
    `${BASE}/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=5`,
  );
  const candidates = approx.approximateGroup?.candidate ?? [];
  const best = candidates.find((c) => c.name) ?? candidates[0];
  if (!best) return null;

  // What kind of concept matched (ingredient, brand, clinical drug…) decides how we read it.
  const [concept, related] = await Promise.all([
    fetchJson<PropertiesResponse>("rxnorm", `${BASE}/rxcui/${best.rxcui}/properties.json`),
    fetchJson<RelatedResponse>("rxnorm", `${BASE}/rxcui/${best.rxcui}/related.json?tty=IN+BN`),
  ]);
  const tty = concept.properties?.tty ?? "";
  const conceptName = concept.properties?.name ?? best.name ?? term;
  const groups = related.relatedGroup?.conceptGroup ?? [];
  const props = (t: string) => groups.find((g) => g.tty === t)?.conceptProperties ?? [];

  const ingredients =
    tty === "IN"
      ? [{ rxcui: best.rxcui, name: conceptName.toLowerCase() }]
      : props("IN").map((p) => ({ rxcui: p.rxcui, name: p.name }));
  if (ingredients.length === 0) return null;

  // Show the brand when that's what the visitor said ("Eliquis"), otherwise the generic name.
  const brand =
    tty === "BN"
      ? { rxcui: best.rxcui, name: conceptName }
      : props("BN").find((b) => isSameWord(term, b.name));
  const saidBrand = !!brand && isSameWord(term, brand.name);
  const displayName = saidBrand ? brand!.name : capitalize(ingredients.map((i) => i.name).join(" / "));

  // Strengths come from the brand's own products when a brand was named — "Ozempic" is an
  // injection, so the oral semaglutide (Rybelsus) strengths must not leak in.
  const strengths =
    ingredients.length !== 1
      ? []
      : saidBrand
        ? await oralStrengths(brand!.rxcui, "SBD")
        : await oralStrengths(ingredients[0].rxcui, "SCD");

  return { heardAs: term, displayName, ingredients, strengths };
}

async function oralStrengths(rxcui: string, tty: "SCD" | "SBD"): Promise<string[]> {
  try {
    const r = await fetchJson<RelatedResponse>(
      "rxnorm",
      `${BASE}/rxcui/${rxcui}/related.json?tty=${tty}`,
      { timeoutMs: 2000 },
    );
    const names = (r.relatedGroup?.conceptGroup ?? []).flatMap((g) => g.conceptProperties ?? []).map((p) => p.name);
    // A brand sold as pens *and* tablets (Ozempic) needs "which form?" first, not a strength list.
    if (tty === "SBD" && names.some((n) => NON_ORAL.test(n))) return [];
    return parseStrengths(names);
  } catch {
    return []; // strengths are a follow-up question, not essential to answer coverage
  }
}

// "apixaban 5 MG Oral Tablet" -> "5 mg"; keeps tablets/capsules, sorted ascending, max 4.
const ORAL_SOLID = /Oral (Tablet|Capsule)/i;
const NON_ORAL = /Inject|Injector|Cartridge|Syringe|Inhal|Transdermal|Topical|Nasal|Ophthalmic/i;

export function parseStrengths(scdNames: string[]): string[] {
  const out = new Set<string>();
  for (const n of scdNames) {
    if (!ORAL_SOLID.test(n) || n.includes("/")) continue;
    const m = n.match(/(\d+(?:\.\d+)?)\s*(MG|MCG|UNT)\b/i);
    if (m) out.add(`${m[1]} ${m[2].toLowerCase()}`);
  }
  return [...out].sort((a, b) => parseFloat(a) - parseFloat(b)).slice(0, 4);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function isSameWord(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const x = norm(a), y = norm(b);
  return x === y || x.startsWith(y) || y.startsWith(x) || levenshtein(x, y) <= 2;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
