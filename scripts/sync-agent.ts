/**
 * npm run agent:sync [-- --dry-run]
 *
 * Reconciles agent/ (the source of truth) with Tavus: tools, guardrails, objectives, PAL.
 * Safe to re-run; it upserts by name and only recreates objectives when their content changes.
 * Writes resource ids to agent/.tavus-ids.json and prints TAVUS_PAL_ID for your deployment.
 *
 * Patterns follow Tavus's own demos: tool upsert/attach/prune (tavus1, tavus-monodelez),
 * objectives + exact guardrail_ids replace, then a free test_mode probe (tavus1 CLAUDE.md).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const DRY = process.argv.includes("--dry-run");
const ROOT = process.cwd();
const BASE = "https://tavusapi.com/v2";
const KEY = process.env.TAVUS_API_KEY;
const APP = process.env.APP_BASE_URL?.replace(/\/$/, "");
const SECRET = process.env.TAVUS_TOOL_SECRET;
const IDS_FILE = join(ROOT, "agent", ".tavus-ids.json");

type Ids = { pal_id?: string; objectives_id?: string; objectives_hash?: string; guardrail_ids?: string[]; tool_ids?: Record<string, string>; document_ids?: Record<string, string> };

const readJson = <T>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const log = (msg: string) => console.log(`${DRY ? "[dry-run] " : ""}${msg}`);
const redact = (s: string) => s.replace(/[a-f0-9]{32,}/gi, "…");

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": KEY!, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok && res.status !== 304) throw new Error(`${method} ${path} -> ${res.status}: ${redact(text).slice(0, 400)}`);
  return { status: res.status, data };
}

// --- tools -------------------------------------------------------------------------------

type Spec = { name: string; delivery: "client" | "server"; description: string; parameters: unknown; on_call?: string; on_resolve?: string };

// client: Tavus sends the call over the room's data channel and our page answers it.
// server: Tavus POSTs to our API, HMAC-signed with TAVUS_TOOL_SECRET.
function toTavusTool(spec: Spec) {
  const delivery =
    spec.delivery === "client"
      ? { app_message: true }
      : { api: { url: `${APP}/api/tavus/tools`, method: "POST", timeout: 15, auth: { type: "hmac", secret: SECRET } } };
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    trigger_type: "in_call",
    on_call: spec.on_call,
    on_resolve: spec.on_resolve,
    delivery,
  };
}

async function syncTools(): Promise<Record<string, string>> {
  const { tools } = readJson<{ tools: Spec[] }>("agent/tools.json");
  const out: Record<string, string> = {};
  for (const spec of tools) {
    if (spec.delivery === "server" && (!APP || !SECRET)) {
      log(`skip ${spec.name}: server tools need APP_BASE_URL and TAVUS_TOOL_SECRET`);
      continue;
    }
    const body = toTavusTool(spec);
    const { data } = await api<{ data: { tool_id: string; name: string }[] }>("GET", `/tools?type=user&limit=50&name_or_uuid=${encodeURIComponent(spec.name)}`);
    const existing = data.data?.find((t) => t.name === spec.name); // name_or_uuid is a substring match
    if (DRY) { log(`${existing ? "update" : "create"} tool ${spec.name}`); if (existing) out[spec.name] = existing.tool_id; continue; }
    if (existing) {
      await api("PATCH", `/tools/${existing.tool_id}`, body);
      out[spec.name] = existing.tool_id;
      log(`updated tool ${spec.name}`);
    } else {
      const created = await api<{ tool_id: string }>("POST", "/tools", body);
      out[spec.name] = created.data.tool_id;
      log(`created tool ${spec.name}`);
    }
  }
  return out;
}

// --- knowledge base --------------------------------------------------------------------------
// Documents are created once (Tavus crawls them in 5-10 minutes) and attached to each call by tag.

async function syncKnowledge(ids: Ids): Promise<Record<string, string>> {
  const file = readJson<{ tag: string; documents: { document_name: string; document_url: string }[] }>("agent/knowledge.json");
  const known = { ...(ids.document_ids ?? {}) };
  for (const doc of file.documents) {
    if (known[doc.document_name]) {
      const { data } = await api<{ status?: string }>("GET", `/documents/${known[doc.document_name]}`).catch(() => ({ data: {} as { status?: string } }));
      if (data.status) { log(`document ${doc.document_name}: ${data.status}`); continue; }
    }
    if (DRY) { log(`create document ${doc.document_name}`); continue; }
    const created = await api<{ document_id: string }>("POST", "/documents", { ...doc, tags: [file.tag] });
    known[doc.document_name] = created.data.document_id;
    log(`created document ${doc.document_name} (Tavus crawls it in 5-10 minutes)`);
  }
  return known;
}

// --- guardrails --------------------------------------------------------------------------

async function syncGuardrails(): Promise<string[]> {
  const file = readJson<{ tags: string[]; guardrails: { guardrail_name: string; guardrail_prompt: string; modality: string }[] }>("agent/guardrails.json");
  const out: string[] = [];
  for (const g of file.guardrails) {
    const { data } = await api<{ data: { uuid: string; guardrail_name: string }[] }>("GET", `/guardrails?legacy=false&limit=50&name_or_uuid=${encodeURIComponent(g.guardrail_name)}`);
    const existing = data.data?.find((x) => x.guardrail_name === g.guardrail_name);
    if (DRY) { log(`${existing ? "update" : "create"} guardrail ${g.guardrail_name}`); if (existing) out.push(existing.uuid); continue; }
    if (existing) {
      await api("PATCH", `/guardrails/${existing.uuid}`, [
        { op: "replace", path: "/guardrail_prompt", value: g.guardrail_prompt },
        { op: "replace", path: "/modality", value: g.modality },
      ]);
      out.push(existing.uuid);
      log(`updated guardrail ${g.guardrail_name}`);
    } else {
      const created = await api<{ uuid: string }>("POST", "/guardrails", { ...g, tags: file.tags });
      out.push(created.data.uuid);
      log(`created guardrail ${g.guardrail_name}`);
    }
  }
  return out;
}

// --- objectives --------------------------------------------------------------------------

async function syncObjectives(ids: Ids): Promise<{ id?: string; hash: string; previous?: string }> {
  const file = readJson<{ objectives: Record<string, unknown>[] }>("agent/objectives.json");
  const data = file.objectives;
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
  if (ids.objectives_id && ids.objectives_hash === hash) { log("objectives unchanged"); return { id: ids.objectives_id, hash }; }
  if (DRY) { log("create objectives (content changed)"); return { id: ids.objectives_id, hash }; }
  const created = await api<{ objectives_id: string }>("POST", "/objectives", { data });
  log(`created objectives ${created.data.objectives_id}`);
  return { id: created.data.objectives_id, hash, previous: ids.objectives_id };
}

// --- PAL ---------------------------------------------------------------------------------

async function ensureFace(faceId: string) {
  const { data } = await api<{ data: { face_id?: string; replica_id?: string; face_name?: string }[] }>("GET", `/faces?face_ids=${faceId}&verbose=true`);
  if (!data.data?.some((f) => (f.face_id ?? f.replica_id) === faceId)) {
    throw new Error(`Face ${faceId} not found on this account. List stock faces with GET /v2/faces?face_type=system and update agent/pal.json.`);
  }
}

async function syncPal(ids: Ids, objectivesId: string | undefined, guardrailIds: string[]): Promise<string | undefined> {
  const pal = readJson<Record<string, unknown> & { default_face_id: string }>("agent/pal.json");
  delete pal.$comment;
  const systemPrompt = readFileSync(join(ROOT, "agent", "system-prompt.md"), "utf8");
  await ensureFace(pal.default_face_id);
  const desired = { ...pal, system_prompt: systemPrompt, guardrail_ids: guardrailIds, ...(objectivesId ? { objectives_id: objectivesId } : {}) };

  let existing = false;
  if (ids.pal_id) {
    try { await api("GET", `/pals/${ids.pal_id}`); existing = true; } catch { log(`stored PAL ${ids.pal_id} not found; creating a new one`); }
  }
  if (DRY) { log(`${existing ? "update" : "create"} PAL ${pal.pal_name}`); return ids.pal_id; }

  if (!existing) {
    const created = await api<{ pal_id: string }>("POST", "/pals", desired);
    log(`created PAL ${created.data.pal_id}`);
    return created.data.pal_id;
  }
  // JSON Patch: `add` on an existing member replaces it, so it works whether or not the field is set.
  const ops = Object.entries(desired).map(([k, value]) => ({ op: "add", path: `/${k}`, value }));
  const res = await api("PATCH", `/pals/${ids.pal_id}`, ops).catch(async (err: Error) => {
    if (!/409/.test(err.message)) throw err;
    log("PAL has unsaved edits in PAL Maker; overwriting with agent/ (the source of truth)");
    return api("PATCH", `/pals/${ids.pal_id}?force=true`, ops);
  });
  log(res.status === 304 ? "PAL unchanged" : `updated PAL ${ids.pal_id}`);
  return ids.pal_id;
}

async function attachTools(palId: string, toolIds: Record<string, string>) {
  const wanted = new Set(Object.values(toolIds));
  if (DRY) { log(`attach ${wanted.size} tools`); return; }
  if (wanted.size) await api("POST", `/pals/${palId}/tools`, { tool_ids: [...wanted] });
  const { data } = await api<{ data: { tool_id: string; name: string; is_system_tool?: boolean }[] }>("GET", `/pals/${palId}/tools`);
  for (const t of data.data ?? []) {
    if (!t.is_system_tool && !wanted.has(t.tool_id)) {
      await api("DELETE", `/pals/${palId}/tools/${t.tool_id}`);
      log(`detached stray tool ${t.name}`);
    }
  }
  log(`attached tools: ${Object.keys(toolIds).join(", ")}`);
}

// --- main --------------------------------------------------------------------------------

async function main() {
  if (!KEY) throw new Error("Set TAVUS_API_KEY in .env.local");
  if (!APP) log("APP_BASE_URL not set: syncing client-side tools only (deploy first for booking and preferences)");
  let ids: Ids = {};
  try { ids = JSON.parse(readFileSync(IDS_FILE, "utf8")); } catch {}

  const tool_ids = await syncTools();
  const document_ids = await syncKnowledge(ids);
  const guardrail_ids = await syncGuardrails();
  const objectives = await syncObjectives(ids);
  const pal_id = await syncPal(ids, objectives.id, guardrail_ids);
  if (pal_id) await attachTools(pal_id, tool_ids);

  if (!DRY) {
    if (objectives.previous && objectives.previous !== objectives.id) {
      await api("DELETE", `/objectives/${objectives.previous}`).catch(() => log(`could not delete old objectives ${objectives.previous}`));
    }
    writeFileSync(IDS_FILE, JSON.stringify({ pal_id, objectives_id: objectives.id, objectives_hash: objectives.hash, guardrail_ids, tool_ids, document_ids }, null, 2) + "\n");
    console.log(`\nSynced. For your deployment, set:\n  TAVUS_PAL_ID=${pal_id}\n`);
  }
}

main().catch((err) => {
  console.error(`\nsync failed: ${err.message}`);
  process.exit(1);
});
