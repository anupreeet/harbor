import { CalendarDays, Columns2, Database, MonitorUp, Pill, Stethoscope, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import type { Topic } from "@/lib/conversation/script";
import { loadFile } from "@/lib/crm";
import { timeZoneForState } from "@/lib/integrations/geo";
import { TOOLS } from "@/lib/tool-catalog";

export const metadata: Metadata = { title: "Home" };

const SUGGESTIONS: { topic: Topic; title: string; detail: string; Icon: typeof Stethoscope }[] = [
  { topic: "doctor", title: "Is my doctor covered?", detail: "Checked in the national registry and each plan's network.", Icon: Stethoscope },
  { topic: "drugs", title: "What will my prescriptions cost?", detail: "Say it, type it, or show Anna the bottle.", Icon: Pill },
  { topic: "compare", title: "Compare plans near me", detail: "Side by side, on facts, for your county.", Icon: Columns2 },
  { topic: "advisor", title: "Talk to a licensed advisor", detail: "Book a time to choose and enroll with a person.", Icon: CalendarDays },
];

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const user = await requireUser();
  const file = await loadFile(user);
  const known = file.doctors.length + file.drugs.length;

  return (
    <>
      <PageHeader title="Home" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
          <section>
            <h2 className="text-3xl font-semibold tracking-tight">
              {greeting(timeZoneForState(user.state ?? ""))}, {user.first_name}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Anna checks your doctors and prescriptions against official records while you talk, then books you with a licensed
              advisor when you&apos;re ready.
              {known ? ` She already has ${file.doctors.length} doctor${file.doctors.length === 1 ? "" : "s"} and ${file.drugs.length} medication${file.drugs.length === 1 ? "" : "s"} on file for you.` : ""}
            </p>
          </section>

          {file.booking ? (
            <Card className="border-primary/30 bg-accent">
              <CardContent className="flex items-center gap-4">
                <CalendarDays className="size-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Your call with {file.booking.advisor}, licensed Harbor advisor</p>
                  <p className="font-semibold">{file.booking.when}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden py-0">
            <div className="flex flex-col gap-6 bg-gradient-to-br from-accent to-transparent p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Start a video call with Anna</h3>
                <p className="mt-1 text-sm text-muted-foreground">Up to four and a half minutes. You&apos;ll check your camera first.</p>
              </div>
              <Button asChild size="lg" className="h-11 px-6">
                <Link href="/app/call">
                  <Video /> Start call
                </Link>
              </Button>
            </div>
            <div className="flex items-start gap-3 border-t px-6 py-4 text-sm text-muted-foreground">
              <MonitorUp className="mt-0.5 size-4 shrink-0 text-primary" />
              Instead of reading out every medication, share your pharmacy&apos;s prescription list on screen. Anna reads it and checks
              each one.
            </div>
          </Card>

          <section>
            <h3 className="text-sm font-medium text-muted-foreground">Start with a question</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map(({ topic, title, detail, Icon }) => (
                <Link key={topic} href={`/app/call?topic=${topic}`} className="group">
                  <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
                    <CardHeader>
                      <Icon className="size-5 text-primary" />
                      <CardTitle className="mt-2 text-base">{title}</CardTitle>
                      <CardDescription>{detail}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-muted-foreground">What Anna can do on a call</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TOOLS.map((t) => (
                <Card key={t.name} size="sm" className="gap-2">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">{t.title}</CardTitle>
                      <Badge variant="secondary" className="font-mono text-[10px]">{t.delivery === "server" ? "signed write" : "lookup"}</Badge>
                    </div>
                    <CardDescription className="text-xs">{t.what}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <Database className="mt-0.5 size-3 shrink-0" />
                      {t.sources[0]}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
