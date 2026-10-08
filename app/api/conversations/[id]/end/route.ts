import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { advanceDeal } from "@/lib/crm";
import { query, queryOne } from "@/lib/db";
import { loadRecord, titleFor } from "@/lib/record";
import { endConversation } from "@/lib/tavus/client";
import { trace } from "@/lib/tools/run";

// Ends the call and saves its transcript. Also the target of the page-unload beacon, which
// sends no transcript, so every field is optional and repeat calls are harmless: Tavus bills
// until the room closes, so we end eagerly and often.

const Body = z.object({
  reason: z.string().max(40).optional(),
  transcript: z.array(z.object({ role: z.enum(["pal", "user"]), text: z.string().max(4000) })).max(500).optional(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[id]/end">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const convo = await queryOne<{ status: string }>(`SELECT status FROM conversations WHERE id = $1 AND contact_id = $2`, [id, user.id]);
  if (!convo) return Response.json({ error: "Not found." }, { status: 404 });

  const raw = await request.text();
  const body = Body.safeParse(raw ? JSON.parse(raw) : {});
  const { reason = "left", transcript } = body.success ? body.data : {};

  if (convo.status !== "ended") {
    try {
      await endConversation(id);
    } catch (err) {
      console.error("[end] Tavus end failed", err);
    }
  }

  const record = await loadRecord(id, user.id);
  await query(
    `UPDATE conversations SET status = 'ended', ended_at = COALESCE(ended_at, now()), end_reason = COALESCE(end_reason, $2),
       transcript = COALESCE($3, transcript), title = $4 WHERE id = $1`,
    [id, reason, transcript?.length ? JSON.stringify(transcript) : null, titleFor(record?.cards ?? [])],
  );
  // Anything verified makes them a qualified lead for the advisors (booking already moved them further).
  if (record?.cards.length) await advanceDeal(user.id, "qualified");
  trace({ conversation: id, event: "call ended", reason, lines: transcript?.length ?? 0, lookups: record?.lookups ?? 0 });
  return Response.json({ ok: true });
}
