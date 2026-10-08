"use client";

import { Activity, FlaskConical } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The admin sub-navigation: shadcn's "line" tabs, as links (each section is its own URL).
const SECTIONS = [
  { href: "/app/admin", label: "Agent traces", Icon: Activity, match: (p: string) => p === "/app/admin" || p.startsWith("/app/admin/traces/") },
  { href: "/app/admin/evals", label: "Evals", Icon: FlaskConical, match: (p: string) => p.startsWith("/app/admin/evals") },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex shrink-0 gap-1 border-b px-4">
      {SECTIONS.map(({ href, label, Icon, match }) => (
        <Link
          key={href}
          href={href}
          aria-current={match(pathname) ? "page" : undefined}
          className={cn(
            "relative inline-flex items-center gap-1.5 rounded-md px-2 py-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4",
            "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity",
            "aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100",
          )}
        >
          <Icon />
          {label}
        </Link>
      ))}
    </nav>
  );
}
