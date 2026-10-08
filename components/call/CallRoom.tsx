"use client";

import { useDaily, useDailyEvent } from "@daily-co/daily-react";
import { ArrowUp, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { CVIProvider } from "@/app/components/cvi/components/cvi-provider";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { callReducer, initialCallState } from "@/lib/call/session";
import { TOOL_LABELS } from "@/lib/tool-catalog";
import type { BookingCard } from "@/lib/tools/cards";
import { Canvas } from "./Canvas";
import { PreJoin } from "./PreJoin";
import { Stage } from "./Stage";
import { parseScript, TestScriptPanel, type Script } from "./TestScript";
import { Timeline } from "./Timeline";
import { useTavusEvents } from "./useTavusEvents";

type Session = { conversationId: string; conversationUrl: string; maxCallSeconds: number };

export function CallRoom({ topic, topicLabel, firstName }: { topic: string | null; topicLabel: string | null; firstName: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Tavus conversation (and its billing) starts here, when the person presses Join.
  const join = async () => {
    setJoining(true);
    setError(null);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(body.error ?? "We couldn't start the call. Check your connection and try again.");
      setJoining(false);
      return;
    }
    setSession(body as Session);
  };

  return (
    <CVIProvider>
      {session ? (
        <LiveCall session={session} firstName={firstName} />
      ) : (
        <>
          <PageHeader title="New call" />
          <PreJoin topic={topicLabel} joining={joining} error={error} onJoin={join} />
        </>
      )}
    </CVIProvider>
  );
}

function LiveCall({ session, firstName }: { session: Session; firstName: string }) {
  const router = useRouter();
  const { conversationId: id, conversationUrl, maxCallSeconds } = session;
  const [state, dispatch] = useReducer(callReducer, initialCallState);
  const daily = useDaily();
  // Test scripts: the next line goes out once Anna has finished answering and no lookup is running.
  const [script, setScript] = useState<Script | null>(null);
  const scriptRef = useRef<Script | null>(null);
  const busyRef = useRef(false);
  const sendTimer = useRef<number | null>(null);
  const respondRef = useRef<(text: string) => void>(() => {});
  const sendNext = useCallback(() => {
    sendTimer.current = null;
    const s = scriptRef.current;
    if (!s || s.sentAt.length >= s.steps.length) return;
    const next = { ...s, sentAt: [...s.sentAt, Date.now()] };
    scriptRef.current = next;
    setScript(next);
    respondRef.current(s.steps[s.sentAt.length].text);
  }, []);
  const onAnnaDone = useCallback(() => {
    if (!scriptRef.current || busyRef.current || sendTimer.current !== null) return;
    sendTimer.current = window.setTimeout(sendNext, 1500);
  }, [sendNext]);
  // Guardrail and objective events: kept on the call's trace; a fired guardrail also shows in the chat.
  const onCompliance = useCallback(
    (type: string, properties: Record<string, unknown>) => {
      void fetch(`/api/conversations/${id}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, properties }),
      }).catch(() => {});
      if (/guardrail/i.test(type)) {
        const name = String(properties.guardrail ?? properties.guardrail_name ?? properties.name ?? "a guardrail");
        dispatch({ type: "flag", id: `${type}-${Date.now()}`, label: `Compliance flag: ${name}` });
      }
    },
    [id],
  );
  const respond = useTavusEvents(id, dispatch, onAnnaDone, onCompliance);
  useEffect(() => {
    respondRef.current = respond;
    busyRef.current = state.activity.some((a) => !a.done);
  }, [respond, state.activity]);
  const send = (text: string) => {
    const steps = parseScript(text);
    if (steps.length > 1) {
      scriptRef.current = { steps, sentAt: [] };
      sendNext();
    } else if (steps[0]) {
      respond(steps[0].text);
    }
  };
  // The canvas follows the newest result unless the person picked a tab more recently, and
  // stays shut after they close it until something new arrives.
  const [picked, setPicked] = useState<{ key: string; at: number }>({ key: "", at: 0 });
  const [closedAt, setClosedAt] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The latest transcript, readable from event handlers (unload beacon, end).
  const transcriptRef = useRef<{ role: "pal" | "user"; text: string }[]>([]);
  useEffect(() => {
    transcriptRef.current = state.lines.map(({ role, text }) => ({ role, text }));
  }, [state.lines]);

  // Every exit path ends the conversation server-side: Tavus bills until the room closes.
  // `showRecord` is false when the person navigated somewhere else mid-call.
  const ended = useRef(false);
  const endCall = useCallback(
    (reason: string, showRecord = true) => {
      if (ended.current) return;
      ended.current = true;
      dispatch({ type: "ended" });
      void daily?.leave();
      fetch(`/api/conversations/${id}/end`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, transcript: transcriptRef.current }),
        keepalive: true,
      })
        .catch(() => {})
        .finally(() => {
          if (showRecord) router.push(`/app/c/${id}`);
          router.refresh(); // the sidebar lists the finished call
        });
    },
    [daily, id, router],
  );
  const endCallRef = useRef(endCall);
  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  // Join once. React's development mode mounts, unmounts and remounts every component; leaving
  // on that fake unmount used to drop the call, so the leave is deferred a tick and the remount
  // cancels it. A real unmount (navigating away mid-call) still ends the call.
  const pendingEnd = useRef<number | null>(null);
  useEffect(() => {
    if (!daily) return;
    if (pendingEnd.current !== null) {
      clearTimeout(pendingEnd.current);
      pendingEnd.current = null;
    }
    const state = daily.meetingState();
    if (state !== "joining-meeting" && state !== "joined-meeting") {
      daily
        .join({ url: conversationUrl, inputSettings: { audio: { processor: { type: "none" } } } })
        .catch(() => endCallRef.current("join_failed"));
    }
    return () => {
      pendingEnd.current = window.setTimeout(() => endCallRef.current("left_page", false), 0);
    };
  }, [daily, conversationUrl]);

  useEffect(() => {
    const onHide = () => {
      if (ended.current) return;
      const body = JSON.stringify({ reason: "tab_closed", transcript: transcriptRef.current });
      navigator.sendBeacon(`/api/conversations/${id}/end`, new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [id]);

  // The clock starts when Anna joins the room; when she leaves (she can end the call, or
  // Tavus's hard cap does), the call is over.
  const isAnna = (p?: { user_id?: string }) => !!p?.user_id?.includes("tavus-replica");
  useDailyEvent(
    "participant-joined",
    useCallback((ev: { participant?: { user_id?: string } }) => {
      if (isAnna(ev.participant)) setStartedAt((t) => t ?? Date.now());
    }, []),
  );
  // If Anna was in the room before us, there's no participant-joined for her.
  useDailyEvent(
    "joined-meeting",
    useCallback((ev: { participants?: Record<string, { user_id?: string }> }) => {
      if (Object.values(ev.participants ?? {}).some(isAnna)) setStartedAt((t) => t ?? Date.now());
    }, []),
  );
  useDailyEvent(
    "participant-left",
    useCallback((ev: { participant?: { user_id?: string } }) => {
      if (isAnna(ev.participant)) endCall("anna_left");
    }, [endCall]),
  );
  useDailyEvent("error", useCallback(() => endCall("error"), [endCall]));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = startedAt === null ? null : Math.max(0, maxCallSeconds - Math.floor((now - startedAt) / 1000));
  useEffect(() => {
    if (remaining === 0) endCall("time_limit");
  }, [remaining, endCall]);

  // Server-side tools (booking, preferences) are called by Tavus directly; poll for the booking.
  const seenBooking = useRef<string | null>(null);
  useEffect(() => {
    const t = setInterval(async () => {
      const body = await fetch(`/api/conversations/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const b = body?.booking as BookingCard["data"] | null;
      if (b && `${b.bookingId}${b.when}` !== seenBooking.current) {
        seenBooking.current = `${b.bookingId}${b.when}`;
        dispatch({ type: "tool_finished", name: "book_advisor_call", card: { kind: "booking", data: b } });
        toast.success(`Booked with ${b.advisor}`, { description: b.when ?? undefined });
      }
    }, 3500);
    return () => clearInterval(t);
  }, [id]);

  const latest = state.items[0];
  const canvasOpen = !!latest && Math.max(latest.at, picked.at) > closedAt;
  const activeKey = latest && picked.at > latest.at ? picked.key : (latest?.key ?? "");
  const show = (key: string) => setPicked({ key, at: Date.now() });
  // A tapped choice: open its view right away if we already have it, and tell Anna either way.
  const ask = (text: string, open?: string) => {
    const item = open ? state.items.find((i) => i.key === open || i.kind === open) : undefined;
    if (item) show(item.key);
    respond(text);
  };
  const clock = remaining === null ? null : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <>
      <PageHeader title="Call with Anna">
        <Badge variant="destructive" className="gap-1.5">
          <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden /> Live
        </Badge>
        {clock ? (
          <Badge variant="outline" className="gap-1 font-mono tabular-nums" aria-label={`${clock} left in this call`}>
            <Clock className="size-3" /> {clock}
          </Badge>
        ) : null}
      </PageHeader>
      <div className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="h-[58svh] min-h-0 lg:h-full">
          <Stage
            speaking={state.speaking}
            onEnd={() => endCall("ended_by_caller")}
            canvas={
              canvasOpen ? (
                <Canvas items={state.items} activeKey={activeKey} onSelect={show} onClose={() => setClosedAt(Date.now())} onAsk={ask} />
              ) : null
            }
          />
        </div>

        <section className="flex min-h-0 flex-col rounded-xl border bg-card" aria-label="Conversation">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-medium">Conversation</h2>
            {state.activity.length ? (
              <span className="text-xs text-muted-foreground">
                {state.activity.length} {state.activity.length === 1 ? "lookup" : "lookups"}
              </span>
            ) : null}
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4" aria-live="polite">
              {script ? <TestScriptPanel script={script} activity={state.activity} /> : null}
              {state.lines.length || state.activity.length ? (
                <Timeline lines={state.lines} activity={state.activity} name={firstName} onOpen={show} />
              ) : (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>What you and Anna say appears here, with every lookup she makes. Things she can do:</p>
                  <ul className="space-y-1.5">
                    {Object.values(TOOL_LABELS).map((t) => (
                      <li key={t.title}>
                        <span className="font-medium text-foreground">{t.title}.</span> {t.what}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>
          <Composer onSend={send} disabled={state.ended} />
        </section>
      </div>
    </>
  );
}

function Composer({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };
  return (
    <form
      className="flex items-end gap-2 border-t p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
        rows={1}
        placeholder="Type to Anna, or paste a test script (one line per turn)"
        aria-label="Type a message to Anna"
        className="max-h-40 min-h-10 resize-none rounded-2xl"
      />
      <Button type="submit" size="icon-lg" className="shrink-0 rounded-full" disabled={disabled || !text.trim()} aria-label="Send">
        <ArrowUp />
      </Button>
    </form>
  );
}
