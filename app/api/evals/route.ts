import knowledge from "@/agent/knowledge.json";
import { currentUser, isAdmin } from "@/lib/auth";
import { buildContext, buildGreeting } from "@/lib/conversation/script";
import { createContact } from "@/lib/crm";
import { newId, query } from "@/lib/db";
import { createConversation, isConcurrencyLimit } from "@/lib/tavus/client";
import { palId } from "@/lib/tavus/ids";
import { trace } from "@/lib/tools/run";

// Starts one eval case: a fresh synthetic caller in Chicago and a text-only Tavus conversation
// (`chat: true`, no video) against the same PAL, greeting, context and knowledge base as a real
// call. The Evals page joins its room and plays the case's turns. Admins only; billed by Tavus.
export async function POST() {
  const user = await currentUser();
  if (!user || !isAdmin(user.email)) return Response.json({ error: "Admins only." }, { status: 403 });
  const pal = palId();
  if (!pal || !process.env.TAVUS_API_KEY) return Response.json({ error: "Tavus isn't set up on this server." }, { status: 503 });

  const caller = await createContact({
    email: `eval+${newId()}@harbor.test`,
    passwordHash: "-", // can't sign in
    firstName: "Bob",
    zip: "60614",
    city: "Chicago",
    state: "IL",
    countyName: "Cook County",
    countyFips: "17031",
  });
  await query(`UPDATE contacts SET is_test = true WHERE id = $1`, [caller!.id]);

  const greeting = buildGreeting({ firstName: "Bob", returning: false });
  const context = buildContext({ now: new Date(), timeZone: "America/Chicago", firstName: "Bob", city: "Chicago", state: "IL", countyName: "Cook County", topic: null, file: null });
  try {
    const created = await createConversation({
      pal_id: pal,
      chat: true,
      conversation_name: "Harbor eval",
      custom_greeting: greeting,
      conversational_context: context,
      document_tags: [knowledge.tag],
      document_retrieval_strategy: "balanced",
      properties: { max_call_duration: 180, participant_left_timeout: 10 },
    });
    await query(
      `INSERT INTO conversations (id, contact_id, kind, status, conversation_url, greeting, context) VALUES ($1,$2,'eval','active',$3,$4,$5)`,
      [created.conversation_id, caller!.id, created.conversation_url, greeting, context],
    );
    trace({ conversation: created.conversation_id, event: "eval created" });
    return Response.json({ conversationId: created.conversation_id, conversationUrl: created.conversation_url });
  } catch (err) {
    if (isConcurrencyLimit(err)) return Response.json({ error: "Another conversation is still open on Tavus. Wait a moment and retry." }, { status: 409 });
    console.error("[evals] create failed", err);
    return Response.json({ error: "Tavus didn't start the eval conversation." }, { status: 502 });
  }
}
