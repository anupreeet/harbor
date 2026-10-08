import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { gateCall } from "@/lib/conversation/gate";
import { buildContext, buildGreeting, TOPICS, type Topic } from "@/lib/conversation/script";
import { loadFile, touchContact } from "@/lib/crm";
import { query, queryOne } from "@/lib/db";
import { timeZoneForState } from "@/lib/integrations/geo";
import { createConversation, isConcurrencyLimit } from "@/lib/tavus/client";
import { palId } from "@/lib/tavus/ids";
import { trace } from "@/lib/tools/run";
import knowledge from "@/agent/knowledge.json";

// The billing boundary: a Tavus conversation is billed from this request until it ends, so
// this route owns the caps, the compliance greeting and the hard duration limit. The browser
// calls it only when the person presses Join, after their camera check.

const Body = z.object({ topic: z.enum(Object.keys(TOPICS) as [Topic, ...Topic[]]).nullish() });

// 4.5 minutes by default: inside the free tier's 5-minute cap, with room for Tavus to wind down.
const MAX_CALL_SECONDS = Number(process.env.MAX_CALL_SECONDS ?? 270);

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });

  const pal = palId();
  if (!pal || !process.env.TAVUS_API_KEY) {
    // In development, say exactly what's missing; customers just see that calls aren't available.
    const missing = !process.env.TAVUS_API_KEY ? "TAVUS_API_KEY is empty in .env.local" : "Anna isn't created yet: run npm run agent:sync";
    const error = process.env.NODE_ENV === "production" ? "Video calls aren't set up on this server yet." : `Video calls aren't set up yet: ${missing}.`;
    return Response.json({ error }, { status: 503 });
  }
  const gate = await gateCall(user.id);
  if (!gate.ok) return Response.json({ error: gate.reason }, { status: gate.status });

  const returning = (await queryOne(`SELECT 1 FROM conversations WHERE contact_id = $1 LIMIT 1`, [user.id])) !== null;
  const greeting = buildGreeting({ firstName: user.first_name, returning });
  const context = buildContext({
    now: new Date(),
    timeZone: timeZoneForState(user.state ?? ""),
    firstName: user.first_name,
    city: user.city,
    state: user.state,
    countyName: user.county_name,
    topic: parsed.data.topic ?? null,
    file: returning ? await loadFile(user) : null,
  });

  try {
    const created = await createConversation({
      pal_id: pal,
      conversation_name: `Harbor · ${user.first_name}`,
      custom_greeting: greeting,
      conversational_context: context,
      // Tavus memory: one store per caller, pseudonymous (our contact id, never the email).
      participant_tags: [`harbor-${user.id}`],
      // Official Medicare.gov pages for general questions (agent/knowledge.json).
      document_tags: [knowledge.tag],
      document_retrieval_strategy: "balanced",
      properties: {
        max_call_duration: MAX_CALL_SECONDS,
        participant_left_timeout: 10,
        participant_absent_timeout: 45,
        enable_closed_captions: true,
      },
    });
    await query(
      `INSERT INTO conversations (id, contact_id, status, conversation_url, topic, greeting, context) VALUES ($1,$2,'active',$3,$4,$5,$6)`,
      [created.conversation_id, user.id, created.conversation_url, parsed.data.topic ?? null, greeting, context],
    );
    await touchContact(user.id);
    trace({ conversation: created.conversation_id, event: "call created", topic: parsed.data.topic ?? null, returning });
    return Response.json({
      conversationId: created.conversation_id,
      conversationUrl: created.conversation_url,
      maxCallSeconds: MAX_CALL_SECONDS,
    });
  } catch (err) {
    if (isConcurrencyLimit(err)) {
      return Response.json({ error: "Anna is with another caller right now. Please try again in a few minutes." }, { status: 409 });
    }
    console.error("[conversations] create failed", err);
    return Response.json({ error: "We couldn't start the video call. Please try again." }, { status: 502 });
  }
}
