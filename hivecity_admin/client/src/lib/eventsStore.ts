import {
  resolveEventStatus,
  formatEventFee,
  parseFeeNumber,
  normalizeBookingUrl,
  formatEventSchedule,
  parseEventDate,
  toLocalDateKey,
  SHARED_EVENTS_STORAGE_KEY,
  SHARED_BOOKINGS_STORAGE_KEY,
  EVENTS_UPDATED_EVENT,
  type HiveEventStatus,
  type EventBookingRecord,
} from "../utils/eventLifecycle";

export interface UnifiedEvent {
  id: string;
  name: string;
  title: string;
  description: string;
  location: string;
  type: string;
  date: string;
  eventDate: string;
  endDate: string;
  bookings: string;
  bookingsCount: number;
  capacity: number;
  status: HiveEventStatus;
  completed: boolean;
  feeAmount: number;
  termsAndConditions: string;
  bookingUrl: string;
  imageUrl: string;
  revenue: string;
  hiddenInAdmin?: boolean;
}

export function normalizeUnifiedEvent(id: string, data: Record<string, any>): UnifiedEvent {
  const rawDate = String(data.eventDate || data.date || data.schedule || "").trim();
  const parsed = parseEventDate(rawDate);
  const hasExplicitTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawDate);
  const canonicalIsoDate = hasExplicitTime
    ? rawDate.slice(0, 16)
    : parsed
      ? toLocalDateKey(parsed)
      : rawDate;
  const resolvedStatus = resolveEventStatus({
    status: data.status,
    completed: data.completed,
    eventDate: canonicalIsoDate,
    date: rawDate,
  });
  const feeNum = parseFeeNumber(data.feeAmount ?? data.fee ?? data.price ?? 0);
  const capacity = Math.max(1, Number(data.capacity) || 100);
  const count = Math.max(0, Number(data.bookingsCount ?? data.bookings ?? data.participants ?? 0) || 0);
  const title = String(data.title || data.name || "Community Event").trim();

  return {
    id,
    name: title,
    title,
    description: String(data.description || "").trim(),
    location: String(data.location || "").trim(),
    type: String(data.type || data.category || "RUNNING").toUpperCase(),
    date: formatEventSchedule(canonicalIsoDate || rawDate),
    eventDate: canonicalIsoDate,
    endDate: String(data.endDate || "").trim(),
    bookings: `${count} / ${capacity}`,
    bookingsCount: count,
    capacity,
    status: resolvedStatus,
    completed: resolvedStatus === "completed",
    feeAmount: feeNum,
    termsAndConditions: String(data.termsAndConditions || "").trim(),
    bookingUrl: normalizeBookingUrl(data.bookingUrl),
    imageUrl: String(data.imageUrl || data.coverImage || data.image || "").trim(),
    revenue: formatEventFee(feeNum),
    hiddenInAdmin: Boolean(data.hiddenInAdmin),
  };
}

export function readCachedLocalEvents(): UnifiedEvent[] {
  try {
    const raw = localStorage.getItem(SHARED_EVENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && (item.title || item.name))
      .map((item, idx) => normalizeUnifiedEvent(String(item.id || `local-${idx}`), item));
  } catch {
    return [];
  }
}

export function writeCachedLocalEvents(events: UnifiedEvent[]): void {
  try {
    const serializable = events.map((e) => ({
      id: e.id,
      title: e.title || e.name,
      name: e.name,
      description: e.description || "",
      location: e.location || "",
      eventDate: e.eventDate || "",
      date: e.eventDate || e.date || "",
      endDate: e.endDate || "",
      status: e.status,
      completed: e.status === "completed" || Boolean(e.completed),
      feeAmount: parseFeeNumber(e.feeAmount),
      termsAndConditions: e.termsAndConditions || "",
      bookingUrl: e.bookingUrl || "",
      imageUrl: e.imageUrl || "",
      type: e.type,
      category: e.type,
      capacity: e.capacity || 100,
      bookingsCount: e.bookingsCount || 0,
    }));
    localStorage.setItem(SHARED_EVENTS_STORAGE_KEY, JSON.stringify(serializable));
    window.dispatchEvent(new CustomEvent(EVENTS_UPDATED_EVENT, { detail: serializable }));
  } catch {}
}

/**
 * Shared read source used by BOTH Admin Events & User Events:
 * Merges authoritative server `/api/events` (firebase-admin) with any locally cached events.
 */
export async function getAllEvents(): Promise<UnifiedEvent[]> {
  try {
    const res = await fetch("/api/events", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const remoteList: any[] = Array.isArray(data.events) ? data.events : [];
      const list = remoteList
        .filter((item) => item?.id)
        .map((item) => normalizeUnifiedEvent(String(item.id), item))
        .sort((a, b) => (a.eventDate || "").localeCompare(b.eventDate || ""));
      writeCachedLocalEvents(list);
      return list;
    }
  } catch {}

  const fallback = readCachedLocalEvents().sort((a, b) =>
    (a.eventDate || "").localeCompare(b.eventDate || "")
  );
  return fallback;
}

/**
 * Automatically migrates any events previously trapped in Admin's browser localStorage
 * (e.g., hivevoity on 26 Nov 2026 & hivcity on 27 Nov 2026) up to `/api/events` (Firestore)
 * so the User Activity Events page immediately receives them!
 */
export async function syncLocalEventsToServer(): Promise<UnifiedEvent[]> {
  const localEvents = readCachedLocalEvents();
  const remoteIds = new Set<string>();

  try {
    const res = await fetch("/api/events", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const remoteList: any[] = Array.isArray(data.events) ? data.events : [];
      for (const item of remoteList) {
        if (item?.id) remoteIds.add(String(item.id));
      }
    }
  } catch {
    return localEvents;
  }

  // Push any local-only events up to the server so Firestore & User page get them immediately
  for (const evt of localEvents) {
    if (!remoteIds.has(evt.id)) {
      try {
        await fetch("/api/events", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: evt.id,
            title: evt.title || evt.name,
            name: evt.name,
            description: evt.description,
            location: evt.location,
            eventDate: evt.eventDate || evt.date,
            endDate: evt.endDate,
            status: evt.status,
            completed: evt.completed,
            feeAmount: evt.feeAmount,
            termsAndConditions: evt.termsAndConditions,
            bookingUrl: evt.bookingUrl,
            imageUrl: evt.imageUrl,
            type: evt.type,
            category: evt.type,
            capacity: evt.capacity,
            bookingsCount: evt.bookingsCount,
          }),
        });
      } catch {}
    }
  }

  return getAllEvents();
}

export async function saveEventToServer(
  payload: Record<string, any>,
  existingId?: string
): Promise<UnifiedEvent | null> {
  const url = existingId ? `/api/events/${encodeURIComponent(existingId)}` : "/api/events";
  const method = existingId ? "PATCH" : "POST";
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.event?.id) {
    return normalizeUnifiedEvent(String(data.event.id), data.event);
  }
  return null;
}

export async function markEventCompletedOnServer(eventId: string): Promise<void> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/complete`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
}

export async function deleteEventOnServer(eventId: string): Promise<void> {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
}

export async function deleteEventBookingsInAdminOnServer(eventId: string): Promise<void> {
  const res = await fetch(`/api/events/bookings/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
}

export async function fetchAllBookingsFromServer(): Promise<EventBookingRecord[]> {
  try {
    const res = await fetch("/api/events/bookings", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const list: EventBookingRecord[] = Array.isArray(data.bookings) ? data.bookings : [];
      try {
        localStorage.setItem(SHARED_BOOKINGS_STORAGE_KEY, JSON.stringify(list));
      } catch {}
      return list;
    }
  } catch {}
  try {
    const raw = localStorage.getItem(SHARED_BOOKINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
