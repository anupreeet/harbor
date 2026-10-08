import { BookOpen, Brain, Power, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TavusActivity, TavusMoment } from "@/lib/admin";
import { cn } from "@/lib/utils";

// What happened inside Tavus during one conversation, from its post-call record: knowledge-base
// retrievals (RAG), its memory tool and memory saving, any built-in tools, and how the room closed.
// Our own tools are in the agent trace; this is everything that never touched our server.

const ICONS: Record<TavusMoment["kind"], typeof BookOpen> = { knowledge: BookOpen, memory: Brain, tool: Wrench, room: Power };

const clock = (s: number | null) => (s === null ? "after" : `+${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`);

function Stat({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Expand({ summary, body }: { summary: string; body: string }) {
  return (
    <details className="mt-1 text-[11px]">
      <summary className="cursor-pointer text-muted-foreground">{summary}</summary>
      <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap">{body}</pre>
    </details>
  );
}

export function TavusSide({ activity, ended }: { activity: TavusActivity | null; ended: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inside Tavus</CardTitle>
        <CardDescription>
          {activity
            ? "From Tavus's own record of the conversation: knowledge base, memory, its built-in tools and how the room closed."
            : ended
              ? "Tavus's record isn't available yet. It arrives a minute or two after the call (and needs TAVUS_API_KEY on this server)."
              : "Tavus's record of knowledge-base retrievals, memory and built-in tools arrives once the conversation ends."}
        </CardDescription>
      </CardHeader>
      {activity ? (
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Knowledge base" value={activity.counts.retrievals} detail={`retrievals, ${activity.documents.length} documents attached`} />
            <Stat
              label="Memory"
              value={activity.counts.memoryLookups}
              detail={activity.memorySaved ? "lookups, saved after the call" : "lookups, nothing saved"}
            />
            <Stat label="Tavus tools" value={activity.counts.builtInTools} detail="built-in calls besides ours and memory" />
          </div>

          {activity.moments.length ? (
            <ol className="space-y-3">
              {activity.moments.map((m, i) => {
                const Icon = ICONS[m.kind];
                return (
                  <li key={i} className="grid grid-cols-[3rem_auto_minmax(0,1fr)] gap-x-2 text-sm">
                    <span className="pt-0.5 font-mono text-xs text-muted-foreground">{clock(m.at)}</span>
                    <Icon className={cn("mt-0.5 size-4", m.kind === "room" ? "text-muted-foreground" : "text-primary")} />
                    <div className="min-w-0">
                      <p className="font-medium">{m.label}</p>
                      {m.detail ? <p className="font-mono text-[11px] break-all text-muted-foreground">{m.detail}</p> : null}
                      {m.body ? <Expand summary={m.kind === "knowledge" ? "What the LLM was given" : "Result"} body={m.body} /> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {activity.documents.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Knowledge-base documents attached ({activity.documents.length})</summary>
              <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                {activity.documents.map((d) => <li key={d}>{d}</li>)}
              </ul>
            </details>
          ) : null}

          {activity.system.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">What Tavus put in front of the LLM ({activity.system.length} system messages)</summary>
              <div className="mt-2 space-y-2">
                {activity.system.map((s, i) => (
                  <pre key={i} className="max-h-72 overflow-auto rounded-md bg-muted p-2 text-[11px] whitespace-pre-wrap">
                    <span className="text-muted-foreground">{clock(s.at)} </span>
                    {s.text}
                  </pre>
                ))}
              </div>
            </details>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
