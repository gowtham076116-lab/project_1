export type HiveEventStatus = "upcoming" | "ongoing" | "completed";

export interface EventBookingRecord {
  id?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  eventId: string;
  eventTitle?: string;
  eventImage?: string;
  eventDate?: string;
  location?: string;
  bookedAt: string;
  feeAmount: number | string;
  agreedToTerms: boolean;
  bookingUrl?: string;
  hiddenInAdmin?: boolean;
}

export interface HiveEventInput {
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  location?: string;
  eventDate?: string;
  date?: string;
  schedule?: string;
  endDate?: string;
  status?: string;
  completed?: boolean;
  feeAmount?: number | string;
  termsAndConditions?: string;
  bookingUrl?: string;
  category?: string;
  type?: string;
  capacity?: number;
  bookingsCount?: number;
}

export const SHARED_EVENTS_STORAGE_KEY = "hivecity_shared_events";
export const SHARED_BOOKINGS_STORAGE_KEY = "hivecity_event_bookings";
export const EVENTS_UPDATED_EVENT = "hivecity:events-updated";

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Formats a Date into local calendar YYYY-MM-DD for timezone-safe day comparison.
 */
export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parses an event date string/timestamp into a local Date.
 * Supports:
 * - ISO date strings: "2026-11-26"
 * - ISO datetimes: "2026-11-26T06:00:00Z"
 * - Human-readable dates: "26 Nov 2026", "Nov 26, 2026", "27 Nov 2026, 06:00 am"
 * - Firestore Timestamps ({ toDate() } or { seconds })
 * - Numeric epoch ms/sec
 */
export function parseEventDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && value !== null) {
    const maybeTs = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof maybeTs.toDate === "function") {
      const d = maybeTs.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    const secs = typeof maybeTs.seconds === "number" ? maybeTs.seconds : maybeTs._seconds;
    if (typeof secs === "number") {
      return new Date(secs * 1000);
    }
  }
  if (typeof value === "number") {
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // 1. YYYY-MM-DD (local start-of-day)
    const isoDateOnly = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
    if (isoDateOnly) {
      return new Date(
        Number(isoDateOnly[1]),
        Number(isoDateOnly[2]) - 1,
        Number(isoDateOnly[3]),
        0,
        0,
        0,
        0
      );
    }

    // 2. "26 Nov 2026" or "26 November 2026" (with optional trailing time)
    const dmyMatch = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/.exec(trimmed);
    if (dmyMatch) {
      const monthIdx = MONTH_NAME_MAP[dmyMatch[2].toLowerCase()];
      if (monthIdx !== undefined) {
        return new Date(Number(dmyMatch[3]), monthIdx, Number(dmyMatch[1]), 0, 0, 0, 0);
      }
    }

    // 3. "Nov 26, 2026" or "November 26 2026"
    const mdyMatch = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(trimmed);
    if (mdyMatch) {
      const monthIdx = MONTH_NAME_MAP[mdyMatch[1].toLowerCase()];
      if (monthIdx !== undefined) {
        return new Date(Number(mdyMatch[3]), monthIdx, Number(mdyMatch[2]), 0, 0, 0, 0);
      }
    }

    // 4. Fallback native Date parse
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Deterministic event lifecycle status resolver:
 * 1. If Admin marked it completed (status === 'completed' / 'complete' / 'done' or completed === true) => 'completed'
 * 2. Else if today's date (YYYY-MM-DD) >= event's scheduled date (YYYY-MM-DD) => 'ongoing'
 * 3. Else (future dates like "26 Nov 2026" and "27 Nov 2026") => 'upcoming'
 */
export function resolveEventStatus(
  event: Pick<HiveEventInput, "status" | "completed" | "eventDate" | "date" | "schedule">,
  now: Date = new Date()
): HiveEventStatus {
  const rawStatus = String(event.status || "").trim().toLowerCase();
  if (
    event.completed === true ||
    rawStatus === "completed" ||
    rawStatus === "complete" ||
    rawStatus === "done"
  ) {
    return "completed";
  }

  const start = parseEventDate(event.eventDate || event.date || event.schedule);
  if (start) {
    const todayKey = toLocalDateKey(now);
    const eventKey = toLocalDateKey(start);
    if (todayKey >= eventKey) {
      return "ongoing";
    }
    return "upcoming";
  }

  if (rawStatus === "ongoing" || rawStatus === "live") {
    return "ongoing";
  }

  return "upcoming";
}

export const getEventLifecycleStatus = resolveEventStatus;

/**
 * Formats an event entry fee cleanly (e.g. 0 => "Free", 500 => "₹500", "₹499" => "₹499").
 */
export function formatEventFee(feeAmount?: number | string | null): string {
  if (feeAmount === undefined || feeAmount === null || feeAmount === "") {
    return "Free";
  }
  if (typeof feeAmount === "number") {
    if (!Number.isFinite(feeAmount) || feeAmount <= 0) return "Free";
    return `₹${feeAmount.toLocaleString("en-IN")}`;
  }
  const str = String(feeAmount).trim();
  if (!str || str.toLowerCase() === "free") return "Free";
  const numeric = Number(str.replace(/[₹,\s]/g, ""));
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return "Free";
    return `₹${numeric.toLocaleString("en-IN")}`;
  }
  return str;
}

/**
 * Parses numeric fee value for storage/revenue calculations.
 */
export function parseFeeNumber(feeAmount?: number | string | null): number {
  if (feeAmount === undefined || feeAmount === null || feeAmount === "") return 0;
  if (typeof feeAmount === "number") return Number.isFinite(feeAmount) && feeAmount > 0 ? feeAmount : 0;
  const cleaned = Number(String(feeAmount).replace(/[₹,\s]/g, ""));
  return Number.isFinite(cleaned) && cleaned > 0 ? cleaned : 0;
}

/**
 * Normalizes an optional external booking URL. Only allows http(s) URLs.
 * Returns "" if empty or invalid so callers safely fall back to in-app confirmation.
 */
export function normalizeBookingUrl(rawUrl?: string | null): string {
  if (!rawUrl) return "";
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Formats an ISO date/datetime for human-readable schedule display.
 */
export function formatEventSchedule(eventDate?: string | null): string {
  const d = parseEventDate(eventDate);
  if (!d) return eventDate ? String(eventDate) : "TBD";
  const isDateOnly =
    typeof eventDate === "string" &&
    (/^\d{4}-\d{1,2}-\d{1,2}$/.test(eventDate.trim()) ||
      /^\d{1,2}\s+[A-Za-z]+,?\s+\d{4}$/.test(eventDate.trim()));
  if (isDateOnly) {
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
