import Link from "next/link";
import { cn } from "@/lib/utils";

// The mark: a channel buoy on water.
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path d="M12.5 21.5 14.5 9h3l2 12.5" className="stroke-primary-foreground" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
      <path
        d="M6.5 23.5c2.4 0 2.4-1.6 4.8-1.6s2.4 1.6 4.7 1.6 2.4-1.6 4.7-1.6 2.4 1.6 4.8 1.6"
        className="stroke-primary-foreground"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 rounded-lg", className)}>
      <Mark />
      <span className="leading-tight">
        <span className="block font-semibold tracking-tight">Harbor</span>
        <span className="block text-xs text-muted-foreground">Medicare Advisors</span>
      </span>
    </Link>
  );
}
