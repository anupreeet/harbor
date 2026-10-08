import { Check, Circle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FileItem } from "@/lib/call/session";
import { money } from "@/lib/format";
import type { Card as FileCardData, DoctorCard, DrugCard, PlansCard } from "@/lib/tools/cards";

// Everything checked on this call on one screen: where the caller is in the process, and a grid
// of every plan against their doctors and each drug. Built from the cards, so it's only facts
// the tools returned.


// Without `onAsk` (the call record) it's read-only.
export function Overview({ items, onAsk }: { items: (FileCardData & { key: string })[]; onAsk?: (text: string, open?: string) => void }) {
  const doctors = items.filter((i): i is DoctorCard & { key: string } => i.kind === "doctor");
  const drugs = items.filter((i): i is DrugCard & { key: string } => i.kind === "drug");
  const plans = items.find((i): i is PlansCard & { key: string } => i.kind === "plans");
  const booked = items.find((i) => i.kind === "booking");

  const planNames = plans?.data.plans.map((p) => p.plan) ?? [...new Set([...drugs.flatMap((d) => d.data.coverage.map((c) => c.plan)), ...doctors.flatMap((d) => d.data.plans)])];

  const steps: { label: string; done: boolean; detail: string; ask: string; open?: string }[] = [
    { label: "Your doctors", done: doctors.length > 0, detail: doctors.map((d) => d.data.name).join(", "), ask: "Can you check if my doctor is covered?" },
    { label: "Your medications", done: drugs.length > 0, detail: drugs.map((d) => `${d.data.name}${d.data.strength ? ` ${d.data.strength}` : ""}`).join(", "), ask: "I'd like to check a medication." },
    { label: "Plans compared", done: !!plans, detail: plans ? `${plans.data.plans.length} plans in ${plans.data.area}` : "", ask: "Compare the plans with my doctor and drugs.", open: "plans" },
    { label: "Licensed advisor booked", done: !!booked, detail: booked && booked.kind === "booking" ? `${booked.data.advisor}, ${booked.data.when}` : "", ask: "Can I talk to a licensed advisor?" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Your check so far</CardTitle>
          <CardDescription>Everything Anna verified on this call.{onAsk ? " Tap a step to do it next." : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-start gap-3 rounded-lg border p-3">
                {s.done ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 text-sm">
                  <span className="block font-medium">{s.label}</span>
                  {s.done ? (
                    <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>
                  ) : onAsk ? (
                    <Button size="xs" variant="link" className="h-auto p-0" onClick={() => onAsk(s.ask, s.open)}>
                      Do this next
                    </Button>
                  ) : (
                    <span className="block text-xs text-muted-foreground">Not done yet</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {planNames.length && (doctors.length || drugs.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>Coverage at a glance</CardTitle>
            <CardDescription>Each plan against your doctors and medications. Facts, not a recommendation.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-0">Plan</TableHead>
                  {plans ? <TableHead className="text-right">Premium</TableHead> : null}
                  {doctors.map((d) => <TableHead key={d.key}>{d.data.name.replace(/^Dr\. /, "")}</TableHead>)}
                  {drugs.map((d) => <TableHead key={d.key}>{d.data.name}</TableHead>)}
                  {plans?.data.plans.some((p) => p.estimated_yearly !== null) ? <TableHead className="pr-0 text-right">Est. year</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {planNames.map((name) => {
                  const row = plans?.data.plans.find((p) => p.plan === name);
                  const all =
                    doctors.every((d) => d.data.included.includes(name)) &&
                    drugs.every((d) => d.data.coverage.find((c) => c.plan === name)?.covered);
                  return (
                    <TableRow key={name} className={all ? "bg-accent/50" : undefined}>
                      <TableCell className="pl-0 font-medium">
                        {name}
                        {all ? <Badge className="ml-2 h-4 px-1.5 text-[10px]">All covered</Badge> : null}
                      </TableCell>
                      {plans ? <TableCell className="text-right">{row ? money(row.monthly_premium) : "—"}</TableCell> : null}
                      {doctors.map((d) => (
                        <TableCell key={d.key}>
                          {d.data.included.includes(name) ? <Check className="size-4 text-primary" aria-label="In network" /> : <X className="size-4 text-destructive" aria-label="Out of network" />}
                        </TableCell>
                      ))}
                      {drugs.map((d) => {
                        const c = d.data.coverage.find((x) => x.plan === name);
                        return (
                          <TableCell key={d.key}>
                            {c?.covered ? <span className="font-medium text-primary">{money(c.monthly_copay)}/mo</span> : <X className="size-4 text-destructive" aria-label="Not covered" />}
                          </TableCell>
                        );
                      })}
                      {plans?.data.plans.some((p) => p.estimated_yearly !== null) ? <TableCell className="pr-0 text-right font-medium">{money(row?.estimated_yearly)}</TableCell> : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// Up to three things to do next, so someone can run the whole check by tapping.
export function nextSteps(items: FileItem[]): { label: string; ask: string; open?: string }[] {
  const has = (kind: string) => items.some((i) => i.kind === kind);
  const plans = items.find((i): i is FileItem & PlansCard => i.kind === "plans");
  const cheapest = plans ? [...plans.data.plans].sort((a, b) => (a.estimated_yearly ?? a.monthly_premium * 12) - (b.estimated_yearly ?? b.monthly_premium * 12))[0] : null;
  const out: { label: string; ask: string; open?: string }[] = [];
  if (!has("drug")) out.push({ label: "Check a medication", ask: "I'd like to check a medication." });
  if (!has("doctor")) out.push({ label: "Check my doctor", ask: "Can you check if my doctor is covered?" });
  if ((has("drug") || has("doctor")) && !plans) out.push({ label: "Compare plans", ask: "Compare the plans with my doctor and drugs.", open: "plans" });
  const short = cheapest ? `the ${cheapest.type === "PDP" ? "Part D plan" : cheapest.type}` : "";
  if (cheapest && !has("cost")) out.push({ label: `Estimate a year on ${short}`, ask: `What would a year on ${cheapest.plan} cost me?`, open: `cost:${cheapest.plan}` });
  if (plans && !has("plan_details") && cheapest) out.push({ label: `Open ${short}`, ask: `Tell me more about ${cheapest.plan}.`, open: `plan:${cheapest.plan}` });
  if (!has("booking")) out.push({ label: "Talk to a licensed advisor", ask: "Can I talk to a licensed advisor?" });
  return out.slice(0, 3);
}
