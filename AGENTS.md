<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Harbor

Harbor is a Medicare sales rep ("Anna") on Tavus CVI, inside a signed-in web app. Read `README.md` for the why.
This file is the map for changing it.

## Where things live

| Path | What |
|---|---|
| `agent/` | **The agent, as config.** PAL, system prompt, tools, objectives, guardrails. Source of truth; never edit the PAL in Tavus's web UI |
| `scripts/sync-agent.ts` | Pushes `agent/` to Tavus (`npm run agent:sync`; `npm run agent:check` = dry run) |
| `lib/tools/` | Tool handlers. `run.ts` is the single entry point (idempotency, validation, logging, never throws) |
| `lib/integrations/` | Public data APIs (NPI, CMS, RxNorm, ZIP→county). Timeouts and caching in `http.ts` |
| `lib/conversation/` | Per-call greeting and context (`script.ts`, compliance-critical) and call caps (`gate.ts`) |
| `lib/auth.ts` | Passwords, the session cookie, `currentUser()` / `requireUser()`. Every page, action and route goes through it |
| `lib/crm.ts` | Contacts, deal stage, verified facts, bookings. Also Anna's memory: the next call's context is built from it |
| `lib/record.ts` | One finished call: transcript, cards rebuilt from the tool-call ledger, compliance checklist |
| `lib/call/` | Browser-side call state (`session.ts`, unit-tested) and the tool relay |
| `app/(auth)/` | Sign-up and sign-in pages and their server actions |
| `app/app/` | The signed-in app: home, `call`, `c/[id]` (a past call), `file` (your coverage) |
| `app/app/advisor/` | Advisor console, for accounts listed in `ADVISOR_EMAILS` |
| `app/app/admin/` | Admin only (accounts in `ADMIN_EMAILS`): every conversation's agent trace, including Tavus's side (knowledge base, memory), and the evals. Queries in `lib/admin.ts` |
| `app/api/` | Conversations (create, end, poll), client tools, signed server tools |
| `components/call/` | Camera check, video stage, controls, conversation timeline, file cards, the Tavus event bridge |
| `app/components/cvi/` | Vendored `@tavus/cvi-ui` hooks (camera, mic, screen share, call). Prefer wrapping to editing |
| `tests/`, `e2e/` | Vitest (offline, recorded fixtures) and Playwright (sign-up through camera check) |

## Commands

```bash
npm run dev          # needs SESSION_SECRET; PGlite DB in .data/ (rm -rf .data to reset)
npm test             # must stay green; RECORD=1 npm test re-records public-API fixtures
npm run test:e2e     # stop other `next dev` first: one per folder
npm run typecheck
npm run lint
npm run agent:check  # what agent:sync would change
npm run verify       # live-call readiness, costs no Tavus minutes
```

## Adding a tool (the common change)

1. Add it to `agent/tools.json`: name, description (when to call it, and what each result status means),
   JSON-schema `parameters`, `delivery` (`client` for reads, `server` for writes), and explicit `on_call` /
   `on_resolve`.
2. Write the handler in `lib/tools/` returning `{ speak, card? }`. `speak` goes to the LLM, so keep it small
   (well under 4 KB). Identity, location and time zone come from `ctx`, never from the model.
3. Register it in `lib/tools/registry.ts`. If it has a card, add the type to `lib/tools/cards.ts`, render it in
   `components/call/FileCards.tsx`, and give it a one-line summary in `summaryFor` (`lib/call/session.ts`).
4. Add a test in `tests/tools.test.ts`. `tests/agent-config.test.ts` checks the JSON for you.
5. Mention when to use it in `agent/system-prompt.md`, then `npm run agent:sync`.

## Rules that aren't obvious

- **Compliance wording lives in code, not the prompt.** The CMS disclaimer is in `custom_greeting`
  (`lib/conversation/script.ts`), which Tavus speaks verbatim. Don't move it into the system prompt.
- **Set `on_resolve` on every tool.** Tavus defaults to `fire_and_forget`, and the rep then ignores the result.
  The config test fails if it's missing.
- **Tool arguments arrive as a JSON string.** Validation goes through `parseArguments` with the tool's own schema.
- **Idempotency is keyed on `tool_call_id`.** Don't bypass `runTool()`; Tavus retries once on 5xx, and the
  browser can see an event twice.
- **Server tools must answer HTTP 200 with something speakable.** A non-2xx makes Anna apologise; a 5xx triggers
  a retry.
- **Verify HMAC on the raw body text**, never on re-serialised JSON.
- **The model never computes dates or prices.** Slots are UTC start times; costs come from SQL.
- **Tavus bills from conversation create.** Create on Join (after the camera check), end on every exit path,
  keep `max_call_duration`.
- **PAL turns arrive twice** (`role: "pal"` and legacy `"replica"`). The bridge keeps one.
- **Authorize close to the data.** Every query that reads a person's rows filters on the signed-in contact id;
  route handlers re-check that the conversation belongs to them. UI hiding is not access control.
- **React 19 lint rules are on.** No `setState` in effect bodies and no `Date.now()` during render: subscribe to
  Daily events (`useDailyEvent`) or compute in SQL instead.
- **Plans and prices are demo data** (`lib/db/seed.ts`). Doctor and drug identities are real; never present
  simulated network membership as fact about a real doctor.
