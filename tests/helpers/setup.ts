import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll } from "vitest";

// Record/replay for public APIs (NPI, CMS, RxNorm, Zippopotam, FCC). `RECORD=1 npm test`
// captures real responses into tests/fixtures; normal runs replay them offline, so tests
// exercise real payload shapes without network flakiness.

const FIXTURES = join(process.cwd(), "tests", "fixtures");
const realFetch = globalThis.fetch;
const record = process.env.RECORD === "1";

const keyFor = (url: string) => {
  const host = new URL(url).hostname.split(".").slice(-2, -1)[0];
  return `${host}-${createHash("sha1").update(url).digest("hex").slice(0, 12)}.json`;
};

beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const file = join(FIXTURES, keyFor(url));
    if (existsSync(file)) {
      const { status, body } = JSON.parse(readFileSync(file, "utf8"));
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }
    if (!record) throw new Error(`No fixture for ${url} — run RECORD=1 npm test`);
    const res = await realFetch(input, init);
    const body = await res.json();
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, JSON.stringify({ url, status: res.status, body }, null, 1));
    return new Response(JSON.stringify(body), { status: res.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});
