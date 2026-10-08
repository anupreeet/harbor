import "server-only";
import { recordFact } from "../crm";
import { medicareEnrollment, type MedicareEnrollment } from "../integrations/cmsClinicians";
import { searchClinicians, type Clinician } from "../integrations/npi";
import { listPlans, planIncludesDoctor } from "../plans";
import type { ToolHandler } from "./types";

export type DoctorFact = {
  npi: string;
  name: string;
  specialty: string | null;
  city: string;
  practiceName: string | null;
  acceptsMedicare: boolean | null;
};

// Clinicians a Medicare caller most likely means by "my doctor" sort first.
const CREDENTIAL_RANK = ["MD", "DO", "NP", "PA"];

export function rankClinicians(list: Clinician[], hint?: string): Clinician[] {
  const seen = new Set<string>();
  const unique = list.filter((c) => !seen.has(c.npi) && seen.add(c.npi));
  const stem = hint?.toLowerCase().replace(/(ologist|ology|ist|ian)$/, "").slice(0, 5);
  const filtered = stem
    ? unique.filter((c) => c.specialty?.toLowerCase().includes(stem))
    : unique;
  const pool = filtered.length ? filtered : unique;
  const score = (c: Clinician) => {
    const i = CREDENTIAL_RANK.findIndex((r) => c.credential?.toUpperCase().includes(r));
    return i === -1 ? CREDENTIAL_RANK.length : i;
  };
  return [...pool].sort((a, b) => score(a) - score(b));
}

// The registry matches prefixes ("Jasmin" -> Jasmina) and alternate/maiden surnames, so
// exact matches win when there are any; the fuzzy results are a fallback for mishearings.
export function preferExactNames(list: Clinician[], lastName: string, firstName?: string): Clinician[] {
  const eq = (a: string, b: string) => a.toLowerCase() === b.trim().toLowerCase();
  const byLast = list.filter((c) => eq(c.lastName, lastName));
  const pool = byLast.length ? byLast : list;
  if (!firstName) return pool;
  const byFirst = pool.filter((c) => eq(c.firstName, firstName));
  return byFirst.length ? byFirst : pool;
}

const displayName = (c: Clinician) =>
  `${["MD", "DO"].some((r) => c.credential?.includes(r)) ? "Dr. " : ""}${c.firstName} ${c.lastName}`.trim();

export const lookupDoctor: ToolHandler = async (args, ctx) => {
  const lastName = args.last_name as string;
  let firstName = (args.first_name as string | undefined) || undefined; // required in the schema, "" when not said
  let hint = args.specialty_hint as string | undefined;
  // Models sometimes put "Jasmin Patel" in specialty_hint (seen in a live trace): recover the first name.
  if (hint && hint.toLowerCase().includes(lastName.toLowerCase())) {
    firstName ??= hint.replace(new RegExp(lastName, "i"), "").replace(/\bdr\.?\s*/i, "").trim() || undefined;
    hint = undefined;
  }
  const { state, city } = ctx.contact;
  if (!state) return { speak: { status: "error", say: "I don't have the caller's location; ask for their ZIP code." } };

  let search = await searchClinicians({ lastName, firstName, state, city: city ?? undefined });
  if (search.clinicians.length === 0 && city) search = await searchClinicians({ lastName, firstName, state });
  const ranked = rankClinicians(preferExactNames(search.clinicians, lastName, firstName), hint);

  if (ranked.length === 0) {
    return { speak: { status: "none", searched: `${firstName ?? ""} ${lastName} in ${state}`.trim() } };
  }
  if ((ranked.length > 3 || search.saturated) && !firstName && !hint) {
    return { speak: { status: "too_many", ask_for: "the doctor's first name" } };
  }
  if (ranked.length > 1 && !hint) {
    const options = ranked.slice(0, 3).map((c) => ({ name: displayName(c), specialty: c.specialty, city: c.city }));
    return {
      speak: { status: "multiple", options, ask: "Which one do you see?" },
      card: { kind: "doctor_options", data: options },
    };
  }

  const doctor = ranked[0];
  const [enrollment, plans] = await Promise.all([
    medicareEnrollment(doctor.npi).catch((): MedicareEnrollment | null => null),
    listPlans(),
  ]);
  const accepts = enrollment?.acceptsAssignment ?? null;
  const included = plans.filter((p) => planIncludesDoctor(p, doctor.npi, accepts));

  const fact: DoctorFact = {
    npi: doctor.npi,
    name: displayName(doctor),
    specialty: doctor.specialty,
    city: doctor.city,
    practiceName: enrollment?.practiceName ?? null,
    acceptsMedicare: accepts,
  };
  await recordFact(ctx.contact.id, "doctor", doctor.npi, fact, ctx.conversationId);

  // The only match may be elsewhere in the state (the search widens when the city has none) or
  // not someone you'd see as a doctor (seen live: a pharmacist). Anna confirms before relying on it.
  const elsewhere = !!city && doctor.city.toLowerCase() !== city.toLowerCase();
  const notADoctor = /pharmac|technician|counselor|dietitian|social work|optician/i.test(doctor.specialty ?? "");
  const confirm = elsewhere || notADoctor ? `Ask before going on: "Is that ${fact.name}, the ${fact.specialty ?? "clinician"} in ${doctor.city}?"` : undefined;

  return {
    speak: {
      status: "found",
      ...(confirm ? { confirm } : {}),
      doctor: fact.name,
      specialty: fact.specialty,
      practice: fact.practiceName,
      accepts_medicare: accepts === null ? "could not verify right now" : accepts,
      included_in: included.map((p) => p.name),
      not_included_in: plans.filter((p) => !included.includes(p)).map((p) => p.name),
    },
    card: {
      kind: "doctor",
      data: { ...fact, included: included.map((p) => p.name), plans: plans.map((p) => p.name) },
    },
  };
};
