import { query } from "@/lib/db";
import { createContact } from "@/lib/crm";

// A signed-up contact in Chicago plus an active conversation: the minimum a tool needs to run.
export async function seedConversation(opts: { id?: string; email?: string } = {}) {
  const contact = await createContact({
    email: opts.email ?? `bob+${crypto.randomUUID().slice(0, 8)}@example.com`,
    passwordHash: "scrypt$test$test",
    firstName: "Bob",
    zip: "60614",
    city: "Chicago",
    state: "IL",
    countyName: "Cook County",
    countyFips: "17031",
  });
  const id = opts.id ?? `c_${crypto.randomUUID().slice(0, 8)}`;
  await query(`INSERT INTO conversations (id, contact_id, status, greeting, context) VALUES ($1,$2,'active','','')`, [id, contact!.id]);
  return { conversationId: id, contact: contact! };
}
