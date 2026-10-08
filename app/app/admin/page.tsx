import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listTraces } from "@/lib/admin";
import { isAdmin, requireUser } from "@/lib/auth";
import { timeZoneForState } from "@/lib/integrations/geo";
import { AdminOnly, duration, KindBadge, StatusBadge, stamp } from "./shared";

export const metadata: Metadata = { title: "Agent traces" };

// Every conversation Anna has had, real calls and evals, newest first: who, how long, how many
// tools ran and how many failed. Each row opens the full trace.
export default async function AgentTracesPage() {
  const user = await requireUser();
  if (!isAdmin(user.email)) return <AdminOnly />;
  const rows = await listTraces();
  const tz = timeZoneForState(user.state ?? "");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Agent traces</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every conversation with Anna, calls and evals, newest first (latest 100). Open one for the transcript, each tool call and
            what Tavus did on its side.
          </p>
        </div>

        {rows.length === 0 ? (
          <Card className="items-center py-12 text-center">
            <CardHeader className="items-center justify-items-center">
              <CardTitle>No conversations yet</CardTitle>
              <CardDescription>Calls and eval runs appear here as soon as they start.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Tool calls</TableHead>
                  <TableHead className="pr-4"><span className="sr-only">Trace</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const when = stamp(r.created_at, tz);
                  const who = r.is_test ? "Eval" : r.first_name;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[16rem] pl-4">
                        <span className="block">{when}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.title ?? (r.is_test ? "Eval run" : "Call with Anna")}</span>
                      </TableCell>
                      <TableCell className="max-w-[14rem]">
                        <span className={r.is_test ? "block text-muted-foreground" : "block"}>{who}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.is_test ? "Synthetic test caller" : r.email}</span>
                      </TableCell>
                      <TableCell><KindBadge kind={r.kind} /></TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} live={r.live} />
                        {r.end_reason ? <span className="mt-0.5 block text-xs text-muted-foreground">{r.end_reason.replace(/_/g, " ")}</span> : null}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.duration_s === null ? "—" : duration(r.duration_s)}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={r.tool_calls ? "font-mono text-xs" : "font-mono text-xs text-muted-foreground"}>{r.tool_calls}</span>
                          {r.failed ? <Badge variant="destructive">{r.failed} failed</Badge> : null}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/app/admin/traces/${r.id}`} aria-label={`Open trace: ${who}, ${when}`}>
                            Trace <ChevronRight />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
