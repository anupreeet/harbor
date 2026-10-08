import { describe, expect, it } from "vitest";
import { isValidSlot, nextSlots, zonedToUtc } from "@/lib/calendar";

const TZ = "America/Chicago";
// Wednesday 2026-10-07, 08:00 in Chicago (13:00 UTC, CDT = UTC-5).
const NOW = new Date("2026-10-07T13:00:00.000Z");

describe("calendar", () => {
  it("converts wall-clock time to UTC across DST", () => {
    expect(zonedToUtc(2026, 10, 7, 10, 0, TZ).toISOString()).toBe("2026-10-07T15:00:00.000Z"); // CDT
    expect(zonedToUtc(2026, 12, 7, 10, 0, TZ).toISOString()).toBe("2026-12-07T16:00:00.000Z"); // CST
  });

  it("only accepts future, on-the-half-hour, weekday business-hours slots", () => {
    expect(isValidSlot("2026-10-07T15:00:00.000Z", TZ, NOW)).toBe(true); // Wed 10:00
    expect(isValidSlot("2026-10-07T13:30:00.000Z", TZ, NOW)).toBe(false); // Wed 08:30, too soon
    expect(isValidSlot("2026-10-07T23:00:00.000Z", TZ, NOW)).toBe(false); // Wed 18:00, after hours
    expect(isValidSlot("2026-10-10T15:00:00.000Z", TZ, NOW)).toBe(false); // Saturday
    expect(isValidSlot("2026-10-07T15:10:00.000Z", TZ, NOW)).toBe(false); // not on a slot boundary
    expect(isValidSlot("next tuesday", TZ, NOW)).toBe(false);
  });

  it("offers open slots, skipping taken ones and weekends", () => {
    const slots = nextSlots({ timeZone: TZ, taken: new Set(["2026-10-07T15:00:00.000Z"]), now: NOW });
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.slotId)).not.toContain("2026-10-07T15:00:00.000Z");
    expect(slots.every((s) => isValidSlot(s.slotId, TZ, NOW))).toBe(true);
  });

  it("honours a preferred weekday", () => {
    const slots = nextSlots({ timeZone: TZ, taken: new Set(), now: NOW, preferredDay: "friday" });
    expect(slots.every((s) => s.label.startsWith("Friday"))).toBe(true);
  });
});
