import { CalendarDays, Check, Heart, Pill, Stethoscope, Video, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { loadFile } from "@/lib/crm";
import { removeFromFile } from "./actions";

export const metadata: Metadata = { title: "Your coverage" };

// Everything Anna has verified across all calls. The same record the licensed advisor opens,
// and what the next call starts from.
export default async function FilePage() {
  const user = await requireUser();
  const file = await loadFile(user);
  const empty = !file.doctors.length && !file.drugs.length && !file.booking;

  return (
    <>
      <PageHeader title="Your coverage" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">What Anna has verified</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              For {[user.city, user.state].filter(Boolean).join(", ")}. Your licensed advisor sees the same record, and your next call
              starts from it.
            </p>
          </div>

          {empty ? (
            <Card className="items-center py-12 text-center">
              <CardHeader className="items-center">
                <CardTitle>Nothing here yet</CardTitle>
                <CardDescription>Tell Anna about a doctor you see or a medication you take, and it lands here.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/app/call"><Video /> Start a call</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {file.booking ? (
                <div className="perforated flex items-start justify-between gap-4 rounded-xl bg-primary px-6 py-5 text-primary-foreground">
                  <div>
                    <p className="flex items-center gap-2 text-sm opacity-85"><CalendarDays className="size-4" /> With {file.booking.advisor}, licensed Harbor advisor</p>
                    <p className="mt-1 text-lg font-semibold">{file.booking.when}</p>
                  </div>
                  <Remove what="booking" itemKey={file.booking.id} name={`your advisor call on ${file.booking.when}`} label="Cancel call" />
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Stethoscope className="size-4 text-primary" /> Doctors</CardTitle>
                    <CardDescription>National clinician registry and CMS</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {file.doctors.length ? (
                      <ul className="divide-y">
                        {file.doctors.map((d) => (
                          <li key={d.npi} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                            <div>
                              <p className="font-medium">{d.name}</p>
                              <p className="text-xs text-muted-foreground">{[d.specialty, d.practiceName, d.city].filter(Boolean).join(" · ")}</p>
                              {d.acceptsMedicare ? <Badge variant="secondary" className="mt-1.5"><Check /> Accepts Medicare</Badge> : null}
                            </div>
                            <Remove what="doctor" itemKey={d.npi} name={d.name} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No doctors checked yet.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Pill className="size-4 text-primary" /> Medications</CardTitle>
                    <CardDescription>RxNorm, National Library of Medicine</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {file.drugs.length ? (
                      <ul className="divide-y">
                        {file.drugs.map((d) => (
                          <li key={d.key} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                            <div>
                              <p className="font-medium">
                                {d.name}
                                {d.strength ? <span className="font-normal text-muted-foreground"> {d.strength}</span> : null}
                              </p>
                              <p className="text-xs text-muted-foreground">{d.ingredients.map((i) => i.name).join(" / ")}</p>
                            </div>
                            <Remove what="drug" itemKey={d.key} name={d.name} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No medications checked yet.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {file.preferences.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Heart className="size-4 text-primary" /> Anna remembers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y text-sm text-muted-foreground">
                      {file.preferences.map((p) => (
                        <li key={p} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                          {p}
                          <Remove what="preference" itemKey={p} name={p} />
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}

              <p className="text-xs text-muted-foreground">Plans, networks and prices on this site are demo data. Doctor and drug identities are real public data.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// A plain form: works before hydration, and the action re-checks who's signed in.
function Remove({ what, itemKey, name, label }: { what: string; itemKey: string; name: string; label?: string }) {
  return (
    <form action={removeFromFile} className="shrink-0">
      <input type="hidden" name="what" value={what} />
      <input type="hidden" name="key" value={itemKey} />
      <input type="hidden" name="name" value={name} />
      {label ? (
        <Button type="submit" size="sm" variant="secondary" aria-label={`Cancel ${name}`}>{label}</Button>
      ) : (
        <Button type="submit" size="icon-sm" variant="ghost" aria-label={`Remove ${name}`} title="Remove from your file">
          <X />
        </Button>
      )}
    </form>
  );
}
