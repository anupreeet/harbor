import Daily, { type DailyCall } from "@daily-co/daily-js";
import { isComplianceEvent } from "@/components/call/useTavusEvents";
import { parseArgs, runToolViaServer, TOOL_DELIVERY } from "@/lib/call/relay";
import { scoreTurn, type CaseResult, type EvalCase, type ToolCallSeen, type TurnObserved } from "@/lib/evals";

// Runs one eval case the way Tavus's own CLI and evals do: a text-only (chat-mode)
// conversation, joined as a Daily participant with no camera or mic, exchanging
// `conversation.*` app messages. Tool calls are executed for real and answered, so Anna's
// follow-up reply is part of what gets scored.

type TavusEvent = { event_type?: string; inference_id?: string; properties?: Record<string, unknown> };

const SETTLE_MS = 4000; // a turn is over this long after the last reply or tool result
const TURN_TIMEOUT_MS = 75_000;
const READY_TIMEOUT_MS = 90_000;

class Room {
  readonly call: DailyCall;
  private queue: TavusEvent[] = [];
  private wakers: (() => void)[] = [];
  annaHere = false;

  constructor(readonly conversationId: string) {
    this.call = Daily.createCallObject({ subscribeToTracksAutomatically: false, startVideoOff: true, startAudioOff: true });
    this.call.on("app-message", (e) => {
      const m = e?.data as TavusEvent | undefined;
      if (m?.event_type) {
        if (m.event_type === "system.replica_joined") this.annaHere = true;
        this.queue.push(m);
        this.wake();
      }
    });
    this.call.on("participant-joined", (e) => {
      if (e?.participant?.user_id?.includes("tavus-replica")) {
        this.annaHere = true;
        this.wake();
      }
    });
  }

  wake() {
    const w = this.wakers;
    this.wakers = [];
    w.forEach((f) => f());
  }
  wait(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      this.wakers.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  take() {
    return this.queue.shift();
  }
  send(eventType: string, properties: Record<string, unknown>) {
    this.call.sendAppMessage({ message_type: "conversation", event_type: eventType, conversation_id: this.conversationId, properties }, "*");
  }
  async close() {
    await this.call.leave().catch(() => {});
    await this.call.destroy().catch(() => {});
  }
}

async function collectTurn(room: Room): Promise<TurnObserved> {
  const started = performance.now();
  const replies = new Map<string, string>(); // PAL turns arrive twice (pal + replica); keyed by inference
  const tools: ToolCallSeen[] = [];
  const flags: string[] = [];
  let inFlight = 0;
  let last = 0;
  while (performance.now() - started < TURN_TIMEOUT_MS) {
    const ev = room.take();
    if (!ev) {
      if (last && inFlight === 0 && performance.now() - last >= SETTLE_MS) break;
      await room.wait(250);
      continue;
    }
    const p = ev.properties ?? {};
    if (ev.event_type === "conversation.utterance" && (p.role === "pal" || p.role === "replica")) {
      replies.set(String(ev.inference_id ?? replies.size), String(p.speech ?? ""));
      last = performance.now();
    } else if (ev.event_type && isComplianceEvent(ev.event_type)) {
      flags.push(`${ev.event_type}: ${JSON.stringify(p)}`);
      void fetch(`/api/conversations/${room.conversationId}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: ev.event_type, properties: p }),
      }).catch(() => {});
    } else if (ev.event_type === "conversation.tool_call") {
      const name = String(p.name ?? "");
      const id = String(p.tool_call_id ?? "");
      tools.push({ name, args: parseArgs(p.arguments) });
      last = performance.now();
      if (TOOL_DELIVERY[name] === "client") {
        inFlight++;
        void runToolViaServer(room.conversationId, id, name, p.arguments).then((out) => {
          room.send("conversation.tool_result", { tool_call_id: id, name, output: JSON.stringify(out.result.speak), status: out.status });
          inFlight--;
          last = performance.now();
          room.wake();
        });
      }
    }
  }
  return { reply: [...replies.values()].join(" ").trim(), tools, flags, ms: Math.round(performance.now() - started) };
}

export async function runCase(c: EvalCase, onProgress: (r: CaseResult) => void): Promise<CaseResult> {
  const result: CaseResult = { name: c.name, turns: [] };
  const res = await fetch("/api/evals", { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ...result, error: body.error ?? `HTTP ${res.status}` };

  const room = new Room(body.conversationId);
  try {
    await room.call.join({ url: body.conversationUrl, startVideoOff: true, startAudioOff: true });
    const deadline = performance.now() + READY_TIMEOUT_MS;
    while (!room.annaHere && performance.now() < deadline) await room.wait(500);
    if (!room.annaHere) return { ...result, error: "Anna didn't join within 90 seconds" };
    await collectTurn(room); // the fixed greeting; not scored

    for (const spec of c.turns) {
      room.send("conversation.respond", { text: spec.say });
      const seen = await collectTurn(room);
      result.turns.push({ spec, seen, checks: scoreTurn(spec, seen) });
      onProgress({ ...result, turns: [...result.turns] });
    }
    return result;
  } catch (err) {
    return { ...result, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await room.close();
    await fetch(`/api/evals/${body.conversationId}/end`, { method: "POST" }).catch(() => {});
  }
}
