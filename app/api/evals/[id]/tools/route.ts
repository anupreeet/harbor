import { currentUser, isAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

// Tool calls our server ran for an eval conversation. Tavus calls server-delivered tools
// (booking, preferences) directly, so the eval runner in the browser never sees them on the
// data channel; it reads them from the ledger instead.
export async function GET(_request: Request, ctx: RouteContext<"/api/evals/[id]/tools">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user || !isAdmin(user.email)) return Response.json({ error: "Admins only." }, { status: 403 });
  const calls = await query<{ tool_call_id: string; name: string; args: Record<string, unknown> | null }>(
    `SELECT t.tool_call_id, t.name, t.args FROM tool_calls t JOIN conversations c ON c.id = t.conversation_id
      WHERE t.conversation_id = $1 AND c.kind = 'eval' ORDER BY t.created_at`,
    [id],
  );
  return Response.json({ calls });
}
