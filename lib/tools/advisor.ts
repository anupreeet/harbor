import "server-only";
import { addNote, advanceDeal, addPreference } from "../crm";
import { formatSlot, isValidSlot, nextSlots, advisorFor } from "../calendar";
import { newId, query, queryOne } from "../db";
import type { ToolHandler } from "./types";

async function takenSlots(): Promise<Set<string>> {
  const rows = await query<{ slot_start: string | Date }>(`SELECT slot_start FROM bookings WHERE slot_start > now()`);
  return new Set(rows.map((r) => new Date(r.slot_start).toISOString()));
}

export const getAdvisorAvailability: ToolHandler = async (args, ctx) => {
  const day = args.preferred_day as string | undefined;
  const opts = { timeZone: ctx.contact.timeZone, taken: await takenSlots() };
  let slots = nextSlots({ ...opts, preferredDay: day });
  // That day is full (or "today" after hours): offer the soonest times rather than nothing,
  // so "what times are open?" always gets an answer the caller can pick from.
  const fellBack = slots.length === 0 && !!day;
  if (fellBack) slots = nextSlots(opts);
  if (slots.length === 0) return { speak: { status: "none_that_day", ask: "Offer a different day." } };
  return {
    speak: {
      status: "available",
      ...(fellBack ? { note: `Nothing is open ${day}; these are the soonest times.` } : {}),
      options: slots.map((s) => ({ slot_id: s.slotId, time: s.label, advisor: s.advisor })),
    },
    card: { kind: "availability", data: slots },
  };
};

// Write tool. Reached only via HMAC-verified API delivery from Tavus; idempotency
// on tool_call_id is enforced one layer up in runTool.
export const bookAdvisorCall: ToolHandler = async (args, ctx) => {
  const slotId = args.slot_id as string;
  const tz = ctx.contact.timeZone;
  const taken = await takenSlots();

  if (!isValidSlot(slotId, tz) || taken.has(slotId)) {
    const alternatives = nextSlots({ timeZone: tz, taken }).map((s) => ({ slot_id: s.slotId, time: s.label }));
    return { speak: { status: "taken", alternatives } };
  }

  // One upcoming advisor call per person: booking again reschedules.
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM bookings WHERE contact_id = $1 AND slot_start > now()`,
    [ctx.contact.id],
  );
  const advisor = advisorFor(slotId);
  const id = existing?.id ?? newId();
  if (existing) {
    await query(`UPDATE bookings SET slot_start = $2, advisor_name = $3, time_zone = $4, conversation_id = $5 WHERE id = $1`, [id, slotId, advisor, tz, ctx.conversationId]);
  } else {
    await query(
      `INSERT INTO bookings (id, contact_id, conversation_id, slot_start, time_zone, advisor_name) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, ctx.contact.id, ctx.conversationId, slotId, tz, advisor],
    );
  }
  const when = formatSlot(new Date(slotId), tz);
  await advanceDeal(ctx.contact.id, "booked");
  await addNote(ctx.contact.id, `${existing ? "Rescheduled" : "Booked"} advisor call with ${advisor}: ${when}.`, ctx.conversationId);

  return {
    speak: { status: existing ? "rescheduled" : "booked", when, advisor, next: "The booking is on their screen and in their Harbor account." },
    card: { kind: "booking", data: { bookingId: id, when, advisor } },
  };
};

export const rememberPreference: ToolHandler = async (args, ctx) => {
  await addPreference(ctx.contact.id, args.preference as string);
  return { speak: { status: "saved" }, card: { kind: "preference", data: { preference: args.preference as string } } };
};
