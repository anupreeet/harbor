"use client";

import { Check, ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Activity, Line } from "@/lib/call/session";
import { TOOL_SOURCES } from "@/lib/tool-catalog";
import { cn } from "@/lib/utils";

// The conversation as a chat: what was said, interleaved with what Anna looked up. Each
// lookup expands to show the tool, its arguments, where the data came from, and how long it took.

export function Bubble({ role, text, name }: { role: "pal" | "user"; text: string; name: string }) {
  const mine = role === "user";
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted")}>
        <span className="sr-only">{mine ? name : "Anna"}: </span>
        {text}
      </div>
    </li>
  );
}

function ToolRow({ a, onOpen }: { a: Activity; onOpen?: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const Icon = !a.done ? Loader2 : a.failed ? CircleAlert : Check;
  return (
    <li>
      <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card text-xs">
        <div className="flex items-center gap-2 px-2.5 py-2">
          <Icon className={cn("size-3.5 shrink-0", !a.done && "animate-spin text-muted-foreground", a.done && !a.failed && "text-primary", a.failed && "text-destructive")} />
          <span className="min-w-0 flex-1 truncate">{a.done ? (a.summary ?? a.label) : `${a.label}…`}</span>
          {a.itemKey && onOpen ? (
            <Button size="xs" variant="ghost" className="text-primary" onClick={() => onOpen(a.itemKey!)}>
              View
            </Button>
          ) : null}
          <CollapsibleTrigger asChild>
            <Button size="icon-xs" variant="ghost" aria-label={open ? "Hide details" : "Show details"}>
              <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="space-y-1.5 border-t px-2.5 py-2 text-muted-foreground">
          <p>
            <span className="font-mono text-foreground">{a.name}</span>
            {a.ms !== undefined ? ` · ${(a.ms / 1000).toFixed(1)} s` : ""}
          </p>
          {Object.keys(a.args).length ? <p className="font-mono break-all">{JSON.stringify(a.args)}</p> : null}
          <ul className="list-inside list-disc">
            {(TOOL_SOURCES[a.name] ?? []).map((s) => <li key={s}>{s}</li>)}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export function Timeline({ lines, activity, name, onOpen }: { lines: Line[]; activity: Activity[]; name: string; onOpen?: (key: string) => void }) {
  const rows = [
    ...lines.map((l) => ({ at: l.at, node: <Bubble key={`l-${l.id}`} role={l.role} text={l.text} name={name} /> })),
    ...activity.map((a) => ({ at: a.at, node: <ToolRow key={`a-${a.id}`} a={a} onOpen={onOpen} /> })),
  ].sort((x, y) => x.at - y.at);
  return <ol className="space-y-2.5">{rows.map((r) => r.node)}</ol>;
}
