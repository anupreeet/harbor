import { CalendarDays, Check, Clock, Minus, Search, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import { AgentTrace } from "@/components/call/AgentTrace";
import { FileCard } from "@/components/call/FileCards";
import { Overview } from "@/components/call/Overview";
import { inSection, SECTIONS } from "@/components/call/sections";
import { Bubble } from "@/components/call/Timeline";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isAdmin, requireUser } from "@/lib/auth";
import { keyFor } from "@/lib/call/session";
import { TPMO_DISCLAIMER } from "@/lib/conversation/script";
import { longDate } from "@/lib/format";
import { timeZoneForState } from "@/lib/integrations/geo";
import { loadRecord } from "@/lib/record";
import { tavusToolCalls } from "@/lib/tavus/client";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your call" };

// The record of one call, like meeting notes: a summary first (what was checked, how plans
// compare, what happens next), then the transcript and every result in detail. The agent trace
// is for admins.
export default async function ConversationPage({ params }: PageProps<"/app/c/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const admin = isAdmin(user.email);
  const rec = await loadRecord(id, admin ? null : user.id);
  if (!rec) notFound();
  const { convo, cards, transcript, checklist } = rec;
  const items = cards.map((c) => ({ ...c, key: keyFor(c) }));
  const booking = items.find((i) => i.kind === "booking");
  const tavusCalls = admin && convo.status === "ended" ? await tavusToolCalls(convo.id) : null;

  // The fixed opening (AI disclosure, Medicare disclaimer, transcription notice) is folded away.
  const openingIndex = transcript.findIndex((l) => l.role === "pal" && l.text.includes(TPMO_DISCLAIMER.slice(0, 40)));
  const opening = openingIndex >= 0 ? transcript[openingIndex] : null;
  const lines = transcript.filter((_, i) => i !== openingIndex);

  return (
    <>
      <PageHeader title={convo.title ?? "Call with Anna"}>
        <Button size="sm" asChild>
          <Link href="/app/call">
            <Video /> Continue with Anna
          </Link>
        </Button>
      </PageHeader>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{convo.title ?? "Call with Anna"}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{longDate(convo.created_at, timeZoneForState(user.state ?? ""))}</span>
              {rec.cost ? <Badge variant="secondary" className="gap-1"><Clock className="size-3" /> {rec.cost.minutes.toFixed(1)} min</Badge> : null}
              <Badge variant="secondary" className="gap-1"><Search className="size-3" /> {rec.lookups} lookups</Badge>
              {booking ? <Badge className="gap-1"><CalendarDays className="size-3" /> Advisor booked</Badge> : <Badge variant="outline">No advisor booked yet</Badge>}
            </div>
          </div>

          {convo.status === "active" ? (
            <Alert>
              <AlertDescription>This call didn&apos;t finish properly. Anything Anna checked is saved here.</AlertDescription>
            </Alert>
          ) : null}

          <Tabs defaultValue="summary" className="gap-4">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              <TabsTrigger value="details">Details{items.length ? ` (${items.length})` : ""}</TabsTrigger>
              {admin ? <TabsTrigger value="trace">Agent trace</TabsTrigger> : null}
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              {booking && booking.kind === "booking" ? (
                <div className="perforated rounded-xl bg-primary px-6 py-5 text-primary-foreground">
                  <p className="text-sm opacity-85">Next: your call with {booking.data.advisor}, licensed Harbor advisor</p>
                  <p className="mt-1 text-lg font-semibold">{booking.data.when}</p>
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">Next: talk to a licensed advisor</p>
                      <p className="text-sm text-muted-foreground">They help you choose and enroll, with everything Anna checked in front of them.</p>
                    </div>
                    <Button asChild><Link href="/app/call?topic=advisor"><CalendarDays /> Book a time</Link></Button>
                  </CardContent>
                </Card>
              )}
              <Overview items={items} />
              <Card>
                <CardHeader>
                  <CardTitle>Call checklist</CardTitle>
                  <CardDescription>What a licensed advisor or compliance reviewer looks for.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-3 text-sm sm:grid-cols-2">
                    {checklist.map((c) => (
                      <li key={c.label} className="flex gap-3">
                        <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", c.ok ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                          {c.ok ? <Check className="size-3" /> : <Minus className="size-3" />}
                        </span>
                        <span>
                          {c.label}
                          {c.detail ? <span className="block text-xs text-muted-foreground">{c.detail}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transcript">
              <Card>
                <CardContent className="space-y-3">
                  {opening ? (
                    <details className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Opening: AI disclosure, Medicare disclaimer and transcription notice (spoken word for word)</summary>
                      <p className="mt-2 leading-relaxed">{opening.text}</p>
                    </details>
                  ) : null}
                  {lines.length ? (
                    <ol className="space-y-2.5">
                      {lines.map((l, i) => (
                        <Bubble key={i} role={l.role} text={l.text} name={user.first_name} />
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">No transcript was saved for this call.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details" className="space-y-8">
              {items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing was looked up on this call.</p> : null}
              {SECTIONS.slice(1).map((s) => {
                const list = inSection(s, items);
                if (!list.length) return null;
                return (
                  <section key={s.id} className="space-y-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-lg font-semibold"><s.Icon className="size-4 text-primary" /> {s.label}</h3>
                      {s.intro ? <p className="text-sm text-muted-foreground">{s.intro}</p> : null}
                    </div>
                    {list.map((c) => <FileCard key={c.key} card={c} />)}
                  </section>
                );
              })}
            </TabsContent>

            {admin ? (
              <TabsContent value="trace">
                <AgentTrace rows={rec.trace} tavus={tavusCalls} events={convo.events} />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      </div>
    </>
  );
}
