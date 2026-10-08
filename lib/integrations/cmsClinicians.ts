import { fetchJson, UpstreamError } from "./http";
import { titleCase } from "./npi";

// CMS "Doctors and Clinicians" national file (provider-data.cms.gov, dataset mj5m-pzi6).
// Tells us whether a clinician is enrolled in Medicare and accepts assignment
// (Medicare's approved amount as payment in full). Free, no key.
//
// We use the datastore SQL endpoint: measured 0.7–3 s per NPI, versus 8–13 s for the
// `query` endpoint with conditions — the difference between a pause and dead air on a call.

export type MedicareEnrollment = {
  npi: string;
  enrolled: boolean;
  acceptsAssignment: boolean | null;
  practiceName: string | null;
  telehealth: boolean | null;
};

// The dataset's current distribution. If CMS republishes under a new id, look it up at
// https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/mj5m-pzi6
const DISTRIBUTION = "288f7073-7fc6-5f3b-aa25-44902d5d1f8f";

type SqlRow = Record<string, string | undefined>;

export async function medicareEnrollment(npi: string, timeoutMs = 4000): Promise<MedicareEnrollment> {
  if (!/^\d{10}$/.test(npi)) throw new UpstreamError("cms", "invalid NPI");
  const sql = `[SELECT npi,ind_assgn,facility_name,telehlth FROM ${DISTRIBUTION}][WHERE npi = "${npi}"][LIMIT 1]`;
  const rows = await fetchJson<SqlRow[]>(
    "cms",
    `https://data.cms.gov/provider-data/api/1/datastore/sql?query=${encodeURIComponent(sql)}`,
    { timeoutMs },
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return { npi, enrolled: false, acceptsAssignment: null, practiceName: null, telehealth: null };
  // The SQL endpoint returns some columns under their display labels ("Facility Name").
  const pick = (...keys: string[]) => keys.map((k) => row[k]).find((v) => v !== undefined && v !== "");
  const assign = pick("ind_assgn", "Ind_assgn");
  const facility = pick("facility_name", "Facility Name");
  const tele = pick("telehlth", "Telehlth");
  return {
    npi,
    enrolled: true,
    acceptsAssignment: assign ? assign === "Y" : null,
    practiceName: facility ? titleCase(facility) : null,
    telehealth: tele ? tele === "Y" : null,
  };
}
