import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import guardrails from "@/agent/guardrails.json";
import { AgentTrace } from "@/components/call/AgentTrace";
import { Bubble } from "@/components/call/Timeline";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadTavusActivity, loadTrace } from "@/lib/admin";
import { isAdmin, requireUser } from "@/lib/auth";
import { longDate } from "@/lib/format";
import { timeZoneForState } from "@/lib/integrations/geo";
import { billedMinutes, PRICE_PER_MINUTE } from "@/lib/record";
import { AdminOnly, duration, KindBadge, StatusBadge } from "../../shared";
import { TavusSide } from "./TavusSide";

export const metadata: Metadata = { title: "Agent trace" };

// One conversation, any caller's call or an eval: what was said, every tool our server ran (checked
// against Tavus's list), and what Tavus did on its side (knowledge base, memory, built-in tools).
export default async function AdminTracePage({ params }: PageProps<"/app/admin/traces/[id]">) {
  const user = await requireUser();
  if (!isAdmin(user.email)) return <AdminOnly />;
  const { id } = await params;
  const rec = await loadTrace(id);
  if (!rec) notFound();
  const { convo, transcript, trace, failed } = rec;
  // One Tavus fetch serves both the trace's reconciliation and the "Inside Tavus" panel.
  const tavus = convo.status === "ended" ? await loadTavusActivity(convo.id) : null;
  const tz = timeZoneForState(user.state ?? "");
  const who = convo.is_test ? "Eval caller" : convo.first_name;
  // Evals don't save a transcript of ours; Tavus's own covers them.
  const lines = transcript.length ? transcript : (tavus?.lines ?? []);
  const minutes = convo.ended_at ? billedMinutes(new Date(convo.created_at), new Date(convo.ended_at)) : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <div>
            <Button variant="ghost" size="sm" className="-ml-2" asChild>
              <Link href="/app/admin">
                <ArrowLeft /> All traces
              </Link>
            </Button>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{convo.title ?? (convo.is_test ? "Eval run" : "Call with Anna")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {who} · {longDate(convo.created_at, tz)}
            </p>
          </div>

          {convo.live ? (
            <Alert>
              <AlertDescription>This conversation is in progress. Tool calls appear as they run; refresh to update.</AlertDescription>
            </Alert>
          ) : convo.status !== "ended" ? (
            <Alert>
              <AlertDescription>This conversation didn&apos;t finish properly, so there is no transcript or Tavus record. Tool calls that ran are below.</AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
              <CardDescription>{transcript.length ? "Transcribed during the call." : lines.length ? "From Tavus's transcript." : "What was said."}</CardDescription>
            </CardHeader>
            <CardContent>
              {lines.length ? (
                <ol className="space-y-2.5">
                  {lines.map((l, i) => (
                    <Bubble key={i} role={l.role} text={l.text} name={who} />
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">No transcript was saved for this conversation.</p>
              )}
            </CardContent>
          </Card>

          <AgentTrace rows={trace} tavus={tavus?.toolCalls ?? null} events={convo.events} />
          <TavusSide activity={tavus} ended={convo.status === "ended"} />
        </div>

        <aside className="space-y-4" aria-label="Conversation details">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Who</dt>
                <dd className="min-w-0">
                  {convo.is_test ? "Eval" : convo.first_name}
                  <span className="block truncate text-xs text-muted-foreground">{convo.is_test ? "Synthetic test caller" : convo.email}</span>
                </dd>
                <dt className="text-muted-foreground">Kind</dt>
                <dd><KindBadge kind={convo.kind} /></dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={convo.status} live={convo.live} />
                  {convo.end_reason ? <span className="ml-1.5 text-xs text-muted-foreground">{convo.end_reason.replace(/_/g, " ")}</span> : null}
                </dd>
                <dt className="text-muted-foreground">Duration</dt>
                <dd className="font-mono text-xs leading-5">{convo.duration_s === null ? "—" : duration(convo.duration_s)}</dd>
                <dt className="text-muted-foreground">Tool calls</dt>
                <dd>
                  {trace.length}
                  {failed ? <span className="text-destructive"> ({failed} failed)</span> : null}
                </dd>
                {minutes !== null ? (
                  <>
                    <dt className="text-muted-foreground">Billed</dt>
                    <dd>≈ {minutes.toFixed(1)} min (${(minutes * PRICE_PER_MINUTE).toFixed(2)})</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Tavus ID</dt>
                <dd className="font-mono text-xs leading-5 break-all">{convo.id}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What we sent Tavus</CardTitle>
              <CardDescription>Set at conversation create.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <details className="text-sm">
                <summary className="cursor-pointer">Greeting <span className="text-muted-foreground">(spoken verbatim)</span></summary>
                <p className="mt-1.5 rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{convo.greeting}</p>
              </details>
              <details className="text-sm">
                <summary className="cursor-pointer">Conversational context</summary>
                <p className="mt-1.5 max-h-72 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{convo.context}</p>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guardrails in force</CardTitle>
              <CardDescription>
                From agent/guardrails.json, attached to the PAL. Tavus reports a trigger live on the call and to a callback URL, not in
                its post-call record, so triggers aren&apos;t listed here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {guardrails.guardrails.map((g) => (
                  <li key={g.guardrail_name}>
                    <details className="text-sm">
                      <summary className="cursor-pointer font-mono text-xs">{g.guardrail_name}</summary>
                      <p className="mt-1 text-xs text-muted-foreground">{g.guardrail_prompt}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
