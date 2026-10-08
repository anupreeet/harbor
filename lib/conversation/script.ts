// Builds what Tavus receives per conversation. Pure functions so the compliance-critical
// wording is unit-tested (tests/script.test.ts).

import type { CoverageFile } from "../crm";

export const ADVISOR_NAME = "Anna";
export const BROKERAGE = "Harbor Medicare Advisors";

// CMS-required third-party marketing organization (TPMO) disclaimer, verbatim. It must be
// spoken within the first minute of a sales call, so it lives in `custom_greeting`, which
// Tavus speaks word-for-word and doesn't let the caller interrupt — not in the prompt.
export const TPMO_DISCLAIMER =
  "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer in your area. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.";

export function buildGreeting(opts: { firstName: string; returning: boolean }): string {
  const hello = opts.returning
    ? `Welcome back, ${opts.firstName}! It's ${ADVISOR_NAME} from ${BROKERAGE}.`
    : `Hi ${opts.firstName}, I'm ${ADVISOR_NAME}, a virtual assistant with ${BROKERAGE}.`;
  return `${hello} One quick note before we start: ${TPMO_DISCLAIMER} This conversation is transcribed for quality and compliance. Is that okay with you?`;
}

// The suggestions on the home screen. The caller's pick becomes the call's opening topic.
export const TOPICS = {
  doctor: "Check whether their doctor is covered",
  drugs: "Find out what their prescriptions would cost",
  compare: "Compare the plans available where they live",
  advisor: "Book a call with a licensed advisor",
} as const;
export type Topic = keyof typeof TOPICS;

export function buildContext(opts: {
  now: Date;
  timeZone: string;
  firstName: string;
  city: string | null;
  state: string | null;
  countyName: string | null;
  topic: Topic | null;
  file: CoverageFile | null; // what earlier calls verified; null on a first call
}): string {
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: opts.timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(opts.now);
  const where = [opts.city, opts.state].filter(Boolean).join(", ");

  const lines = [
    `It is ${today} for the caller.`,
    `The caller is ${opts.firstName}${where ? ` in ${where}` : ""}${opts.countyName ? ` (${opts.countyName})` : ""}. Their location is already on file; never ask for it.`,
    `Your greeting, the required disclaimer and the transcription notice have already been spoken. Do not repeat them or introduce yourself again; wait for their answer about the transcription, then continue.`,
  ];
  if (opts.topic) lines.push(`They started this call to: ${TOPICS[opts.topic]}. Begin there once they've agreed to continue.`);

  // Memory is the CRM itself: what earlier calls verified, so Anna picks up instead of re-asking.
  const f = opts.file;
  if (f && (f.doctors.length || f.drugs.length || f.booking || f.preferences.length)) {
    lines.push(`${opts.firstName} has talked with Harbor before. From earlier calls (already verified; don't look these up again unless they ask):`);
    if (f.doctors.length) lines.push(`- Doctors: ${f.doctors.map((d) => `${d.name}${d.specialty ? `, ${d.specialty}` : ""}`).join("; ")}`);
    if (f.drugs.length) lines.push(`- Medications: ${f.drugs.map((d) => `${d.name}${d.strength ? ` ${d.strength}` : ""}`).join("; ")}`);
    if (f.booking) lines.push(`- Booked: a call with ${f.booking.advisor}, ${f.booking.when}`);
    if (f.preferences.length) lines.push(`- They asked you to remember: ${f.preferences.join("; ")}`);
    lines.push(`Ask what's changed since last time rather than starting over.`);
  }
  return lines.join("\n");
}
