import { fetchJson, UpstreamError } from "./http";

// ZIP -> city/state/county using two free, keyless public APIs:
// Zippopotam (ZIP -> place + lat/lon) and the FCC Area API (lat/lon -> county FIPS).

export type Place = {
  zip: string;
  city: string;
  state: string; // two-letter
  countyName: string | null;
  countyFips: string | null;
  timeZone: string;
};

type ZippopotamResponse = {
  places: { "place name": string; "state abbreviation": string; latitude: string; longitude: string }[];
};
type FccResponse = { results: { county_name: string; county_fips: string }[] };

export async function resolveZip(zip: string): Promise<Place> {
  if (!/^\d{5}$/.test(zip)) throw new UpstreamError("zippopotam", "invalid ZIP");
  const z = await fetchJson<ZippopotamResponse>("zippopotam", `https://api.zippopotam.us/us/${zip}`);
  const place = z.places?.[0];
  if (!place) throw new UpstreamError("zippopotam", "unknown ZIP");
  const state = place["state abbreviation"];

  let countyName: string | null = null;
  let countyFips: string | null = null;
  try {
    const f = await fetchJson<FccResponse>(
      "fcc",
      `https://geo.fcc.gov/api/census/area?lat=${place.latitude}&lon=${place.longitude}&format=json`,
    );
    countyName = f.results?.[0]?.county_name ?? null;
    countyFips = f.results?.[0]?.county_fips ?? null;
  } catch {
    // County is nice-to-have for the conversation; city/state are enough to continue.
  }
  return { zip, city: place["place name"], state, countyName, countyFips, timeZone: timeZoneForState(state) };
}

const ZONES: Record<string, string[]> = {
  "America/New_York": ["CT", "DC", "DE", "FL", "GA", "IN", "MA", "MD", "ME", "MI", "NC", "NH", "NJ", "NY", "OH", "PA", "RI", "SC", "VA", "VT", "WV", "KY"],
  "America/Chicago": ["AL", "AR", "IA", "IL", "KS", "LA", "MN", "MO", "MS", "ND", "NE", "OK", "SD", "TN", "TX", "WI"],
  "America/Denver": ["CO", "MT", "NM", "UT", "WY", "ID"],
  "America/Phoenix": ["AZ"],
  "America/Los_Angeles": ["CA", "NV", "OR", "WA"],
  "America/Anchorage": ["AK"],
  "Pacific/Honolulu": ["HI"],
};

// State-level approximation; good enough to offer advisor slots in the visitor's local time.
export function timeZoneForState(state: string): string {
  for (const [zone, states] of Object.entries(ZONES)) if (states.includes(state)) return zone;
  return "America/Chicago";
}
