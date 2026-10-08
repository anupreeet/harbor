import { ArrowLeft, FlaskConical, ShieldCheck, Video } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Pieces shared by the admin pages. Every page checks isAdmin itself and renders AdminOnly
// otherwise; the layout only decides whether to show the sub-navigation.

export function AdminOnly() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-xl px-6 py-16">
        <Card className="items-center py-12 text-center">
          <CardHeader className="items-center justify-items-center">
            <span className="mb-2 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <CardTitle>Admin only</CardTitle>
            <CardDescription>This area is only available to Harbor admins.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/app">
                <ArrowLeft /> Back to Harbor
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  return kind === "eval" ? (
    <Badge variant="secondary"><FlaskConical /> Eval</Badge>
  ) : (
    <Badge variant="outline"><Video /> Call</Badge>
  );
}

export function StatusBadge({ status, live }: { status: string; live: boolean }) {
  if (live) {
    return (
      <Badge variant="outline">
        <span className="size-1.5 rounded-full bg-destructive" aria-hidden /> Live
      </Badge>
    );
  }
  return status === "ended" ? <Badge variant="secondary">Ended</Badge> : <Badge variant="outline">Didn&apos;t finish</Badge>;
}

// "Oct 8, 3:14 PM" in the admin's time zone.
export const stamp = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

// "4:05" from seconds (computed in SQL, so rendering never reads the clock).
export const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
