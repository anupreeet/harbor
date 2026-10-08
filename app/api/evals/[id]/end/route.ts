import { currentUser, isAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { endConversation } from "@/lib/tavus/client";

export async function POST(_request: Request, ctx: RouteContext<"/api/evals/[id]/end">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user || !isAdmin(user.email)) return Response.json({ error: "Admins only." }, { status: 403 });
  try {
    await endConversation(id);
  } catch (err) {
    console.error("[evals] end failed", err);
  }
  await query(`UPDATE conversations SET status = 'ended', ended_at = COALESCE(ended_at, now()) WHERE id = $1 AND kind = 'eval'`, [id]);
  return Response.json({ ok: true });
}
