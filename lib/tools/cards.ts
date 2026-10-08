// The typed contract between tool results and the cards the browser renders. A tool's
// `card` must be one of these; FileCards.tsx renders each kind.

import type { Slot } from "../calendar";

export type DrugCoverage =
  | { plan: string; covered: false }
  | { plan: string; covered: true; tier: number; monthly_copay: number; prior_auth: boolean };

export type DoctorCard = {
  kind: "doctor";
  data: {
    npi: string;
    name: string;
    specialty: string | null;
    city: string;
    practiceName: string | null;
    acceptsMedicare: boolean | null;
    included: string[];
    plans: string[];
  };
};
export type DoctorOptionsCard = { kind: "doctor_options"; data: { name: string; specialty: string | null; city: string }[] };
export type DrugCard = {
  kind: "drug";
  data: {
    name: string;
    heardAs: string;
    ingredients: { rxcui: string; name: string }[];
    strength: string | null;
    strengths: string[];
    coverage: DrugCoverage[];
  };
};
export type PlanRow = {
  id: string;
  plan: string;
  carrier: string;
  type: string;
  monthly_premium: number;
  stars: number;
  max_out_of_pocket: number | null;
  doctors_included: string[];
  drugs_not_covered: string[];
  summary: string;
  drug_deductible: number;
  pcp_copay: number | null;
  specialist_copay: number | null;
  extras: string;
  estimated_yearly: number | null; // premiums + the caller's drugs; null until a drug is known
};
export type PlansCard = { kind: "plans"; data: { area: string | null; doctors: string[]; drugs: string[]; plans: PlanRow[] } };
export type CostCard = {
  kind: "cost";
  data: {
    plan: string;
    premiums: number;
    drugCosts: number;
    total: number;
    capped: boolean;
    lines: { drug: string; covered: boolean; per_year: number | null }[];
  };
};
export type AvailabilityCard = { kind: "availability"; data: Slot[] };
export type BookingCard = { kind: "booking"; data: { bookingId?: string; when: string | null; advisor: string } };
export type PreferenceCard = { kind: "preference"; data: { preference: string } };
export type PlanDetailsCard = {
  kind: "plan_details";
  data: {
    name: string;
    carrier: string;
    type: string;
    premium: number;
    drugDeductible: number;
    moop: number | null;
    stars: number;
    pcpCopay: number | null;
    specialistCopay: number | null;
    extras: string;
    summary: string;
    doctors: { name: string; included: boolean }[];
    drugs: { name: string; monthly: number | null }[];
    estimate: { premiums: number; drugCosts: number; total: number } | null;
  };
};

export type Card =
  | DoctorCard
  | DoctorOptionsCard
  | DrugCard
  | PlansCard
  | CostCard
  | AvailabilityCard
  | BookingCard
  | PreferenceCard
  | PlanDetailsCard;
