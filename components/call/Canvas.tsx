"use client";

import { BookOpen, Check, LayoutGrid, Sparkles, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FileItem } from "@/lib/call/session";
import { cn } from "@/lib/utils";
import { Basics } from "./Basics";
import { FileCard } from "./FileCards";
import { nextSteps, Overview } from "./Overview";
import { inSection as sectionItems, sectionOf, SECTIONS, type Section } from "./sections";

// What Anna "puts on screen". A left-hand menu follows the steps of a Medicare check (doctors,
// medications, plans, a licensed advisor), each section holding everything of its kind; the
// newest result opens its section by itself, and choices and next steps are buttons that answer her.

const BASICS = "section:basics";

export function Canvas({
  items,
  activeKey,
  onSelect,
  onClose,
  onAsk,
}: {
  items: FileItem[];
  activeKey: string; // a section id, or an item key (opens its section, scrolled to it)
  onSelect: (key: string) => void;
  onClose: () => void;
  onAsk: (text: string, open?: string) => void;
}) {
  const focused = items.find((i) => i.key === activeKey);
  const sectionId = focused ? sectionOf(focused.kind) : [...SECTIONS.map((s) => s.id), BASICS].includes(activeKey) ? activeKey : "overview";
  const section = SECTIONS.find((s) => s.id === sectionId);
  const inSection = (s: Section) => sectionItems(s, items);
  const steps = nextSteps(items);

  // Bring a just-opened result into view inside its section. Scroll only the canvas: the
  // browser's scrollIntoView also scrolls every ancestor, which shifted the whole call screen.
  useEffect(() => {
    const el = focused && document.getElementById(`item-${focused.key}`);
    const viewport = el?.closest<HTMLElement>("[data-slot=scroll-area-viewport]");
    if (!el || !viewport) return;
    const top = viewport.scrollTop + el.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16;
    viewport.scrollTo({ top, behavior: "smooth" });
  }, [focused]);

  const navItem = (id: string, label: string, Icon: typeof LayoutGrid, done?: boolean, count?: number) => (
    <button
      key={id}
      type="button"
      onClick={() => onSelect(id)}
      aria-current={sectionId === id ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm whitespace-nowrap transition-colors md:w-full",
        sectionId === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {count ? <span className="text-xs opacity-70">{count}</span> : null}
      {done ? <Check className="size-3.5 shrink-0" aria-label="done" /> : null}
    </button>
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-52 md:flex-col md:overflow-visible md:border-r md:border-b-0" aria-label="Your Medicare check">
        {navItem("overview", "Overview", LayoutGrid)}
        <p className="hidden px-2.5 pt-3 pb-1 text-xs font-medium text-muted-foreground md:block">Your check</p>
        {SECTIONS.slice(1).map((s) => {
          const list = inSection(s);
          const done = s.id === "section:advisor" ? list.some((i) => i.kind === "booking") : list.length > 0;
          return navItem(s.id, s.label, s.Icon, done, list.length || undefined);
        })}
        <p className="hidden px-2.5 pt-3 pb-1 text-xs font-medium text-muted-foreground md:block">Help</p>
        {navItem(BASICS, "Medicare basics", BookOpen)}
        <div className="hidden flex-1 md:block" />
        <Button size="sm" variant="ghost" onClick={onClose} className="hidden justify-start text-muted-foreground md:flex">
          <X /> Back to Anna
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Back to Anna" className="ml-auto md:hidden">
          <X />
        </Button>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <div key={sectionId} className="mx-auto max-w-5xl animate-in space-y-4 p-4 pb-40 duration-300 fade-in slide-in-from-bottom-2 sm:p-6 sm:pb-44">
            {sectionId === "overview" ? (
              <Overview items={items} onAsk={onAsk} />
            ) : sectionId === BASICS ? (
              <>
                <SectionTitle title="Medicare basics" intro="The words you'll hear when choosing a plan, in plain English." />
                <Basics onAsk={onAsk} />
              </>
            ) : section ? (
              <>
                <SectionTitle title={section.label} intro={section.intro} />
                {inSection(section).length ? (
                  inSection(section).map((i) => (
                    <div key={i.key} id={`item-${i.key}`} className={cn("scroll-mt-4 rounded-xl", focused?.key === i.key && "ring-2 ring-primary/40")}>
                      <FileCard card={i} onAsk={onAsk} />
                    </div>
                  ))
                ) : section.empty ? (
                  <div className="rounded-xl border border-dashed p-8 text-center">
                    <p className="text-sm text-muted-foreground">{section.empty.text}</p>
                    <Button className="mt-4" onClick={() => onAsk(section.empty!.ask)}>{section.empty.action}</Button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </ScrollArea>

        {steps.length ? (
          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-3 py-2 pr-56 sm:pr-68">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="size-3" /> Next
            </span>
            {steps.map((s) => (
              <Button key={s.label} size="sm" variant="outline" className="bg-background" onClick={() => onAsk(s.ask, s.open)}>
                {s.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SectionTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="px-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {intro ? <p className="mt-0.5 text-sm text-muted-foreground">{intro}</p> : null}
    </div>
  );
}
