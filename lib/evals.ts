// Scoring for agent evals (evals/cases.json). Pure functions: the Evals page collects what Anna
// said and which tools she called in each turn; these decide pass or fail, check by check.

export type TurnSpec = {
  say: string;
  expect_tools?: string[];
  expect_args?: Record<string, Record<string, string>>;
  say_any?: string[];
  say_none?: string[];
};
export type EvalCase = { name: string; zip?: string; turns: TurnSpec[] }; // zip: where the synthetic caller lives (default Chicago)
export type ToolCallSeen = { name: string; args: Record<string, unknown> };
// `flags`: guardrail/objective events Tavus sent during the turn.
export type TurnObserved = { reply: string; tools: ToolCallSeen[]; ms: number; flags?: string[] };
export type Check = { label: string; ok: boolean; detail?: string };

const has = (text: string, needle: string) => text.toLowerCase().includes(needle.toLowerCase());

export function scoreTurn(spec: TurnSpec, seen: TurnObserved): Check[] {
  const checks: Check[] = [];
  const called = seen.tools.map((t) => t.name);

  if (spec.expect_tools) {
    if (spec.expect_tools.length === 0) {
      checks.push({ label: "Calls no tool", ok: called.length === 0, detail: called.length ? `called ${called.join(", ")}` : undefined });
    } else {
      // Each expected tool must appear at least as many times as listed; order isn't required
      // (Tavus may fire them in parallel).
      const want = countBy(spec.expect_tools);
      const got = countBy(called);
      for (const [name, n] of Object.entries(want)) {
        const ok = (got[name] ?? 0) >= n;
        checks.push({ label: `Calls ${name}${n > 1 ? ` ×${n}` : ""}`, ok, detail: ok ? undefined : `called ${called.join(", ") || "nothing"}` });
      }
      const extra = called.filter((c) => !want[c]);
      if (extra.length) checks.push({ label: "No unexpected tools", ok: false, detail: `also called ${extra.join(", ")}` });
    }
  }

  for (const [tool, args] of Object.entries(spec.expect_args ?? {})) {
    const calls = seen.tools.filter((t) => t.name === tool);
    for (const [key, value] of Object.entries(args)) {
      const ok = calls.some((c) => typeof c.args[key] === "string" && has(c.args[key] as string, value));
      checks.push({ label: `${tool}.${key} = "${value}"`, ok, detail: ok ? undefined : `got ${calls.map((c) => JSON.stringify(c.args)).join("; ") || "no call"}` });
    }
  }

  if (spec.say_any?.length) {
    const ok = spec.say_any.some((w) => has(seen.reply, w));
    checks.push({ label: `Mentions ${spec.say_any.map((w) => `"${w}"`).join(" or ")}`, ok });
  }
  for (const w of spec.say_none ?? []) {
    checks.push({ label: `Never says "${w}"`, ok: !has(seen.reply, w) });
  }
  // Tavus's own guardrails run on every turn; one firing fails the turn whatever else passed.
  const fired = (seen.flags ?? []).filter((f) => /guardrail/i.test(f));
  checks.push({ label: "No guardrail fired", ok: fired.length === 0, detail: fired.length ? fired.join("; ") : undefined });
  return checks;
}

function countBy(list: string[]): Record<string, number> {
  return list.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});
}

export type CaseResult = { name: string; turns: { spec: TurnSpec; seen: TurnObserved; checks: Check[] }[]; error?: string };

export function summarize(results: CaseResult[]) {
  const checks = results.flatMap((r) => r.turns.flatMap((t) => t.checks));
  const toolChecks = checks.filter((c) => c.label.startsWith("Calls") || c.label.includes(".") || c.label === "No unexpected tools");
  const turns = results.flatMap((r) => r.turns);
  return {
    cases: results.length,
    passed: results.filter((r) => !r.error && r.turns.every((t) => t.checks.every((c) => c.ok))).length,
    checks: checks.length,
    checksPassed: checks.filter((c) => c.ok).length,
    toolAccuracy: toolChecks.length ? toolChecks.filter((c) => c.ok).length / toolChecks.length : null,
    avgTurnSeconds: turns.length ? turns.reduce((s, t) => s + t.seen.ms, 0) / turns.length / 1000 : null,
  };
}

export function toMarkdown(results: CaseResult[], when: Date): string {
  const s = summarize(results);
  const lines = [
    `# Agent eval report`,
    ``,
    `${when.toISOString()} · live PAL in Tavus text-only chat mode, real tools`,
    ``,
    `**${s.passed}/${s.cases} cases passed** · ${s.checksPassed}/${s.checks} checks · tool-call accuracy ${s.toolAccuracy === null ? "n/a" : `${Math.round(s.toolAccuracy * 100)}%`} · average turn ${s.avgTurnSeconds?.toFixed(1) ?? "n/a"} s`,
    ``,
  ];
  for (const r of results) {
    const pass = !r.error && r.turns.every((t) => t.checks.every((c) => c.ok));
    lines.push(`## ${pass ? "✅" : "❌"} ${r.name}`, "");
    if (r.error) lines.push(`Error: ${r.error}`, "");
    for (const t of r.turns) {
      lines.push(`> **Caller:** ${t.spec.say}`, `>`, `> **Anna:** ${t.seen.reply || "(no reply)"}`, ``);
      lines.push(`Tools: ${t.seen.tools.map((x) => `\`${x.name}(${JSON.stringify(x.args)})\``).join(", ") || "none"} · ${(t.seen.ms / 1000).toFixed(1)} s`, ``);
      for (const c of t.checks) lines.push(`- ${c.ok ? "✅" : "❌"} ${c.label}${c.detail ? ` (${c.detail})` : ""}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
