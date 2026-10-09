import { CalendarDays, Columns2, LayoutGrid, Pill, Stethoscope } from "lucide-react";
import type { Card } from "@/lib/tools/cards";

// The steps of a Medicare check, shared by the in-call canvas and the call record: each section
// holds every result of its kinds, in a fixed order.

export type Section = {
  id: string;
  label: string;
  Icon: typeof LayoutGrid;
  kinds: string[];
  intro?: string;
  empty?: { text: string; ask: string; action: string };
};

export const SECTIONS: Section[] = [
  { id: "overview", label: "Overview", Icon: LayoutGrid, kinds: ["on_file", "preference"] },
  {
    id: "section:doctors", label: "Doctors", Icon: Stethoscope, kinds: ["doctor", "doctor_options"],
    intro: "Checked in the national clinician registry and Medicare's records, then against each plan's network.",
    empty: { text: "Tell Anna who you see and she'll check them against every plan.", ask: "Can you check if my doctor is covered?", action: "Check my doctor" },
  },
  {
    id: "section:drugs", label: "Medications", Icon: Pill, kinds: ["drug"],
    intro: "Matched in the national drug database (RxNorm), then priced on each plan.",
    empty: { text: "Name a medication, or share your prescription list on screen.", ask: "I'd like to check a medication.", action: "Check a medication" },
  },
  {
    id: "section:plans", label: "Plans", Icon: Columns2, kinds: ["plans", "plan_details", "cost"],
    intro: "Plans from insurance companies Harbor works with, compared on facts. A licensed advisor helps you choose.",
    empty: { text: "Compare every plan where you live against your doctors and drugs.", ask: "Compare the plans with my doctor and drugs.", action: "Compare plans" },
  },
  {
    id: "section:advisor", label: "Licensed advisor", Icon: CalendarDays, kinds: ["availability", "booking"],
    intro: "A licensed Harbor advisor helps you choose a plan and enroll.",
    empty: { text: "Pick a time and a licensed advisor calls you, with everything Anna checked.", ask: "Can I talk to a licensed advisor?", action: "See open times" },
  },
];

const ORDER = ["on_file", "plans", "plan_details", "cost", "doctor", "doctor_options", "drug", "availability", "booking"];

export const sectionOf = (kind: string) => SECTIONS.find((s) => s.kinds.includes(kind))?.id ?? "overview";

export function inSection<T extends Card & { at?: number }>(section: Section, items: T[]): T[] {
  return items
    .filter((i) => section.kinds.includes(i.kind))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (b.at ?? 0) - (a.at ?? 0));
}
