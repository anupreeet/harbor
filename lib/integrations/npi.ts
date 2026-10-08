import { fetchJson } from "./http";

// NPPES NPI Registry (CMS) — the national directory of US clinicians. Free, no key.
// https://npiregistry.cms.hhs.gov/api-page

export type Clinician = {
  npi: string;
  firstName: string;
  lastName: string;
  credential: string | null;
  specialty: string | null;
  city: string;
  state: string;
  zip: string;
};

type NpiResponse = {
  result_count?: number;
  results?: {
    number: number | string;
    basic: { first_name?: string; last_name?: string; credential?: string };
    taxonomies?: { desc: string; primary: boolean }[];
    addresses?: { address_purpose: string; city: string; state: string; postal_code: string }[];
  }[];
};

export async function searchClinicians(args: {
  lastName: string;
  firstName?: string;
  state: string;
  city?: string;
  limit?: number;
}): Promise<{ clinicians: Clinician[]; saturated: boolean }> {
  const limit = args.limit ?? 20;
  const params = new URLSearchParams({
    version: "2.1",
    last_name: args.lastName,
    state: args.state,
    enumeration_type: "NPI-1", // individuals, not organisations
    limit: String(limit),
  });
  if (args.firstName) params.set("first_name", args.firstName);
  if (args.city) params.set("city", args.city);

  const data = await fetchJson<NpiResponse>("npi", `https://npiregistry.cms.hhs.gov/api/?${params}`);
  const clinicians = (data.results ?? []).map(toClinician);
  // A full page means the registry has more matches than it returned.
  return { clinicians, saturated: clinicians.length >= limit };
}

export function toClinician(r: NonNullable<NpiResponse["results"]>[number]): Clinician {
  const loc =
    r.addresses?.find((a) => a.address_purpose === "LOCATION") ?? r.addresses?.[0];
  const primary = r.taxonomies?.find((t) => t.primary) ?? r.taxonomies?.[0];
  return {
    npi: String(r.number),
    firstName: titleCase(r.basic.first_name ?? ""),
    lastName: titleCase(r.basic.last_name ?? ""),
    credential: r.basic.credential?.replace(/\./g, "") || null,
    specialty: primary?.desc ?? null,
    city: titleCase(loc?.city ?? ""),
    state: loc?.state ?? "",
    zip: (loc?.postal_code ?? "").slice(0, 5),
  };
}

// Registry data is all caps; keep business suffixes and numerals upper-case ("Clarity Clinic LLC").
const KEEP_UPPER = new Set(["llc", "pllc", "pc", "sc", "md", "do", "pa", "np", "ltd", "usa", "ii", "iii", "iv"]);

export const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b[a-z]+\b/g, (w) => (KEEP_UPPER.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
