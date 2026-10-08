"use client";

import { Check, CircleDashed, X } from "lucide-react";
import type { Activity } from "@/lib/call/session";

// A pasted test script: each line is sent to Anna once she's finished answering the last one.
// "I take Eliquis -> check_drug" also says which tool should fire; "-> none" means no tool.

export type ScriptStep = { text: string; expect?: string };
export type Script = { steps: ScriptStep[]; sentAt: number[] };

export function parseScript(text: string): ScriptStep[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [say, expect] = line.split(/\s*->\s*/);
      return { text: say, expect: expect?.trim() || undefined };
    });
}

// Tools that started between this line being sent and the next one.
export function toolsPerStep(script: Script, activity: Activity[]): string[][] {
  return script.sentAt.map((at, i) => {
    const until = script.sentAt[i + 1] ?? Infinity;
    return activity.filter((a) => a.at >= at && a.at < until).map((a) => a.name);
  });
}

export function TestScriptPanel({ script, activity }: { script: Script; activity: Activity[] }) {
  const got = toolsPerStep(script, activity);
  const verdicts = script.steps.map((s, i) => {
    if (i >= script.sentAt.length || !s.expect) return null;
    const tools = got[i] ?? [];
    return s.expect === "none" ? tools.length === 0 : tools.includes(s.expect);
  });
  const judged = verdicts.filter((v) => v !== null);
  return (
    <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-xs">
      <p className="mb-2 flex items-center justify-between font-medium">
        <span>Test script · {script.sentAt.length} of {script.steps.length} sent</span>
        {judged.length ? <span className="text-muted-foreground">{judged.filter(Boolean).length}/{judged.length} right tool</span> : null}
      </p>
      <ol className="space-y-1.5">
        {script.steps.map((s, i) => {
          const v = verdicts[i];
          const Icon = v === true ? Check : v === false ? X : CircleDashed;
          return (
            <li key={i} className="flex gap-2">
              <Icon className={v === true ? "size-3.5 shrink-0 text-primary" : v === false ? "size-3.5 shrink-0 text-destructive" : "size-3.5 shrink-0 text-muted-foreground"} />
              <span className="min-w-0">
                <span className={i < script.sentAt.length ? "" : "text-muted-foreground"}>{s.text}</span>
                {s.expect || got[i]?.length ? (
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {s.expect ? `expect ${s.expect}` : ""}
                    {i < script.sentAt.length ? ` · got ${got[i]?.length ? got[i].join(", ") : "no tool"}` : ""}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
