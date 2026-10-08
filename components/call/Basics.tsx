import { MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Plain-English Medicare terms, for people who've never had to know what an HMO is. Wording
// follows Medicare.gov; anything deeper is one tap away as a question to Anna, who answers from
// the Medicare.gov knowledge base.

export const PLAN_TYPES: Record<string, string> = {
  HMO: "Health Maintenance Organization: you use doctors in the plan's network, usually with a referral to see a specialist. Care outside the network generally isn't covered, except emergencies.",
  PPO: "Preferred Provider Organization: you can see doctors outside the network without a referral, but you pay more when you do.",
  "HMO-POS": "An HMO with a Point-of-Service option: mostly in-network, but some services are covered outside the network, usually at a higher cost.",
  PDP: "Prescription Drug Plan (Part D): drug coverage only. You keep Original Medicare for doctors and hospitals.",
};

const GROUPS: { title: string; terms: [string, string][]; ask: string }[] = [
  {
    title: "Who's who",
    ask: "Who actually runs my Medicare plan?",
    terms: [
      ["Medicare", "The federal health insurance program for people 65 and older, and some younger people with disabilities."],
      ["Insurance company (carrier)", "A private company, approved by Medicare, that runs Medicare Advantage and drug plans, like Larkspur Health in this demo."],
      ["Harbor (your broker)", "An independent licensed brokerage. We compare plans from several carriers; a licensed advisor helps you choose and enroll. We don't run plans ourselves."],
    ],
  },
  {
    title: "Ways to get Medicare",
    ask: "What's the difference between Original Medicare and Medicare Advantage?",
    terms: [
      ["Original Medicare (Parts A and B)", "Run by the government. Part A covers hospital stays; Part B covers doctors, outpatient care and preventive services. You can see any doctor who accepts Medicare."],
      ["Medicare Advantage (Part C)", "An alternative to Original Medicare from a private carrier. It usually includes drug coverage and extras like dental and vision, and has a yearly limit on what you pay."],
      ["Part D", "Prescription drug coverage from a private carrier, added to Original Medicare."],
    ],
  },
  {
    title: "Plan types",
    ask: "What's the difference between an HMO and a PPO?",
    terms: Object.entries(PLAN_TYPES),
  },
  {
    title: "What you pay",
    ask: "How do premiums, deductibles and copays work together?",
    terms: [
      ["Premium", "What you pay the plan every month, whether or not you use care."],
      ["Deductible", "What you pay for covered care or drugs before the plan starts paying its share."],
      ["Copay", "A fixed amount per visit or prescription, like $10 for a doctor visit."],
      ["Maximum out of pocket", "The most you'd pay in a year for covered medical care on a Medicare Advantage plan. After that, the plan pays 100%."],
      ["Drug tier", "Plans group drugs into tiers; lower tiers (usually generics) cost less."],
      ["Prior authorization", "The plan must approve a drug or service before it covers it. Your doctor requests it."],
    ],
  },
];

export function Basics({ onAsk }: { onAsk: (text: string) => void }) {
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardHeader>
            <CardTitle>{g.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[12rem_1fr]">
              {g.terms.map(([term, meaning]) => (
                <div key={term} className="contents">
                  <dt className="text-sm font-medium">{term}</dt>
                  <dd className="text-sm text-muted-foreground">{meaning}</dd>
                </div>
              ))}
            </dl>
            <Button size="sm" variant="outline" onClick={() => onAsk(g.ask)}>
              <MessageCircleQuestion /> Ask Anna: {g.ask}
            </Button>
          </CardContent>
        </Card>
      ))}
      <CardDescription className="px-1">Based on Medicare.gov. Anna answers follow-up questions from the official Medicare.gov material.</CardDescription>
    </div>
  );
}
