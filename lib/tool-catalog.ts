import agentTools from "@/agent/tools.json";

// How each of Anna's tools is described to people (agent/tools.json describes them to the model).
export const TOOL_LABELS: Record<string, { title: string; what: string }> = {
  lookup_doctor: { title: "Find your doctor", what: "Verifies them in the national registry, checks Medicare, and which plan networks include them." },
  check_drug: { title: "Check a medication", what: "Matches the name (even misheard), asks the strength, prices it on every plan." },
  find_plans: { title: "Compare plans", what: "Every plan in your county, side by side against your doctors and drugs." },
  estimate_annual_cost: { title: "Estimate a year", what: "Premiums plus your medications on one plan, capped by Part D's yearly limit." },
  show_plan_details: { title: "Open a plan", what: "One plan's full benefits on your screen." },
  get_advisor_availability: { title: "Find a time", what: "Open slots with Harbor's licensed advisors, in your time zone." },
  book_advisor_call: { title: "Book an advisor", what: "Books the time you confirm. Signed server-to-server, never from the browser." },
  remember_preference: { title: "Remember you", what: "Saves how you like to be helped, for next time." },
};

export const TOOLS = agentTools.tools.map((t) => ({
  name: t.name,
  delivery: t.delivery,
  sources: t.sources,
  ...(TOOL_LABELS[t.name] ?? { title: t.name, what: "" }),
}));

export const TOOL_SOURCES: Record<string, string[]> = Object.fromEntries(agentTools.tools.map((t) => [t.name, t.sources]));
