"use client";

import dynamic from "next/dynamic";

// Daily (WebRTC) only exists in the browser.
export const EvalRunnerClient = dynamic(() => import("./EvalRunner").then((m) => m.EvalRunner), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Loading evals</p>,
});
