import { ArrowRight, Check, Database, MonitorUp, ShieldCheck, Star, X } from "lucide-react";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TPMO_DISCLAIMER } from "@/lib/conversation/script";

// Anna's stock face from Tavus (face rc9cff32ceba), as a looping preview.
const ANNA_VIDEO = "https://cdn.replica.tavus.io/60084/ea04579a.mp4";
const ANNA_POSTER = "https://cdn.replica.tavus.io/60084/thumbnail.jpg";

const STEPS = [
  { title: "Tell Anna who you see and what you take", body: "Say it, type it, or share your pharmacy's prescription list on screen. She reads it back so you can correct her." },
  { title: "She checks official records while you talk", body: "Your doctor in the national clinician registry and Medicare's records, your drugs in the national drug database, then every plan we offer." },
  { title: "Pick, compare, then talk to a licensed advisor", body: "Options open on screen beside her and you tap to answer. When you're ready, she books a licensed advisor who sees everything she checked." },
];

const SOURCES = ["NPI Registry", "CMS Doctors & Clinicians", "RxNorm · National Library of Medicine", "Medicare.gov"];

const NEVER = [
  "Tell you which plan to pick. Choosing is a conversation with a licensed advisor.",
  "Ask for your Medicare number, Social Security number or bank details.",
  "Enroll you in anything, or rush you to decide.",
  "Give medical advice about your medications.",
];

export default function Landing() {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark />
          <nav className="flex items-center gap-1">
            <Button variant="ghost" asChild className="hidden sm:inline-flex"><a href="#how">How it works</a></Button>
            <Button variant="ghost" asChild><Link href="/login">Sign in</Link></Button>
            <Button asChild><Link href="/signup">Get started</Link></Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-20 lg:grid-cols-[1fr_1.1fr] lg:pt-24">
          <div>
            <Badge variant="secondary" className="gap-1.5">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Medicare enrollment opens October 15
            </Badge>
            <h1 className="mt-5 text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
              Will your doctor and your prescriptions be covered?
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Ask Anna, face to face. She checks your real doctors and medications against official records while you talk, shows
              you the options, and books you with a licensed Harbor advisor.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="h-11 px-6 text-base" asChild>
                <Link href="/signup">Talk with Anna <ArrowRight /></Link>
              </Button>
              <Button size="lg" variant="outline" className="h-11 px-6 text-base" asChild>
                <Link href="/login">I have an account</Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-muted-foreground">Free. No Medicare number needed. Anna is an AI assistant.</p>
          </div>

          <ProductShot />
        </section>

        <section className="border-y bg-muted/40">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2 font-medium text-foreground"><Database className="size-4 text-primary" /> Checked against</span>
            {SOURCES.map((s) => <span key={s}>{s}</span>)}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">How a call works</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Card className="h-full">
                  <CardHeader>
                    <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                    <CardTitle className="mt-3 text-base">{s.title}</CardTitle>
                    <CardDescription className="leading-relaxed">{s.body}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <ShieldCheck className="size-5 text-primary" />
              <CardTitle className="mt-2 text-lg">Built the way compliance asks</CardTitle>
              <CardDescription className="leading-relaxed">
                The required Medicare disclaimer is spoken word for word at the start of every call. Every answer about a doctor or a
                drug names its source. Bookings are written server to server and can&apos;t be faked from a browser. Every call keeps a
                transcript and a checklist your advisor can review.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What Anna will never do</CardTitle>
              <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
                {NEVER.map((t) => (
                  <li key={t} className="flex gap-2.5"><X className="mt-0.5 size-4 shrink-0 text-destructive" />{t}</li>
                ))}
              </ul>
            </CardHeader>
          </Card>
        </section>
      </main>

      <footer className="border-t bg-muted/40">
        <div className="mx-auto max-w-6xl space-y-3 px-6 py-10 text-xs leading-relaxed text-muted-foreground">
          <p>{TPMO_DISCLAIMER}</p>
          <p>
            Harbor Medicare Advisors is an independent brokerage, not affiliated with Medicare or any government agency. This is a
            demonstration: plans, networks and prices are demo data; doctor and drug records are real public data.
          </p>
        </div>
      </footer>
    </div>
  );
}

// A still of the product: Anna on the left, what she's showing on the right.
function ProductShot() {
  return (
    <div className="relative" role="img" aria-label="A call with Anna: her video beside a prescription coverage check">
      <div className="overflow-hidden rounded-2xl bg-stage shadow-2xl ring-1 ring-foreground/10">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
          {["bg-white/20", "bg-white/20", "bg-white/20"].map((c, i) => <span key={i} className={`size-2.5 rounded-full ${c}`} />)}
          <span className="ml-3 text-xs text-white/50">Call with Anna</span>
        </div>
        <div className="grid grid-cols-[1fr_1.15fr] gap-2 p-2">
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video src={ANNA_VIDEO} poster={ANNA_POSTER} autoPlay muted loop playsInline className="size-full object-cover" />
            <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Anna · AI assistant
            </span>
          </div>
          <div className="rounded-lg bg-background p-3 text-xs">
            <div className="flex gap-1">
              <span className="rounded-md bg-primary px-2 py-0.5 text-primary-foreground">Eliquis</span>
              <span className="rounded-md px-2 py-0.5 text-muted-foreground">Dr. Ruiz</span>
              <span className="rounded-md px-2 py-0.5 text-muted-foreground">Plans</span>
            </div>
            <div className="mt-3 overflow-hidden rounded-md ring-1 ring-foreground/10">
              <div className="flex justify-between bg-primary px-2.5 py-1 text-[10px] text-primary-foreground"><span className="font-semibold">Rx</span><span>Coverage check</span></div>
              <div className="p-2.5">
                <p className="text-sm font-semibold">Eliquis <span className="font-normal text-muted-foreground">5 mg</span></p>
                <p className="text-muted-foreground">apixaban</p>
                <dl className="mt-2 divide-y">
                  {[["Advantage HMO", "$47/mo", true], ["Advantage PPO", "$42/mo", true], ["Rx Saver", "Not covered", false]].map(([plan, price, ok]) => (
                    <div key={plan as string} className="flex justify-between py-1">
                      <dt>{plan}</dt>
                      <dd className={ok ? "flex items-center gap-1 font-medium text-primary" : "flex items-center gap-1 font-medium text-destructive"}>
                        {ok ? <Check className="size-3" /> : <X className="size-3" />}{price}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1 text-muted-foreground"><Star className="size-3" /> Facts, not a recommendation</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 flex max-w-[16rem] items-start gap-2 rounded-xl bg-background p-3 text-xs shadow-lg ring-1 ring-foreground/10 sm:-left-8">
        <MonitorUp className="mt-0.5 size-4 shrink-0 text-primary" />
        <span><span className="font-medium">Or just share your prescription list.</span> Anna reads it and checks each drug.</span>
      </div>
    </div>
  );
}
