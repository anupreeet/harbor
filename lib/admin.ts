import "server-only";
import type { TraceRow } from "@/components/call/AgentTrace";
import { parseArgs, TOOL_DELIVERY } from "./call/relay";
import { query, queryOne } from "./db";
import type { Line } from "./record";
import { tavus } from "./tavus/client";
import type { ToolResult } from "./tools/types";

// What admins see: every conversation (real calls and evals, any account) with its agent trace.
// Durations and "live" are computed in SQL so pages never read the clock while rendering.

export type TraceSummary = {
  id: string;
  kind: "call" | "eval";
  status: string;
  title: string | null;
  end_reason: string | null;
  created_at: string;
  duration_s: number | null;
  live: boolean;
  first_name: string;
  email: string;
  is_test: boolean;
  tool_calls: number;
  failed: number;
};

const SUMMARY = `
  c.id, c.kind, c.status, c.title, c.end_reason, c.created_at,
  CASE WHEN c.ended_at IS NULL THEN NULL ELSE round(extract(epoch FROM c.ended_at - c.created_at))::int END AS duration_s,
  (c.status = 'active' AND c.created_at > now() - interval '10 minutes') AS live,
  k.first_name, k.email, k.is_test`;

// Newest first, capped at 100, with how many tools each conversation ran and how many failed.
export const listTraces = () =>
  query<TraceSummary>(
    `SELECT ${SUMMARY}, t.calls AS tool_calls, t.failed
       FROM conversations c
       JOIN contacts k ON k.id = c.contact_id
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS calls, (count(*) FILTER (WHERE status = 'error'))::int AS failed
           FROM tool_calls WHERE conversation_id = c.id) t ON true
      ORDER BY c.created_at DESC LIMIT 100`,
  );

// One conversation, whoever it belonged to: transcript, opening greeting and context, and every
// tool call our server ran (pending ones included: a call that never finished is worth seeing).
export async function loadTrace(id: string) {
  const convo = await queryOne<
    Omit<TraceSummary, "tool_calls" | "failed"> & {
      greeting: string; context: string; transcript: Line[] | null; ended_at: string | null;
      events: { type: string; properties: Record<string, unknown>; at: string }[];
    }
  >(
    `SELECT ${SUMMARY}, c.greeting, c.context, c.transcript, c.ended_at, c.events
       FROM conversations c JOIN contacts k ON k.id = c.contact_id WHERE c.id = $1`,
    [id],
  );
  if (!convo) return null;

  const calls = await query<{ tool_call_id: string; name: string; status: string; args: unknown; latency_ms: number | null; result: ToolResult | null; created_at: string }>(
    `SELECT tool_call_id, name, status, args, latency_ms, result, created_at FROM tool_calls WHERE conversation_id = $1 ORDER BY created_at`,
    [id],
  );
  const start = new Date(convo.created_at).getTime();
  const trace: TraceRow[] = calls.map((c) => ({
    id: c.tool_call_id,
    tool: c.name,
    status: c.status,
    args: JSON.stringify(parseArgs(c.args)),
    ms: c.latency_ms,
    offsetSeconds: Math.round((new Date(c.created_at).getTime() - start) / 1000),
    told: c.result?.speak ?? null,
  }));

  return { convo, transcript: convo.transcript ?? [], trace, failed: calls.filter((c) => c.status === "error").length };
}

// --- Tavus's side of the conversation ---------------------------------------------------------
// Tavus's own record (GET /conversations/{id}?verbose=true, ready a minute or two after the call)
// shows what happened inside Tavus that never touches our server: knowledge-base retrievals, its
// built-in memory tool, memory being saved, and why the room closed. Guardrail triggers are not in
// it: Tavus only reports those live on the call and to a guardrail's callback_url.

type TavusMessage = {
  role: string;
  content?: unknown;
  seconds_from_start?: number;
  tool_call_id?: string;
  tool_calls?: { id?: string; name?: string; arguments?: string; function?: { name?: string; arguments?: string } }[];
};
type TavusEvent = { event_type: string; properties?: Record<string, unknown> };

export type TavusMoment = {
  at: number | null; // seconds from when Anna joined; null = after the call
  kind: "knowledge" | "memory" | "tool" | "room";
  label: string;
  detail?: string;
  body?: string;
};

export type TavusActivity = {
  // Every tool call Tavus's LLM made ({name, arguments}), for AgentTrace's reconciliation.
  toolCalls: { name: string; arguments: string }[];
  documents: string[]; // knowledge-base documents attached to the conversation
  moments: TavusMoment[];
  system: { at: number; text: string }[]; // what Tavus put in front of the LLM before the first turn
  counts: { retrievals: number; memoryLookups: number; builtInTools: number };
  memorySaved: boolean; // Tavus consolidated this conversation into the caller's memory store
  lines: Line[]; // Tavus's transcript of what was said; evals don't save one of ours
};

const MAX_BODY = 12_000;
const text = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 1) ?? "";
  return s.length > MAX_BODY ? `${s.slice(0, MAX_BODY)}\n… (${s.length - MAX_BODY} more characters)` : s;
};
const pretty = (raw: string) => {
  const args = parseArgs(raw);
  return Object.keys(args).length ? JSON.stringify(args) : raw;
};

// Null when Tavus isn't configured, can't be reached, or hasn't finished processing the call.
export async function loadTavusActivity(conversationId: string): Promise<TavusActivity | null> {
  let events: TavusEvent[];
  try {
    events = (await tavus<{ events?: TavusEvent[] }>("GET", `/conversations/${conversationId}?verbose=true`)).events ?? [];
  } catch {
    return null;
  }
  const transcript = events.find((e) => e.event_type === "application.transcription_ready")?.properties?.transcript as TavusMessage[] | undefined;
  if (!transcript) return null;

  const moments: TavusMoment[] = [];
  const system: TavusActivity["system"] = [];
  const toolCalls: TavusActivity["toolCalls"] = [];
  let documents: string[] = [];
  const counts = { retrievals: 0, memoryLookups: 0, builtInTools: 0 };
  const lines: Line[] = [];

  // Async tools answer twice ("dispatched…", then "<id>_result"); the last answer is the real one.
  // The same calls also reappear as "<id>_result" tool_calls, which are skipped below.
  const answers = new Map<string, unknown>();
  for (const m of transcript) if (m.role === "tool" && m.tool_call_id) answers.set(m.tool_call_id.replace(/_result$/, ""), m.content);

  for (const m of transcript) {
    const at = m.seconds_from_start ?? 0;
    const content = typeof m.content === "string" ? m.content : "";
    if ((m.role === "user" || m.role === "assistant") && content.trim()) lines.push({ role: m.role === "user" ? "user" : "pal", text: content.trim() });
    if (m.role === "system") {
      if (content.startsWith("You have access to the following")) {
        documents = [...content.matchAll(/Document name: (.+?) -/g)].map((d) => d[1].trim());
        system.push({ at, text: text(content) });
      } else if (content.startsWith("Information from documents")) {
        counts.retrievals += 1;
        moments.push({ at, kind: "knowledge", label: "Knowledge base retrieval", detail: "Medicare.gov passages Tavus added to the LLM's context", body: text(content) });
      } else {
        system.push({ at, text: text(content) });
      }
    }
    for (const tc of m.tool_calls ?? []) {
      if (tc.id?.endsWith("_result")) continue; // Tavus echoes each async call when its result lands
      const name = tc.function?.name ?? tc.name ?? "?";
      const args = tc.function?.arguments ?? tc.arguments ?? "";
      toolCalls.push({ name, arguments: args });
      if (name in TOOL_DELIVERY) continue; // ours: already in the agent trace above
      const memory = name === "grep_transcripts";
      if (memory) counts.memoryLookups += 1;
      else counts.builtInTools += 1;
      moments.push({
        at,
        kind: memory ? "memory" : "tool",
        label: memory ? "Memory lookup (grep_transcripts)" : `Tavus tool: ${name}`,
        detail: pretty(args),
        body: tc.id && answers.has(tc.id) ? text(answers.get(tc.id)) : undefined,
      });
    }
  }

  for (const e of events) {
    const p = e.properties ?? {};
    if (e.event_type === "application.memory_consolidation") {
      moments.push({ at: null, kind: "memory", label: "Memory saved", detail: "Tavus consolidated this conversation into the caller's memory store" });
    } else if (e.event_type === "application.raven_memory_evidence" && p.analysis) {
      moments.push({ at: null, kind: "memory", label: "Memory evidence", body: text(p.analysis) });
    } else if (e.event_type === "application.post_call_action_executed") {
      moments.push({ at: null, kind: "tool", label: `Post-call action: ${String(p.tool_name ?? "?")}`, detail: String(p.status ?? ""), body: p.response ? text(p.response) : undefined });
    } else if (e.event_type === "system.shutdown") {
      moments.push({ at: null, kind: "room", label: "Room closed", detail: String(p.shutdown_reason ?? p.reason ?? "unknown reason").replace(/_/g, " ") });
    }
  }

  moments.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  const memorySaved = events.some((e) => e.event_type === "application.memory_consolidation");
  return { toolCalls, documents, moments, system, counts, memorySaved, lines };
}
