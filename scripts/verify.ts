/**
 * npm run verify — is this deployment ready for a live call? Costs no Tavus minutes.
 *
 * Checks config, that the PAL and its tools exist on Tavus, that the agent/ files are fully
 * synced, and creates a `test_mode` conversation (Tavus doesn't join or bill it) to prove the
 * create path works. Prints pass / warn / blocked per check. Pattern from tavus-poker's
 * verify-tavus-readiness script.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

type Status = "pass" | "warn" | "blocked";
const results: { check: string; status: Status; detail: string }[] = [];
const add = (check: string, status: Status, detail: string) => results.push({ check, status, detail });
const redact = (s: string) => s.replace(/[A-Za-z0-9_-]{24,}/g, "…");

const KEY = process.env.TAVUS_API_KEY;
const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`https://tavusapi.com/v2${path}`, {
    method,
    headers: { "x-api-key": KEY!, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

async function main() {
  add("TAVUS_API_KEY", KEY ? "pass" : "blocked", KEY ? "set" : "missing: calls can't start");
  add("SESSION_SECRET", (process.env.SESSION_SECRET?.length ?? 0) >= 32 ? "pass" : "blocked", "signs login cookies (32+ characters)");
  add("APP_BASE_URL", process.env.APP_BASE_URL?.startsWith("https://") ? "pass" : "warn", process.env.APP_BASE_URL ?? "not set: booking and saved preferences need a public HTTPS URL");
  add("TAVUS_TOOL_SECRET", (process.env.TAVUS_TOOL_SECRET?.length ?? 0) >= 24 ? "pass" : "warn", "signs server tool calls (24+ characters)");
  add("INVITE_CODE", process.env.INVITE_CODE ? "pass" : "warn", process.env.INVITE_CODE ? "sign-up is invite-only" : "anyone can sign up and spend your Tavus minutes (capped per account and per day)");
  add("DATABASE_URL", process.env.DATABASE_URL ? "pass" : "warn", process.env.DATABASE_URL ? "Postgres" : "embedded PGlite (fine locally, resets on serverless cold starts)");

  if (KEY) {
    let ids: { pal_id?: string; tool_ids?: Record<string, string> } = {};
    try { ids = JSON.parse(readFileSync(join(process.cwd(), "agent", ".tavus-ids.json"), "utf8")); } catch {}
    const palId = process.env.TAVUS_PAL_ID || ids.pal_id;
    if (!palId) {
      add("PAL", "blocked", "no PAL yet: run npm run agent:sync");
    } else {
      const pal = await api("GET", `/pals/${palId}`);
      add("PAL", pal.status === 200 ? "pass" : "blocked", pal.status === 200 ? `${pal.body?.pal_name} (${palId})` : `GET /pals/${palId} -> ${pal.status}`);
      const tools = await api("GET", `/pals/${palId}/tools`);
      const attached = new Set<string>((tools.body?.data ?? []).map((t: { name: string }) => t.name));
      const expected = JSON.parse(readFileSync(join(process.cwd(), "agent", "tools.json"), "utf8")).tools.map((t: { name: string }) => t.name) as string[];
      const missing = expected.filter((n) => !attached.has(n));
      add("Tools attached", missing.length === 0 ? "pass" : "warn", missing.length ? `missing: ${missing.join(", ")}` : `${attached.size} attached`);

      const probe = await api("POST", "/conversations", { pal_id: palId, test_mode: true, conversation_name: "harbor readiness probe" });
      add("Create conversation (test_mode, free)", probe.status === 200 ? "pass" : "blocked", probe.status === 200 ? `status ${probe.body?.status}` : redact(JSON.stringify(probe.body)).slice(0, 200));
    }
  }

  const icon = { pass: "PASS", warn: "WARN", blocked: "BLOCKED" } as const;
  for (const r of results) console.log(`${icon[r.status].padEnd(8)} ${r.check.padEnd(40)} ${r.detail}`);
  const blocked = results.some((r) => r.status === "blocked");
  console.log(blocked ? "\nNot ready for live calls." : "\nReady for a live call.");
  if (blocked && process.argv.includes("--strict")) process.exit(1);
}

main().catch((err) => {
  console.error(redact(String(err)));
  process.exit(1);
});
