import { describe, it, expect } from "vitest";
import {
  resolveEventStatus,
  getEventLifecycleStatus,
  formatEventFee,
  parseFeeNumber,
  normalizeBookingUrl,
  parseEventDate,
} from "./eventLifecycle";

describe("Event Lifecycle & Booking Helpers", () => {
  it("classifies future ISO and human-readable dates (26 Nov 2026, 27 Nov 2026) as upcoming", () => {
    const now = new Date(2026, 10, 25, 15, 30, 0); // Nov 25, 2026
    expect(
      getEventLifecycleStatus({ eventDate: "2026-11-30", status: "upcoming" }, now)
    ).toBe("upcoming");
    expect(
      getEventLifecycleStatus({ date: "26 Nov 2026", status: "upcoming" }, now)
    ).toBe("upcoming");
    expect(
      getEventLifecycleStatus({ schedule: "27 Nov 2026", status: "upcoming" }, now)
    ).toBe("upcoming");
  });

  it("automatically moves event to ongoing when eventDate is today (ISO or formatted)", () => {
    const now = new Date(2026, 10, 26, 9, 0, 0); // Nov 26, 2026
    expect(
      resolveEventStatus({ eventDate: "2026-11-26", status: "upcoming" }, now)
    ).toBe("ongoing");
    expect(
      resolveEventStatus({ date: "26 Nov 2026", status: "upcoming" }, now)
    ).toBe("ongoing");
  });

  it("automatically moves event to ongoing when eventDate is in the past and not marked completed", () => {
    const now = new Date(2026, 10, 25, 10, 0, 0);
    const status = resolveEventStatus(
      { eventDate: "2026-11-20", status: "upcoming" },
      now
    );
    expect(status).toBe("ongoing");
  });

  it("immediately resolves to completed when Admin marks event completed (even if date is future or today)", () => {
    const now = new Date(2026, 10, 25, 10, 0, 0);
    expect(
      resolveEventStatus({ eventDate: "2026-12-10", status: "completed" }, now)
    ).toBe("completed");
    expect(
      resolveEventStatus({ date: "26 Nov 2026", completed: true, status: "ongoing" }, now)
    ).toBe("completed");
  });

  it("formats entry fee amounts cleanly", () => {
    expect(formatEventFee(0)).toBe("Free");
    expect(formatEventFee("")).toBe("Free");
    expect(formatEventFee(undefined)).toBe("Free");
    expect(formatEventFee(500)).toBe("₹500");
    expect(formatEventFee("₹499")).toBe("₹499");
    expect(parseFeeNumber("₹500")).toBe(500);
    expect(parseFeeNumber(0)).toBe(0);
  });

  it("validates and normalizes external booking URLs safely", () => {
    expect(normalizeBookingUrl("")).toBe("");
    expect(normalizeBookingUrl("   ")).toBe("");
    expect(normalizeBookingUrl("https://bookmyshow.com/event/123")).toBe(
      "https://bookmyshow.com/event/123"
    );
    expect(normalizeBookingUrl("tickets.hivecity.in/run")).toBe(
      "https://tickets.hivecity.in/run"
    );
    expect(normalizeBookingUrl("javascript:alert(1)")).toBe("");
  });

  it("parses both YYYY-MM-DD and DD Mon YYYY as local midnight", () => {
    const d1 = parseEventDate("2026-11-26");
    expect(d1?.getFullYear()).toBe(2026);
    expect(d1?.getMonth()).toBe(10);
    expect(d1?.getDate()).toBe(26);
    expect(d1?.getHours()).toBe(0);

    const d2 = parseEventDate("27 Nov 2026");
    expect(d2?.getFullYear()).toBe(2026);
    expect(d2?.getMonth()).toBe(10);
    expect(d2?.getDate()).toBe(27);
    expect(d2?.getHours()).toBe(0);
  });
});
