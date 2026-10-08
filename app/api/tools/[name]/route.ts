import { z } from "zod";
import { currentUser, isAdmin } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { runTool } from "@/lib/tools/run";

// Client-delivered tools: Tavus sends `conversation.tool_call` over the call's data channel,
// the browser relays it here, then returns our `speak` payload as `conversation.tool_result`
// and renders the `card`. runTool refuses anything that isn't a client tool.

const Body = z.object({
  conversationId: z.string().min(1).max(100),
  toolCallId: z.string().min(1).max(200),
  arguments: z.unknown(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/tools/[name]">) {
  const { name } = await ctx.params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });

  // Only the person on the call can run lookups for it (or an admin running an eval).
  const owns = await queryOne(
    `SELECT 1 FROM conversations WHERE id = $1 AND (contact_id = $2 OR (kind = 'eval' AND $3))`,
    [parsed.data.conversationId, user.id, isAdmin(user.email)],
  );
  if (!owns) return Response.json({ error: "Not found." }, { status: 404 });

  const out = await runTool({
    name,
    toolCallId: parsed.data.toolCallId,
    conversationId: parsed.data.conversationId,
    rawArgs: parsed.data.arguments,
    channel: "client",
  });
  return Response.json(out);
}
