import "server-only";
import { formatSlot } from "./calendar";
import { newId, query, queryOne } from "./db";
import type { DoctorFact } from "./tools/doctor";
import type { DrugFact } from "./tools/drug";

// The CRM is the ledger: contacts, deal stage, what Anna verified (facts), bookings, notes.
// Advisors work from it, the app shows it back to the customer, and the next call starts from it.

export type Contact = {
  id: string;
  email: string;
  first_name: string;
  zip: string;
  city: string | null;
  state: string | null;
  county_name: string | null;
  county_fips: string | null;
  preferences: string[];
  created_at: string;
  last_seen_at: string;
};

const CONTACT_COLUMNS = `id, email, first_name, zip, city, state, county_name, county_fips, preferences, created_at, last_seen_at`;

export type DealStage = "new" | "qualified" | "booked";
const STAGE_ORDER: DealStage[] = ["new", "qualified", "booked"];

export async function createContact(input: {
  email: string;
  passwordHash: string;
  firstName: string;
  zip: string;
  city: string | null;
  state: string | null;
  countyName: string | null;
  countyFips: string | null;
}): Promise<Contact | null> {
  const contact = await queryOne<Contact>(
    `INSERT INTO contacts (id, email, password_hash, first_name, zip, city, state, county_name, county_fips)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (email) DO NOTHING RETURNING ${CONTACT_COLUMNS}`,
    [newId(), input.email.trim().toLowerCase(), input.passwordHash, input.firstName.trim(), input.zip, input.city, input.state, input.countyName, input.countyFips],
  );
  if (contact) await query(`INSERT INTO deals (contact_id, stage) VALUES ($1, 'new')`, [contact.id]);
  return contact; // null: the email already has an account
}

export const getContact = (id: string) => queryOne<Contact>(`SELECT ${CONTACT_COLUMNS} FROM contacts WHERE id = $1`, [id]);

export const getLogin = (email: string) =>
  queryOne<{ id: string; password_hash: string }>(`SELECT id, password_hash FROM contacts WHERE email = $1`, [email.trim().toLowerCase()]);

export const touchContact = (id: string) => query(`UPDATE contacts SET last_seen_at = now() WHERE id = $1`, [id]);

// Stages only move forward: a late "qualified" write never undoes a booking.
export async function advanceDeal(contactId: string, stage: DealStage) {
  const current = await queryOne<{ stage: DealStage }>(`SELECT stage FROM deals WHERE contact_id = $1`, [contactId]);
  if (current && STAGE_ORDER.indexOf(current.stage) >= STAGE_ORDER.indexOf(stage)) return;
  await query(
    `INSERT INTO deals (contact_id, stage, updated_at) VALUES ($1,$2,now())
     ON CONFLICT (contact_id) DO UPDATE SET stage = EXCLUDED.stage, updated_at = now()`,
    [contactId, stage],
  );
}

export type FactKind = "doctor" | "drug";

export async function recordFact(contactId: string, kind: FactKind, key: string, value: unknown, conversationId: string) {
  await query(
    `INSERT INTO facts (contact_id, kind, fact_key, value, conversation_id, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (contact_id, kind, fact_key) DO UPDATE SET value = EXCLUDED.value,
       conversation_id = EXCLUDED.conversation_id, updated_at = now()`,
    [contactId, kind, key, JSON.stringify(value), conversationId],
  );
}

export async function listFacts<T = Record<string, unknown>>(contactId: string, kind: FactKind) {
  const rows = await query<{ value: T }>(
    `SELECT value FROM facts WHERE contact_id = $1 AND kind = $2 ORDER BY updated_at`,
    [contactId, kind],
  );
  return rows.map((r) => r.value);
}

export async function addPreference(contactId: string, preference: string) {
  const contact = await getContact(contactId);
  if (!contact) return;
  const prefs = contact.preferences.filter((p) => p.toLowerCase() !== preference.toLowerCase());
  prefs.push(preference);
  await query(`UPDATE contacts SET preferences = $2 WHERE id = $1`, [contactId, JSON.stringify(prefs.slice(-10))]);
}

export async function addNote(contactId: string, body: string, conversationId?: string) {
  await query(`INSERT INTO notes (id, contact_id, conversation_id, body) VALUES ($1,$2,$3,$4)`, [newId(), contactId, conversationId ?? null, body]);
}

export type UpcomingBooking = { id: string; when: string; advisor: string };

export async function upcomingBooking(contactId: string): Promise<UpcomingBooking | null> {
  const b = await queryOne<{ id: string; slot_start: string; time_zone: string; advisor_name: string }>(
    `SELECT id, slot_start, time_zone, advisor_name FROM bookings WHERE contact_id = $1 AND slot_start > now() ORDER BY slot_start LIMIT 1`,
    [contactId],
  );
  return b && { id: b.id, when: formatSlot(new Date(b.slot_start), b.time_zone), advisor: b.advisor_name };
}

// Everything Harbor knows about a person, in one read: the "Your coverage" page, the advisor
// CRM and the next call's context all come from this.
export type CoverageFile = {
  doctors: DoctorFact[];
  drugs: DrugFact[];
  booking: UpcomingBooking | null;
  preferences: string[];
};

export async function loadFile(contact: Contact): Promise<CoverageFile> {
  const [doctors, drugs, booking] = await Promise.all([
    listFacts<DoctorFact>(contact.id, "doctor"),
    listFacts<DrugFact>(contact.id, "drug"),
    upcomingBooking(contact.id),
  ]);
  return { doctors, drugs, booking, preferences: contact.preferences };
}

// `live`: still active and younger than Tavus's hard cap; an older "active" row was abandoned.
export type ConversationSummary = { id: string; title: string | null; live: boolean; created_at: string };

export const listConversations = (contactId: string) =>
  query<ConversationSummary>(
    `SELECT id, title, created_at, (status = 'active' AND created_at > now() - interval '10 minutes') AS live
       FROM conversations WHERE contact_id = $1 AND kind = 'call' ORDER BY created_at DESC LIMIT 50`,
    [contactId],
  );
