import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// The agent trace for one call: every tool call our server ran (when, arguments, outcome,
// latency, and exactly what Anna was told), checked against Tavus's own list of the tool calls
// its LLM made. A call Tavus made that never reached us shows up as a mismatch.

export type TraceRow = { id: string; tool: string; status: string; args: string; ms: number | null; offsetSeconds: number; told: Record<string, unknown> | null };

const clock = (s: number) => `+${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export type ComplianceEvent = { type: string; properties: Record<string, unknown>; at: string };

export function AgentTrace({ rows, tavus, events }: { rows: TraceRow[]; tavus: { name: string; arguments: string }[] | null; events?: ComplianceEvent[] }) {
  // Match Tavus's calls to ours by tool name and count (argument strings differ in formatting).
  const ours = rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.tool]: (n[r.tool] ?? 0) + 1 }), {});
  const theirs = (tavus ?? []).reduce<Record<string, number>>((n, t) => ({ ...n, [t.name]: (n[t.name] ?? 0) + 1 }), {});
  const missing = Object.entries(theirs).reduce((sum, [name, count]) => sum + Math.max(0, count - (ours[name] ?? 0)), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent trace</CardTitle>
        <CardDescription>
          {rows.length} tool {rows.length === 1 ? "call" : "calls"} ran on our server.
          {tavus === null
            ? " Tavus's own transcript isn't ready yet; it arrives a minute or two after the call."
            : ` Tavus's transcript shows ${tavus.length}${missing ? `, ${missing} of which never reached us (server tools need the deployed URL).` : ", all accounted for."}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {events ? (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">Guardrails and objectives</p>
            {events.length === 0 ? (
              <p className="text-muted-foreground">No guardrail events received on this call. Tavus evaluates all four guardrails on every turn and sends an event when one fires.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {events.map((e, i) => (
                  <li key={i} className={/guardrail/i.test(e.type) ? "text-destructive" : "text-muted-foreground"}>
                    <span className="font-mono text-xs">{e.type}</span> {JSON.stringify(e.properties)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-0">When</TableHead>
                <TableHead>Tool and arguments</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="pr-0 text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="pl-0 font-mono text-xs text-muted-foreground">{clock(r.offsetSeconds)}</TableCell>
                  <TableCell className="max-w-[22rem] whitespace-normal">
                    <span className="font-mono text-xs font-medium">{r.tool}</span>
                    <span className="block font-mono text-[11px] break-all text-muted-foreground">{r.args}</span>
                    {r.told ? (
                      <details className="mt-1 text-[11px]">
                        <summary className="cursor-pointer text-muted-foreground">What Anna was told</summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap">{JSON.stringify(r.told, null, 1)}</pre>
                      </details>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "success" ? "secondary" : "destructive"}>{String(r.told?.status ?? r.status)}</Badge>
                  </TableCell>
                  <TableCell className="pr-0 text-right font-mono text-xs">{r.ms === null ? "—" : `${(r.ms / 1000).toFixed(1)} s`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No tools were called on this call.</p>
        )}
      </CardContent>
    </Card>
  );
}
