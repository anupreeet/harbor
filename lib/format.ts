// Display formatting shared by server and client components.

export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n === 0 ? "$0" : `$${Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2)}`;

// "Today, 3:14 PM", "Yesterday, 9:02 AM", or "Oct 6", in the person's own time zone.
export function whenLabel(iso: string, timeZone: string, now = new Date()): string {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(date);
  if (day(date) === day(now)) return `Today, ${time}`;
  if (day(date) === day(new Date(now.getTime() - 86_400_000))) return `Yesterday, ${time}`;
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(date);
}

export const longDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
