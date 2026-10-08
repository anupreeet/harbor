import "server-only";

// Thin client for the Tavus REST API (https://tavusapi.com/v2, `x-api-key` auth).
// Only the calls this app makes; agent config sync has its own client in scripts/.

const BASE = "https://tavusapi.com/v2";

export class TavusError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`Tavus ${status}: ${body.slice(0, 300)}`);
  }
}

export async function tavus<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.TAVUS_API_KEY;
  if (!key) throw new TavusError(500, "TAVUS_API_KEY is not set");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new TavusError(res.status, text);
  return (text ? JSON.parse(text) : null) as T;
}

export type CreatedConversation = { conversation_id: string; conversation_url: string; status: string };

export const createConversation = (params: Record<string, unknown>) =>
  tavus<CreatedConversation>("POST", "/conversations", params);

export async function endConversation(id: string) {
  try {
    await tavus("POST", `/conversations/${id}/end`);
  } catch (err) {
    // Already ended or gone is the outcome we wanted.
    if (!(err instanceof TavusError) || ![400, 404].includes(err.status)) throw err;
  }
}

// Tavus answers a second concurrent conversation with HTTP 400 and this message.
export const isConcurrencyLimit = (err: unknown) =>
  err instanceof TavusError && err.status === 400 && /concurrent/i.test(err.body);

// Tavus's own record of which tools its LLM called, from the post-call transcript (OpenAI-style
// messages). Lets the trace show calls Tavus made that never reached us. Null until it's ready.
type TranscriptMessage = { role: string; tool_calls?: { id?: string; name?: string; arguments?: string; function?: { name?: string; arguments?: string } }[] };

export async function tavusToolCalls(conversationId: string): Promise<{ name: string; arguments: string }[] | null> {
  try {
    const c = await tavus<{ events?: { event_type: string; properties?: { transcript?: TranscriptMessage[] } }[] }>(
      "GET",
      `/conversations/${conversationId}?verbose=true`,
    );
    const transcript = c.events?.find((e) => e.event_type === "application.transcription_ready")?.properties?.transcript;
    if (!transcript) return null;
    // Tavus lists a slow tool call a second time when its result arrives, with an id ending in
    // "_result"; count each call once.
    return transcript.flatMap((m) =>
      (m.tool_calls ?? [])
        .filter((tc) => !tc.id?.endsWith("_result"))
        .map((tc) => ({ name: tc.function?.name ?? tc.name ?? "?", arguments: tc.function?.arguments ?? tc.arguments ?? "" })),
    );
  } catch {
    return null;
  }
}
