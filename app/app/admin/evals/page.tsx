import type { Metadata } from "next";
import Link from "next/link";
import cases from "@/evals/cases.json";
import { EvalRunnerClient } from "@/components/evals/EvalRunnerClient";
import { isAdmin, requireUser } from "@/lib/auth";
import type { EvalCase } from "@/lib/evals";
import { AdminOnly } from "../shared";

export const metadata: Metadata = { title: "Agent evals" };

// Runs evals/cases.json against the live agent on Tavus. Each run is a real (text-only)
// conversation, so it also shows up under Agent traces with its full trace.
export default async function AdminEvalsPage() {
  const user = await requireUser();
  if (!isAdmin(user.email)) return <AdminOnly />;
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-8">
        <EvalRunnerClient cases={cases.cases as EvalCase[]} />
        <p className="text-xs text-muted-foreground">
          Every run is listed under{" "}
          <Link href="/app/admin" className="underline underline-offset-4 hover:text-foreground">
            Agent traces
          </Link>{" "}
          with its transcript, tool calls, knowledge-base retrievals and memory use.
        </p>
      </div>
    </div>
  );
}
