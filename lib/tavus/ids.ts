import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Tavus resource ids created by `npm run agent:sync`. Locally they're read from
// agent/.tavus-ids.json; in production set TAVUS_PAL_ID (the sync script prints it).

export type TavusIds = { pal_id?: string; objectives_id?: string; guardrail_ids?: string[]; tool_ids?: Record<string, string> };

export function readTavusIds(): TavusIds {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "agent", ".tavus-ids.json"), "utf8")) as TavusIds;
  } catch {
    return {};
  }
}

export function palId(): string | null {
  return process.env.TAVUS_PAL_ID || readTavusIds().pal_id || null;
}
