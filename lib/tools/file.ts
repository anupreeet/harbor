import "server-only";
import { addNote, cancelBooking, getContact, loadFile, removeFacts, removePreferences, upcomingBooking } from "../crm";
import type { ToolHandler } from "./types";

// The caller's file is everything Anna has verified across calls, and plan comparisons use all
// of it. These tools let the caller see it and take things off when they change.

type What = "doctor" | "drug" | "booking" | "preference";

const STOP = new Set(["dr", "doctor", "my", "the", "a", "mg", "milligram", "milligrams", "mcg", "pill", "pills", "tablet", "tablets", "medication", "medicine"]);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w) && !/^\d/.test(w));

// "Dr. Abrams" matches "Dr. Donald Abrams"; "apixaban 5 mg" matches Eliquis by its ingredient.
export function saidMatches(said: string, names: string[]): boolean {
  const s = words(said);
  return s.length > 0 && names.some((n) => {
    const w = words(n);
    return s.every((x) => w.includes(x));
  });
}

const ALL = /^(all|everything|all of them|every one|both)$/i;

export const removeFromFile: ToolHandler = async (args, ctx) => {
  const what = args.what as What;
  const which = String(args.which ?? "").trim();
  const all = ALL.test(which);
  const id = ctx.contact.id;
  // What was compared or estimated used the old file, so the screen drops those too.
  const stale = ["plans", "plan_details", "cost", "on_file"];

  if (what === "booking") {
    const booking = await upcomingBooking(id);
    if (!booking) return { speak: { status: "nothing_on_file" } };
    await cancelBooking(id, booking.id);
    await addNote(id, `Cancelled advisor call with ${booking.advisor}: ${booking.when} (caller asked Anna).`, ctx.conversationId);
    const name = `Advisor call, ${booking.when}`;
    return {
      speak: { status: "removed", removed: [name], next: "Confirm it's cancelled. Offer to find a new time only if they want one." },
      card: { kind: "removed", data: { what, names: [name], keys: ["booking", "availability"] } },
    };
  }

  if (what === "preference") {
    const prefs = (await getContact(id))?.preferences ?? [];
    if (!prefs.length) return { speak: { status: "nothing_on_file" } };
    const hit = all ? prefs : prefs.filter((p) => saidMatches(which, [p]));
    if (!hit.length) return { speak: { status: "not_on_file", on_file: prefs } };
    await removePreferences(id, hit);
    return {
      speak: { status: "removed", removed: hit },
      card: { kind: "removed", data: { what, names: hit, keys: hit.map((p) => `preference:${p}`) } },
    };
  }

  const contact = await getContact(id);
  if (!contact) return { speak: { status: "error" } };
  const file = await loadFile(contact);
  const entries =
    what === "doctor"
      ? file.doctors.map((d) => ({ factKey: d.npi, name: d.name, names: [d.name], item: `doctor:${d.npi}` }))
      : file.drugs.map((d) => ({ factKey: d.key, name: d.name, names: [d.name, ...d.ingredients.map((i) => i.name)], item: `drug:${d.name.toLowerCase()}` }));
  if (!entries.length) return { speak: { status: "nothing_on_file" } };

  const hit = all ? entries : entries.filter((e) => saidMatches(which, e.names));
  if (!hit.length) return { speak: { status: "not_on_file", on_file: entries.map((e) => e.name) } };
  if (hit.length > 1 && !all) return { speak: { status: "ask_which", options: hit.map((e) => e.name) } };

  await removeFacts(id, what, hit.map((e) => e.factKey));
  const names = hit.map((e) => e.name);
  await addNote(id, `Removed from file: ${names.join(", ")} (caller said it changed).`, ctx.conversationId);
  return {
    speak: {
      status: "removed",
      removed: names,
      still_on_file: entries.filter((e) => !hit.includes(e)).map((e) => e.name),
      next: "If they named a replacement, look it up now. If plans were compared earlier, call find_plans again so the comparison uses the updated file.",
    },
    card: { kind: "removed", data: { what, names, keys: [...hit.map((e) => e.item), ...stale] } },
  };
};

export const showFile: ToolHandler = async (_args, ctx) => {
  const contact = await getContact(ctx.contact.id);
  if (!contact) return { speak: { status: "error" } };
  const file = await loadFile(contact);
  const data = {
    doctors: file.doctors.map((d) => ({ name: d.name, specialty: d.specialty, city: d.city })),
    drugs: file.drugs.map((d) => ({ name: d.name, strength: d.strength })),
    booking: file.booking ? { when: file.booking.when, advisor: file.booking.advisor } : null,
    preferences: file.preferences,
  };
  return {
    speak: {
      status: "shown",
      doctors: data.doctors.map((d) => d.name),
      medications: data.drugs.map((d) => `${d.name}${d.strength ? ` ${d.strength}` : ""}`),
      booking: data.booking ? `${data.booking.when} with ${data.booking.advisor}` : null,
      preferences: data.preferences,
    },
    card: { kind: "on_file", data },
  };
};
