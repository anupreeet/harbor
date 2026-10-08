import { z } from "zod";
import { currentUser, isAdmin } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { trace } from "@/lib/tools/run";

// Guardrail and objective events Tavus sent during the call, relayed by the page and kept on
// the conversation for its trace. (In production a callback_url webhook would deliver the same.)
const Body = z.object({ type: z.string().min(1).max(100), properties: z.record(z.string(), z.unknown()) });

export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[id]/events">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });

  const owns = await queryOne(
    `SELECT 1 FROM conversations WHERE id = $1 AND (contact_id = $2 OR (kind = 'eval' AND $3))`,
    [id, user.id, isAdmin(user.email)],
  );
  if (!owns) return Response.json({ error: "Not found." }, { status: 404 });

  const event = { type: parsed.data.type, properties: parsed.data.properties, at: new Date().toISOString() };
  await query(
    `UPDATE conversations SET events = events || $2::jsonb WHERE id = $1 AND jsonb_array_length(events) < 200`,
    [id, JSON.stringify([event])],
  );
  trace({ conversation: id, event: parsed.data.type, properties: parsed.data.properties });
  return Response.json({ ok: true });
}
