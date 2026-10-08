// Schema as ordered statements (not one .sql file) because Neon's HTTP driver runs one
// statement per request. Bump SCHEMA_VERSION whenever a statement changes; boot re-applies
// everything idempotently and re-seeds the demo catalog. Locally, `rm -rf .data` resets.

export const SCHEMA_VERSION = 5;

export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_meta (id int PRIMARY KEY, version int NOT NULL)`,

  // --- Demo catalog (fictional plans; real RxNorm ingredient ids) ---------------------
  `CREATE TABLE IF NOT EXISTS plans (
     id text PRIMARY KEY,
     name text NOT NULL,
     carrier text NOT NULL DEFAULT '',        -- the insurance company that runs the plan
     plan_type text NOT NULL,                 -- HMO | PPO | HMO-POS | PDP
     monthly_premium_cents int NOT NULL,
     drug_deductible_cents int NOT NULL,
     moop_cents int,                          -- null for PDP (no medical coverage)
     star_rating real NOT NULL,
     pcp_copay_cents int,
     specialist_copay_cents int,
     network_breadth int,                     -- % of clinicians simulated in-network; null = any Medicare doctor
     extras text NOT NULL,
     summary text NOT NULL,
     sort_order int NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS formulary (
     plan_id text NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
     ingredient_rxcui text NOT NULL,
     ingredient_name text NOT NULL,
     tier int NOT NULL,
     monthly_copay_cents int NOT NULL,
     prior_auth boolean NOT NULL DEFAULT false,
     PRIMARY KEY (plan_id, ingredient_rxcui)
   )`,

  // --- Accounts + CRM -------------------------------------------------------------------
  // A contact is both the signed-in user and the CRM record the advisors work from.
  `CREATE TABLE IF NOT EXISTS contacts (
     id text PRIMARY KEY,
     email text UNIQUE NOT NULL,
     password_hash text NOT NULL,
     first_name text NOT NULL,
     zip text NOT NULL,
     city text,
     state text,
     county_name text,
     county_fips text,
     preferences jsonb NOT NULL DEFAULT '[]',
     is_test boolean NOT NULL DEFAULT false,  -- synthetic callers created by evals; hidden from the CRM
     created_at timestamptz NOT NULL DEFAULT now(),
     last_seen_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS deals (
     contact_id text PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
     stage text NOT NULL,                     -- new | qualified | booked
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  // What Anna verified about a person. It's also her memory: the next call starts from it.
  `CREATE TABLE IF NOT EXISTS facts (
     contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
     kind text NOT NULL,                      -- doctor | drug
     fact_key text NOT NULL,
     value jsonb NOT NULL,
     conversation_id text,
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (contact_id, kind, fact_key)
   )`,
  `CREATE TABLE IF NOT EXISTS bookings (
     id text PRIMARY KEY,
     contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
     conversation_id text,
     slot_start timestamptz NOT NULL,
     time_zone text NOT NULL,
     advisor_name text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS notes (
     id text PRIMARY KEY,
     contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
     conversation_id text,
     body text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,

  // --- Conversations ----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS conversations (
     id text PRIMARY KEY,
     contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
     kind text NOT NULL DEFAULT 'call',       -- call | eval (text-only test conversation)
     status text NOT NULL,                    -- active | ended
     conversation_url text,
     topic text,
     title text,
     greeting text NOT NULL,
     context text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     ended_at timestamptz,
     end_reason text,
     transcript jsonb,
     events jsonb NOT NULL DEFAULT '[]'      -- Tavus guardrail / objective events seen during the call
   )`,
  // One row per tool invocation; the primary key doubles as the idempotency key.
  `CREATE TABLE IF NOT EXISTS tool_calls (
     tool_call_id text PRIMARY KEY,
     conversation_id text,
     name text NOT NULL,
     args jsonb,
     status text NOT NULL,                    -- pending | success | error
     latency_ms int,
     result jsonb,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
     key text PRIMARY KEY,
     count int NOT NULL,
     expires_at timestamptz NOT NULL
   )`,

  // Columns added after v2, for databases created before them.
  `ALTER TABLE plans ADD COLUMN IF NOT EXISTS carrier text NOT NULL DEFAULT ''`,
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'call'`,
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS events jsonb NOT NULL DEFAULT '[]'`,

  `CREATE INDEX IF NOT EXISTS conversations_contact_idx ON conversations (contact_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS tool_calls_conversation_idx ON tool_calls (conversation_id)`,
];
