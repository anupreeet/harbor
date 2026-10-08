import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdvisor, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { DoctorFact } from "@/lib/tools/doctor";
import type { DrugFact } from "@/lib/tools/drug";

export const metadata: Metadata = { title: "Advisor console" };

// What a licensed advisor opens in the morning: everyone Anna spoke with, by deal stage, with
// what she verified, so nobody re-asks the customer. Advisors are accounts in ADVISOR_EMAILS.

type Row = {
  id: string; first_name: string; email: string; city: string | null; state: string | null; preferences: string[];
  stage: "new" | "qualified" | "booked"; slot_start: string | null; time_zone: string | null; advisor_name: string | null;
  calls: number;
};

const STAGES: { id: Row["stage"]; title: string; empty: string }[] = [
  { id: "new", title: "Signed up", empty: "New accounts appear here." },
  { id: "qualified", title: "Ready for follow-up", empty: "Verified doctors or drugs, no booking yet." },
  { id: "booked", title: "Advisor call booked", empty: "Booked calls appear here." },
];

export default async function AdvisorPage() {
  const user = await requireUser();
  if (!isAdvisor(user.email)) notFound();

  const rows = await query<Row>(
    `SELECT k.id, k.first_name, k.email, k.city, k.state, k.preferences, d.stage, b.slot_start, b.time_zone, b.advisor_name,
            (SELECT count(*)::int FROM conversations c WHERE c.contact_id = k.id) AS calls
       FROM contacts k
       JOIN deals d ON d.contact_id = k.id AND NOT k.is_test
       LEFT JOIN LATERAL (
         SELECT slot_start, time_zone, advisor_name FROM bookings WHERE contact_id = k.id AND slot_start > now()
         ORDER BY slot_start LIMIT 1) b ON true
      ORDER BY k.last_seen_at DESC LIMIT 200`,
  );
  const facts = await query<{ contact_id: string; kind: string; value: DoctorFact & DrugFact }>(
    `SELECT contact_id, kind, value FROM facts WHERE contact_id = ANY($1) ORDER BY updated_at`,
    [rows.map((r) => r.id)],
  );
  const factsFor = (id: string, kind: string) => facts.filter((f) => f.contact_id === id && f.kind === kind).map((f) => f.value);

  return (
    <>
      <PageHeader title="Advisor console" />
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 px-6 py-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Pipeline</h2>
            <p className="mt-1 text-sm text-muted-foreground">Everything Anna verified, so you never re-ask the customer. Plans and networks are demo data.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {STAGES.map((stage) => {
              const inStage = rows.filter((r) => r.stage === stage.id);
              return (
                <section key={stage.id} aria-labelledby={`stage-${stage.id}`} className="rounded-xl bg-muted/60 p-3">
                  <h3 id={`stage-${stage.id}`} className="flex items-center gap-2 px-1 pb-3 text-sm font-medium">
                    {stage.title} <Badge variant="secondary">{inStage.length}</Badge>
                  </h3>
                  <div className="space-y-3">
                    {inStage.length === 0 ? <p className="px-1 pb-2 text-xs text-muted-foreground">{stage.empty}</p> : null}
                    {inStage.map((r) => {
                      const doctors = factsFor(r.id, "doctor") as DoctorFact[];
                      const drugs = factsFor(r.id, "drug") as DrugFact[];
                      return (
                        <Card key={r.id} size="sm">
                          <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-3">
                            <Avatar className="row-span-2 size-9">
                              <AvatarFallback className="bg-primary/10 text-primary">{r.first_name.slice(0, 1).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <CardTitle>{r.first_name}</CardTitle>
                            <CardDescription className="truncate">{[r.city, r.state].filter(Boolean).join(", ")} · {r.email}</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-2 text-xs">
                            {r.slot_start && r.time_zone ? (
                              <p className="flex items-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-accent-foreground">
                                <CalendarDays className="size-3.5" />
                                {new Intl.DateTimeFormat("en-US", { timeZone: r.time_zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(r.slot_start))} with {r.advisor_name}
                              </p>
                            ) : null}
                            {doctors.length ? <p><span className="text-muted-foreground">Doctors: </span>{doctors.map((d) => `${d.name}${d.acceptsMedicare ? " (accepts Medicare)" : ""}`).join("; ")}</p> : null}
                            {drugs.length ? <p><span className="text-muted-foreground">Medications: </span>{drugs.map((d) => `${d.name}${d.strength ? ` ${d.strength}` : ""}`).join(", ")}</p> : null}
                            {r.preferences.length ? <p><span className="text-muted-foreground">Remember: </span>{r.preferences.join("; ")}</p> : null}
                            <p className="text-muted-foreground">{r.calls} {r.calls === 1 ? "call" : "calls"} with Anna</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
