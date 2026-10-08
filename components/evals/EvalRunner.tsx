"use client";

import { Check, ChevronRight, Download, Loader2, Play, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { summarize, toMarkdown, type CaseResult, type EvalCase } from "@/lib/evals";
import { cn } from "@/lib/utils";
import { runCase } from "./runCase";

type Status = "idle" | "running" | "pass" | "fail";

export function EvalRunner({ cases }: { cases: EvalCase[] }) {
  const [results, setResults] = useState<Record<string, CaseResult>>({});
  const [running, setRunning] = useState<string | null>(null);

  const status = (name: string): Status => {
    if (running === name) return "running";
    const r = results[name];
    if (!r) return "idle";
    return !r.error && r.turns.length > 0 && r.turns.every((t) => t.checks.every((c) => c.ok)) ? "pass" : "fail";
  };

  // Cases run one at a time: one open Tavus conversation at a time, and one Daily call per page.
  const run = async (list: EvalCase[]) => {
    for (const c of list) {
      setRunning(c.name);
      const r = await runCase(c, (partial) => setResults((prev) => ({ ...prev, [c.name]: partial })));
      setResults((prev) => ({ ...prev, [c.name]: r }));
    }
    setRunning(null);
  };

  const done = cases.map((c) => results[c.name]).filter((r): r is CaseResult => !!r);
  const s = summarize(done);

  const download = () => {
    const blob = new Blob([toMarkdown(done, new Date())], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `harbor-eval-${new Date().toISOString().slice(0, 16)}.md`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Agent evals</CardTitle>
          <CardDescription>
            Each case is a fresh text-only conversation with the live agent on Tavus, as a new test caller in Chicago, with real
            tools. Checks: the right tools, the right arguments, and what Anna must or must never say. Each case is billed by
            Tavus like a short call (about 30–60 seconds).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={() => run(cases)} disabled={!!running}>
            {running ? <Loader2 className="animate-spin" /> : <Play />} Run all {cases.length}
          </Button>
          <Button variant="outline" onClick={download} disabled={!done.length || !!running}>
            <Download /> Download report
          </Button>
          {done.length ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant={s.passed === s.cases ? "default" : "secondary"}>{s.passed}/{s.cases} cases passed</Badge>
              <Badge variant="secondary">{s.checksPassed}/{s.checks} checks</Badge>
              {s.toolAccuracy !== null ? <Badge variant="secondary">Tool-call accuracy {Math.round(s.toolAccuracy * 100)}%</Badge> : null}
              {s.avgTurnSeconds !== null ? <Badge variant="secondary">Avg turn {s.avgTurnSeconds.toFixed(1)} s</Badge> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {cases.map((c) => (
          <CaseRow key={c.name} c={c} result={results[c.name]} status={status(c.name)} disabled={!!running} onRun={() => run([c])} />
        ))}
      </div>
    </div>
  );
}

function CaseRow({ c, result, status, disabled, onRun }: { c: EvalCase; result?: CaseResult; status: Status; disabled: boolean; onRun: () => void }) {
  const [open, setOpen] = useState(false);
  const Icon = status === "pass" ? Check : status === "fail" ? X : status === "running" ? Loader2 : ChevronRight;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon className={cn("size-4 shrink-0", status === "pass" && "text-primary", status === "fail" && "text-destructive", status === "running" && "animate-spin", status === "idle" && "text-muted-foreground")} />
        <CollapsibleTrigger className="min-w-0 flex-1 text-left text-sm font-medium">{c.name}</CollapsibleTrigger>
        {result ? (
          <span className="text-xs text-muted-foreground">
            {result.turns.flatMap((t) => t.checks).filter((x) => x.ok).length}/{result.turns.flatMap((t) => t.checks).length} checks
          </span>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onRun} disabled={disabled}>Run</Button>
      </div>
      <CollapsibleContent className="space-y-4 border-t px-4 py-3 text-sm">
        {result?.error ? <p className="text-destructive">Error: {result.error}</p> : null}
        {c.turns.map((spec, i) => {
          const t = result?.turns[i];
          return (
            <div key={i} className="space-y-2">
              <p><span className="text-muted-foreground">Caller: </span>{spec.say}</p>
              {t ? (
                <>
                  <p><span className="text-muted-foreground">Anna: </span>{t.seen.reply || "(no reply)"}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    tools: {t.seen.tools.map((x) => `${x.name}(${JSON.stringify(x.args)})`).join(", ") || "none"} · {(t.seen.ms / 1000).toFixed(1)} s
                  </p>
                  <ul className="space-y-1">
                    {t.checks.map((ch) => (
                      <li key={ch.label} className="flex items-start gap-2">
                        {ch.ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-primary" /> : <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
                        <span>{ch.label}{ch.detail ? <span className="text-muted-foreground"> ({ch.detail})</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Expects {spec.expect_tools ? (spec.expect_tools.length ? spec.expect_tools.join(", ") : "no tool") : "any tools"}
                  {spec.say_none?.length ? `; never says ${spec.say_none.map((w) => `"${w}"`).join(", ")}` : ""}
                </p>
              )}
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
