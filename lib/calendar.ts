// Licensed-advisor calendar. Slots are 30 minutes, weekdays 9:00-17:00 in the caller's time
// zone. A slot's id *is* its UTC start time, so the server can re-verify any slot the model
// hands back — the model never computes dates.

export const ADVISORS = ["Maria Lopez", "James Carter", "Priya Shah"] as const;
const OPEN_HOUR = 9;
const CLOSE_HOUR = 17;
const SLOT_MINUTES = 30;
const MIN_LEAD_MINUTES = 60;

export type Slot = { slotId: string; label: string; advisor: string };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Wall-clock parts of an instant in a time zone.
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "long", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    year: +get("year"), month: +get("month"), day: +get("day"),
    hour: +get("hour"), minute: +get("minute"), weekday: get("weekday").toLowerCase(),
  };
}

// UTC instant for a wall-clock time in a zone (two-pass to handle DST offsets).
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(y, m - 1, d, hh, mm) - asIfUtc;
  }
  return new Date(guess);
}

export function formatSlot(start: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(start);
}

export function isValidSlot(slotId: string, timeZone: string, now = new Date()): boolean {
  const start = new Date(slotId);
  if (Number.isNaN(start.getTime()) || start.toISOString() !== slotId) return false;
  if (start.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) return false;
  const p = zonedParts(start, timeZone);
  const weekend = p.weekday === "saturday" || p.weekday === "sunday";
  return !weekend && p.minute % SLOT_MINUTES === 0 && p.hour >= OPEN_HOUR && p.hour < CLOSE_HOUR;
}

export function advisorFor(slotId: string): string {
  const minutes = Math.floor(new Date(slotId).getTime() / 60_000);
  return ADVISORS[(minutes / SLOT_MINUTES) % ADVISORS.length | 0];
}

// Next open slots, spread across the day (morning / midday / afternoon) so the caller gets choice.
export function nextSlots(opts: {
  timeZone: string;
  taken: Set<string>;
  preferredDay?: string;
  now?: Date;
  count?: number;
}): Slot[] {
  const now = opts.now ?? new Date();
  const count = opts.count ?? 3;
  const wanted = normalizeDay(opts.preferredDay, now, opts.timeZone);
  const out: Slot[] = [];

  for (let dayOffset = 0; dayOffset < 14 && out.length < count; dayOffset++) {
    const day = zonedParts(new Date(now.getTime() + dayOffset * 86_400_000), opts.timeZone);
    if (wanted && day.weekday !== wanted) continue;
    const perDay: Slot[] = [];
    for (const hour of [10, 13, 15, 9, 11, 14, 16]) {
      const start = zonedToUtc(day.year, day.month, day.day, hour, 0, opts.timeZone);
      const slotId = start.toISOString();
      if (opts.taken.has(slotId) || !isValidSlot(slotId, opts.timeZone, now)) continue;
      perDay.push({ slotId, label: formatSlot(start, opts.timeZone), advisor: advisorFor(slotId) });
      if (perDay.length === (wanted ? count : 2)) break;
    }
    out.push(...perDay.slice(0, count - out.length));
    if (wanted) break; // "today", "tomorrow" or "friday" means that one date, not the same weekday next week
  }
  return out;
}

function normalizeDay(day: string | undefined, now: Date, timeZone: string): string | null {
  if (!day) return null;
  const d = day.trim().toLowerCase();
  if (d === "today") return zonedParts(now, timeZone).weekday;
  if (d === "tomorrow") return zonedParts(new Date(now.getTime() + 86_400_000), timeZone).weekday;
  return WEEKDAYS.find((w) => w.startsWith(d.slice(0, 3))) ?? null;
}
