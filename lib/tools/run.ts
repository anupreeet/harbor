import "server-only";
import { query, queryOne } from "../db";
import { UpstreamError } from "../integrations/http";
import { parseArgs } from "../call/relay";
import { getTool, loadToolContext } from "./registry";
import type { ToolResult } from "./types";
import { parseArguments, ToolArgumentError } from "./validate";

export type Channel = "client" | "server";

export type RunToolInput = {
  name: string;
  toolCallId: string;
  conversationId: string;
  rawArgs: unknown;
  channel: Channel;
};

export type RunToolOutput = { status: "success" | "error"; result: ToolResult; replayed: boolean };

const fail = (say: string, extra: Record<string, unknown> = {}): ToolResult => ({ speak: { status: "error", say, ...extra } });

// Single entry point for every tool call, whichever way it arrived. Never throws: the
// rep must always get *something* to say, or the conversation stalls.
export async function runTool(input: RunToolInput): Promise<RunToolOutput> {
  const tool = getTool(input.name);
  if (!tool) return { status: "error", result: fail(`Unknown tool ${input.name}.`), replayed: false };

  const ctx = await loadToolContext(input.conversationId);
  if (!ctx) {
    // Not a conversation this server started: answer politely, write nothing.
    return { status: "error", result: fail("This session isn't active; don't retry the tool."), replayed: false };
  }

  // Delivery channel must match the spec: the browser can never trigger a write tool.
  if (input.channel !== tool.spec.delivery) return { status: "error", result: fail("Tool not available on this channel."), replayed: false };

  // Claim the tool_call_id before running (SET-NX style). A retry or duplicate delivery
  // gets the stored result instead of running side effects twice.
  const claimed = await queryOne<{ tool_call_id: string }>(
    `INSERT INTO tool_calls (tool_call_id, conversation_id, name, args, status)
     VALUES ($1,$2,$3,$4,'pending') ON CONFLICT (tool_call_id) DO NOTHING RETURNING tool_call_id`,
    [input.toolCallId, input.conversationId, input.name, JSON.stringify(input.rawArgs ?? null)],
  );
  if (!claimed) {
    trace({ conversation: input.conversationId, call: input.toolCallId, tool: input.name, via: input.channel, status: "duplicate, replayed stored result" });
    return replay(input.toolCallId, input.name);
  }

  const started = Date.now();
  let status: "success" | "error" = "success";
  let result: ToolResult;
  try {
    const args = parseArguments(input.rawArgs, tool.spec.parameters);
    result = await tool.handler(args, ctx);
  } catch (err) {
    status = "error";
    if (err instanceof ToolArgumentError) {
      result = fail("I didn't catch that clearly; ask the caller to repeat it.", { detail: err.message });
    } else if (err instanceof UpstreamError) {
      result = fail(`The ${err.source} lookup isn't responding right now. Say you couldn't check it this moment and offer to have the licensed advisor confirm it.`);
    } else {
      console.error(`[tool:${input.name}]`, err);
      result = fail("Something went wrong on our side; continue without this and offer the licensed advisor.");
    }
  }

  const ms = Date.now() - started;
  await query(
    `UPDATE tool_calls SET status = $2, latency_ms = $3, result = $4 WHERE tool_call_id = $1`,
    [input.toolCallId, status, ms, JSON.stringify(result)],
  );
  trace({ conversation: input.conversationId, call: input.toolCallId, tool: input.name, via: input.channel, args: parseArgs(input.rawArgs), status, ms, told: result.speak });
  return { status, result, replayed: false };
}

// One JSON line per tool call in the server log: grep "[trace]" to follow what the agent did.
export function trace(event: Record<string, unknown>) {
  const line = JSON.stringify(event);
  console.info(`[trace] ${line.length > 1200 ? `${line.slice(0, 1200)}…` : line}`);
}

async function replay(toolCallId: string, name: string): Promise<RunToolOutput> {
  // The first delivery may still be running; wait briefly for its result.
  for (let i = 0; i < 20; i++) {
    const row = await queryOne<{ name: string; status: string; result: ToolResult | null }>(
      `SELECT name, status, result FROM tool_calls WHERE tool_call_id = $1`,
      [toolCallId],
    );
    // An id reused for a different tool is a client bug, never a retry: don't hand back
    // another tool's answer.
    if (row && row.name !== name) {
      return { status: "error", result: fail("That request was a duplicate; ask the caller to repeat it."), replayed: true };
    }
    if (row && row.status !== "pending" && row.result) {
      return { status: row.status === "success" ? "success" : "error", result: row.result, replayed: true };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { status: "error", result: fail("Still working on that; give it a moment."), replayed: true };
}
