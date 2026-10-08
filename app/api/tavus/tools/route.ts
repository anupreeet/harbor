import { runTool } from "@/lib/tools/run";
import { verifySignature } from "@/lib/tavus/hmac";

// Server-delivered tools (and the post-call action): Tavus POSTs a signed envelope here.
// We always answer 200 with something speakable — a non-2xx makes the rep apologise for a
// failure, and a 5xx triggers a retry (which idempotency on tool_call_id absorbs anyway).

type Envelope = { name: string; arguments: string; tool_call_id: string; conversation_id: string };

export async function POST(request: Request) {
  const raw = await request.text(); // raw bytes: the signature covers exactly these
  if (!verifySignature(raw, request.headers.get("x-tavus-signature"), process.env.TAVUS_TOOL_SECRET)) {
    return new Response("bad signature", { status: 401 });
  }

  let env: Envelope;
  try {
    env = JSON.parse(raw);
  } catch {
    return new Response("bad body", { status: 400 });
  }

  const out = await runTool({
    name: env.name,
    toolCallId: env.tool_call_id,
    conversationId: env.conversation_id,
    rawArgs: env.arguments,
    channel: "server",
  });
  return Response.json(out.result.speak);
}
