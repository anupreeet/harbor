import "server-only";
import { keyFor, type Card } from "./call/session";
import { TPMO_DISCLAIMER } from "./conversation/script";
import { query, queryOne } from "./db";
import { parseArgs } from "./call/relay";
import type { ToolResult } from "./tools/types";

// The record of one finished call: transcript, what Anna checked, and a compliance checklist.
// Rebuilt from the tool_calls ledger, so it shows what the tools returned, not what the model said.

// Tavus list price for conversational minutes beyond the plan allowance, used to show what a
// call cost. Billing starts at conversation create: 30-second minimum, 6-second increments.
export const PRICE_PER_MINUTE = 0.37;

export function billedMinutes(createdAt: Date, endedAt: Date): number {
  const seconds = Math.max(30, Math.ceil((endedAt.getTime() - createdAt.getTime()) / 1000 / 6) * 6);
  return seconds / 60;
}

export type Line = { role: "pal" | "user"; text: string };
export type CheckItem = { label: string; ok: boolean | null; detail?: string };

const ORDER = ["booking", "doctor", "drug", "plans", "plan_details", "cost", "preference"];

// `contactId` is the signed-in owner; null lets an admin open anyone's call.
export async function loadRecord(conversationId: string, contactId: string | null) {
  const convo = await queryOne<{
    id: string; status: string; title: string | null; greeting: string; created_at: string; ended_at: string | null;
    transcript: Line[] | null; events: { type: string; properties: Record<string, unknown>; at: string }[];
  }>(
    `SELECT id, status, title, greeting, created_at, ended_at, transcript, events FROM conversations WHERE id = $1 AND ($2::text IS NULL OR contact_id = $2)`,
    [conversationId, contactId],
  );
  if (!convo) return null;

  const calls = await query<{ tool_call_id: string; name: string; status: string; args: unknown; latency_ms: number | null; result: ToolResult | null; created_at: string }>(
    `SELECT tool_call_id, name, status, args, latency_ms, result, created_at FROM tool_calls WHERE conversation_id = $1 AND status <> 'pending' ORDER BY created_at`,
    [conversationId],
  );

  // One card per real-world thing, latest wins; "which one?" lists and open times are scaffolding.
  const file = new Map<string, Card>();
  for (const c of calls) {
    const card = c.result?.card;
    if (card && card.kind !== "doctor_options" && card.kind !== "availability") file.set(keyFor(card), card);
  }
  const cards = [...file.values()].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

  const named = (kind: string) => cards.filter((c) => c.kind === kind).map((c) => c.data as { name: string; strength?: string | null });
  const doctors = named("doctor").map((d) => d.name);
  const drugs = named("drug").map((d) => `${d.name}${d.strength ? ` ${d.strength}` : ""}`);
  const booking = cards.find((c) => c.kind === "booking");

  const checklist: CheckItem[] = [
    { label: "AI disclosure and Medicare disclaimer opened the call", ok: convo.greeting.includes(TPMO_DISCLAIMER), detail: "Spoken word for word from the fixed greeting" },
    { label: "Doctors checked", ok: doctors.length ? true : null, detail: doctors.join(", ") || "None mentioned" },
    { label: "Medications checked", ok: drugs.length ? true : null, detail: drugs.join(", ") || "None mentioned" },
    { label: "Plans compared on facts, no recommendation", ok: calls.some((c) => c.name === "find_plans" && c.status === "success") ? true : null },
    { label: "Licensed advisor call booked", ok: booking ? true : null, detail: booking ? String(booking.data.when) : "Not booked" },
  ];

  const minutes = convo.ended_at ? billedMinutes(new Date(convo.created_at), new Date(convo.ended_at)) : null;
  return {
    convo,
    transcript: convo.transcript ?? [],
    cards,
    checklist,
    lookups: calls.length,
    // Every tool call our server ran, in order: the agent trace.
    trace: calls.map((c) => ({
      id: c.tool_call_id,
      tool: c.name,
      status: c.status,
      args: JSON.stringify(parseArgs(c.args)),
      ms: c.latency_ms,
      offsetSeconds: Math.round((new Date(c.created_at).getTime() - new Date(convo.created_at).getTime()) / 1000),
      told: c.result?.speak ?? null,
    })),
    cost: minutes === null ? null : { minutes, dollars: minutes * PRICE_PER_MINUTE },
  };
}

// A short name for the sidebar, from what the call was about: "Dr. Jasmin Patel, Eliquis".
export function titleFor(cards: Card[]): string | null {
  const names = cards.flatMap((c) => (c.kind === "doctor" ? [c.data.name] : c.kind === "drug" ? [c.data.name] : []));
  return names.length ? names.slice(0, 3).join(", ") : null;
}
