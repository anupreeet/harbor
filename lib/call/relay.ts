import agentTools from "@/agent/tools.json";
import type { Card } from "./session";

// Which delivery each tool uses, straight from agent/tools.json. The browser only relays
// `client` tools; `server` tools are called by Tavus directly and must not be answered here.
export const TOOL_DELIVERY: Record<string, string> = Object.fromEntries(
  agentTools.tools.map((t) => [t.name, t.delivery]),
);

export type RelayResult = { status: "success" | "error"; result: { speak: Record<string, unknown>; card?: Card } };

export async function runToolViaServer(conversationId: string, toolCallId: string, name: string, args: unknown): Promise<RelayResult> {
  try {
    const res = await fetch(`/api/tools/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, toolCallId, arguments: args }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as RelayResult;
  } catch {
    // Anna still needs an answer, or the turn stalls.
    return { status: "error", result: { speak: { status: "error", say: "That lookup didn't go through; say the licensed advisor will confirm it." } } };
  }
}

// Tavus adds a `response_to_user` field (the filler it is speaking) to tool arguments; it's not
// an argument of ours, so it's dropped from what we show and log.
export function parseArgs(raw: unknown): Record<string, unknown> {
  let args: unknown = raw;
  if (typeof raw === "string") {
    try {
      args = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!args || typeof args !== "object") return {};
  const { response_to_user: _filler, ...rest } = args as Record<string, unknown>;
  void _filler;
  return rest;
}
