import { CalendarCheck, Check, ExternalLink, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { money } from "@/lib/format";
import { PLAN_TYPES } from "./Basics";
import type { Card as FileCardData, CostCard, DoctorCard, DoctorOptionsCard, DrugCard, OnFileCard, PlanDetailsCard, PlansCard } from "@/lib/tools/cards";

// Each lookup becomes the real-world document it stands for: a directory listing, a
// prescription label, a benefits summary, an appointment card. Every one names its source.
// With `onAsk`, choices are buttons that reach Anna as if the caller had said them.

// `open` names the view this choice is about (an item key or kind); if it's already in the
// canvas it opens immediately instead of waiting for Anna to call a tool again.
type Ask = ((text: string, open?: string) => void) | undefined;

const Yes = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 font-medium text-primary">
    <Check className="size-4" />
    {children}
  </span>
);
const No = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
    <X className="size-4" />
    {children}
  </span>
);
// A plan type ("HMO") with what it means, on hover or focus.
function PlanType({ type }: { type: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="h-4 cursor-help px-1 text-[10px]" tabIndex={0}>{type}</Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{PLAN_TYPES[type] ?? type}</TooltipContent>
    </Tooltip>
  );
}

const Source = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>;

function Doctor({ d, onAsk }: { d: DoctorCard["data"]; onAsk: Ask }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Doctor · verified</CardDescription>
        <CardTitle className="text-xl">{d.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{[d.specialty, d.practiceName, d.city].filter(Boolean).join(" · ")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted p-3 text-sm">
          {d.acceptsMedicare === true ? <Yes>Accepts Medicare assignment</Yes> : d.acceptsMedicare === false ? <No>Doesn&apos;t accept Medicare assignment</No> : <span className="text-muted-foreground">Medicare status couldn&apos;t be checked</span>}
          <p className="mt-1 text-xs text-muted-foreground">Assignment means they take Medicare&apos;s approved amount as full payment for covered services.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-0">Plan</TableHead>
              <TableHead className="pr-0 text-right">Network</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.plans.map((p) => (
              <TableRow key={p}>
                <TableCell className="pl-0">{p}</TableCell>
                <TableCell className="pr-0 text-right">{d.included.includes(p) ? <Yes>In network</Yes> : <No>Out of network</No>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Source>
          NPI <span className="font-mono">{d.npi}</span> ·{" "}
          <a href={`https://npiregistry.cms.hhs.gov/provider-view/${d.npi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
            national registry record <ExternalLink className="size-3" />
          </a>{" "}
          · Medicare status from CMS. Plan networks are demo data.
        </Source>
      </CardContent>
      {onAsk ? (
        <CardFooter>
          <Button variant="outline" onClick={() => onAsk(`Which plans include ${d.name}?`, "plans")}>Compare plans that include {d.name}</Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function DoctorOptions({ options, onAsk }: { options: DoctorOptionsCard["data"]; onAsk: Ask }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Which one is your doctor?</CardTitle>
        <CardDescription>{options.length} matches in the national clinician registry</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {options.map((o) => (
          <Button
            key={`${o.name}-${o.specialty}-${o.city}`}
            variant="outline"
            className="h-auto justify-start py-3 text-left"
            disabled={!onAsk}
            onClick={() => onAsk?.(`It's ${o.name}, the ${o.specialty ?? "doctor"} in ${o.city}.`)}
          >
            <span className="grid">
              <span className="font-medium">{o.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{[o.specialty ?? "Clinician", o.city].join(" · ")}</span>
            </span>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

const TIER_NAMES = ["", "Preferred generic", "Generic", "Preferred brand", "Non-preferred", "Specialty"];

function Drug({ d, onAsk }: { d: DrugCard["data"]; onAsk: Ask }) {
  const heardDifferently = d.heardAs && d.heardAs.toLowerCase() !== d.name.toLowerCase();
  const askStrength = !d.strength && d.strengths.length > 1;
  const covered = d.coverage.filter((c): c is Extract<typeof c, { covered: true }> => c.covered);
  const cheapest = [...covered].sort((a, b) => a.monthly_copay - b.monthly_copay)[0];
  return (
    <Card className="py-0">
      <div className="flex items-center justify-between bg-primary px-4 py-1.5 text-xs text-primary-foreground">
        <span className="font-semibold">Rx</span>
        <span>Harbor coverage check</span>
      </div>
      <CardHeader className="pt-1">
        <CardTitle className="text-xl">
          {d.name}
          {d.strength ? <span className="font-normal text-muted-foreground"> {d.strength}</span> : null}
        </CardTitle>
        <CardDescription>
          Generic: {d.ingredients.map((i) => i.name).join(" / ")}
          {heardDifferently ? ` · heard as “${d.heardAs}”, matched in RxNorm` : ""}
        </CardDescription>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="secondary">Covered by {covered.length} of {d.coverage.length} plans</Badge>
          {cheapest ? <Badge variant="secondary">Lowest {money(cheapest.monthly_copay)}/mo · {cheapest.plan}</Badge> : null}
          {covered.some((c) => c.prior_auth) ? <Badge variant="outline">Prior authorization on some plans</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {askStrength ? (
          <div className="rounded-lg bg-warning-soft p-3">
            <p className="text-sm font-medium">Which strength do you take?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {d.strengths.map((s) => (
                <Button key={s} size="sm" variant="outline" className="bg-background" disabled={!onAsk} onClick={() => onAsk?.(`I take the ${s} ${d.name}.`)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-0">Plan</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Monthly</TableHead>
              <TableHead className="pr-0 text-right">Yearly</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.coverage.map((c) => (
              <TableRow key={c.plan} className={c.covered && c === cheapest ? "bg-accent/50" : undefined}>
                <TableCell className="pl-0">
                  {c.plan}
                  {c.covered && c.prior_auth ? <span className="block text-xs text-warning">Needs prior authorization</span> : null}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.covered ? `${c.tier} · ${TIER_NAMES[c.tier] ?? ""}` : "—"}</TableCell>
                <TableCell className="text-right">{c.covered ? <Yes>{money(c.monthly_copay)}</Yes> : <No>Not covered</No>}</TableCell>
                <TableCell className="pr-0 text-right font-medium">{c.covered ? money(c.monthly_copay * 12) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Source>Drug identity from RxNorm (National Library of Medicine). Tiers and copays are demo data; yearly is 12 × the monthly copay, before any deductible.</Source>
      </CardContent>
      {onAsk ? (
        <CardFooter className="flex-wrap gap-2 border-t py-3">
          <Button size="sm" variant="outline" onClick={() => onAsk("Compare the plans with my medications.", "plans")}>Compare plans with my drugs</Button>
          {cheapest ? <Button size="sm" variant="outline" onClick={() => onAsk(`What would a year on ${cheapest.plan} cost me?`, `cost:${cheapest.plan}`)}>Estimate a year on {cheapest.plan}</Button> : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

function Plans({ d, onAsk }: { d: PlansCard["data"]; onAsk: Ask }) {
  const covers = (p: PlansCard["data"]["plans"][number]) =>
    (d.doctors.length === 0 || p.doctors_included.length > 0) && p.drugs_not_covered.length === 0 && (d.doctors.length + d.drugs.length > 0);
  const lowestPremium = [...d.plans].sort((a, b) => a.monthly_premium - b.monthly_premium)[0];
  const estimated = d.plans.filter((p) => p.estimated_yearly !== null);
  const lowestYear = [...estimated].sort((a, b) => a.estimated_yearly! - b.estimated_yearly!)[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Plans in {d.area ?? "your area"}</CardTitle>
        <CardDescription>
          {d.doctors.length || d.drugs.length ? `Checked against ${[...d.doctors, ...d.drugs].join(", ")}.` : "Tell Anna your doctors and drugs to check them against each plan."}
        </CardDescription>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lowestPremium ? <Badge variant="secondary">Lowest premium: {lowestPremium.plan} ({money(lowestPremium.monthly_premium)}/mo)</Badge> : null}
          {lowestYear ? <Badge variant="secondary">Lowest estimated year: {lowestYear.plan} ({money(lowestYear.estimated_yearly)})</Badge> : null}
          {d.plans.filter(covers).map((p) => <Badge key={p.plan}>Covers your doctor and drugs: {p.plan}</Badge>)}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-0">Plan</TableHead>
              <TableHead className="text-right">Premium</TableHead>
              <TableHead className="text-right">Drug deductible</TableHead>
              <TableHead className="text-right">Max out of pocket</TableHead>
              {d.doctors.length ? <TableHead>Doctor</TableHead> : null}
              {d.drugs.length ? <TableHead>Drugs</TableHead> : null}
              {estimated.length ? <TableHead className="text-right">Est. year</TableHead> : null}
              {onAsk ? <TableHead className="pr-0"><span className="sr-only">Actions</span></TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.plans.map((p) => (
              <TableRow key={p.plan} className={covers(p) ? "bg-accent/50" : undefined}>
                <TableCell className="min-w-52 pl-0 whitespace-normal">
                  <span className="block font-medium">{p.plan}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {p.carrier ? <span>by {p.carrier}</span> : null}
                    <PlanType type={p.type} />
                    <Star className="size-3 fill-current" /> {p.stars}
                    <span className="basis-full">{p.extras}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium">{money(p.monthly_premium)}</TableCell>
                <TableCell className="text-right">{money(p.drug_deductible)}</TableCell>
                <TableCell className="text-right">{p.max_out_of_pocket ? money(p.max_out_of_pocket) : "Drugs only"}</TableCell>
                {d.doctors.length ? <TableCell>{p.doctors_included.length ? <Yes>In</Yes> : <No>Out</No>}</TableCell> : null}
                {d.drugs.length ? <TableCell className="whitespace-normal">{p.drugs_not_covered.length ? <No>No {p.drugs_not_covered.join(", ")}</No> : <Yes>All</Yes>}</TableCell> : null}
                {estimated.length ? <TableCell className="text-right font-medium">{money(p.estimated_yearly)}</TableCell> : null}
                {onAsk ? (
                  <TableCell className="pr-0 text-right">
                    <Button size="sm" variant="ghost" onClick={() => onAsk(`Tell me more about ${p.plan}.`, `plan:${p.plan}`)}>Details</Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter>
        <Source>Facts, not a recommendation: a licensed advisor helps you choose. Estimated year is premiums plus your drugs. Hover a plan type (HMO, PPO…) for what it means. Plans and insurance companies are demo data.</Source>
      </CardFooter>
    </Card>
  );
}

function PlanDetails({ d, onAsk }: { d: PlanDetailsCard["data"]; onAsk: Ask }) {
  const rows: [string, string][] = [
    ["Monthly premium", `${money(d.premium)}`],
    ["Drug deductible", money(d.drugDeductible)],
    ["Yearly maximum out of pocket", d.moop ? money(d.moop) : "Original Medicare applies"],
    ["Primary care visit", d.pcpCopay === null ? "Original Medicare" : money(d.pcpCopay)],
    ["Specialist visit", d.specialistCopay === null ? "Original Medicare" : money(d.specialistCopay)],
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <PlanType type={d.type} />
          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3 fill-current" /> {d.stars} stars</span>
        </div>
        <CardTitle className="mt-1 text-xl">{d.name}</CardTitle>
        <CardDescription>
          {d.carrier ? `Run by ${d.carrier}, an insurance company approved by Medicare. Offered through Harbor. ` : ""}
          {d.summary}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm"><span className="text-muted-foreground">Extras: </span>{d.extras}</p>
        {d.doctors.length || d.drugs.length ? (
          <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
            {d.doctors.map((x) => <p key={x.name}>{x.included ? <Yes>{x.name} is in network</Yes> : <No>{x.name} is out of network</No>}</p>)}
            {d.drugs.map((x) => <p key={x.name}>{x.monthly === null ? <No>{x.name} not covered</No> : <Yes>{x.name}: {money(x.monthly)}/mo</Yes>}</p>)}
            {d.estimate ? <p className="pt-1 font-medium">About {money(d.estimate.total)} a year in premiums and these drugs</p> : null}
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        {onAsk ? (
          <Button onClick={() => onAsk(`I'd like to talk to a licensed advisor about ${d.name}.`)}>
            <CalendarCheck /> Talk to an advisor about this plan
          </Button>
        ) : null}
        <Source>Demo plan data. A licensed advisor confirms benefits before you enroll.</Source>
      </CardFooter>
    </Card>
  );
}

function Cost({ d, onAsk }: { d: CostCard["data"]; onAsk: Ask }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Estimated year</CardDescription>
        <CardTitle className="text-lg">{d.plan}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Premiums</dt>
          <dd className="text-right">{money(d.premiums)}</dd>
          <dt className="text-muted-foreground">Your medications</dt>
          <dd className="text-right">{money(d.drugCosts)}</dd>
          <dt className="border-t pt-2 font-medium">Estimated total</dt>
          <dd className="border-t pt-2 text-right text-2xl font-semibold">{money(d.total)}</dd>
        </dl>
        {d.capped ? <Badge variant="secondary">Hits the 2026 Part D yearly cap</Badge> : null}
        <Source>Premiums and the medications you mentioned; doctor visits not included.</Source>
      </CardContent>
      {onAsk ? (
        <CardFooter>
          <Button variant="outline" onClick={() => onAsk("Can you compare that with the other plans?", "plans")}>Compare with other plans</Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function FileCard({ card, onAsk }: { card: FileCardData; onAsk?: (text: string, open?: string) => void }) {
  switch (card.kind) {
    case "doctor": return <Doctor d={card.data} onAsk={onAsk} />;
    case "doctor_options": return <DoctorOptions options={card.data} onAsk={onAsk} />;
    case "drug": return <Drug d={card.data} onAsk={onAsk} />;
    case "plans": return <Plans d={card.data} onAsk={onAsk} />;
    case "plan_details": return <PlanDetails d={card.data} onAsk={onAsk} />;
    case "cost": return <Cost d={card.data} onAsk={onAsk} />;
    case "availability":
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pick a time with a licensed advisor</CardTitle>
            <CardDescription>Tap a time, or just say it.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {card.data.map((s) => (
              <Button key={s.slotId} variant="outline" className="h-auto justify-start py-3 text-left" disabled={!onAsk} onClick={() => onAsk?.(`Let's do ${s.label}.`)}>
                <span className="grid">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">with {s.advisor}</span>
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>
      );
    case "booking":
      return (
        <div className="perforated rounded-xl bg-primary px-6 py-5 text-primary-foreground">
          <p className="text-sm opacity-85">Your call with {card.data.advisor}, licensed Harbor advisor</p>
          <p className="mt-1 text-lg font-semibold">{card.data.when}</p>
        </div>
      );
    case "preference":
      return (
        <Card size="sm">
          <CardContent><span className="font-medium">Noted for next time:</span> {card.data.preference}</CardContent>
        </Card>
      );
    case "on_file":
      return <OnFile d={card.data} onAsk={onAsk} />;
    case "removed":
      return null; // never stored as an item; the call state drops what it names
  }
}

function OnFile({ d, onAsk }: { d: OnFileCard["data"]; onAsk?: (text: string, open?: string) => void }) {
  const rows: { label: string; values: string[] }[] = [
    { label: "Doctors", values: d.doctors.map((x) => `${x.name}${x.specialty ? `, ${x.specialty}` : ""}`) },
    { label: "Medications", values: d.drugs.map((x) => `${x.name}${x.strength ? ` ${x.strength}` : ""}`) },
    { label: "Licensed advisor call", values: d.booking ? [`${d.booking.when} with ${d.booking.advisor}`] : [] },
    { label: "Noted for next time", values: d.preferences },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">What&apos;s on your file</CardTitle>
        <CardDescription>Everything Anna has checked with you. Tell her if something changed and she&apos;ll update it.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-sm font-medium">{r.label}</p>
            {r.values.length ? (
              <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                {r.values.map((v) => <li key={v}>{v}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">None yet</p>
            )}
          </div>
        ))}
      </CardContent>
      {onAsk && (d.doctors.length || d.drugs.length) ? (
        <CardFooter>
          <Button variant="outline" onClick={() => onAsk("Compare the plans with what's on my file.", "plans")}>Compare plans with this</Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
