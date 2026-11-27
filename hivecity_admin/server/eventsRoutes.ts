import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response, NextFunction } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { firestore, isFirestoreQuotaBackoffActive, noteFirestoreError } from "./firebaseAdmin";
import { requireAdminSession, syncRecordToGoogleSheet } from "./adminAuth";
import { isAdminHidden, markAdminHidden, unmarkAdminHidden } from "./adminHiddenStore";

async function postBookingActionToAppsScript(
  action: "read_bookings" | "upsert_booking" | "delete_booking" | "batch_upsert_bookings",
  extra: Record<string, any> = {}
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const result = await syncRecordToGoogleSheet(action, extra, { retries: 1 });
  return { ok: result.ok, data: result.data, error: result.error };
}

const LOCAL_EVENTS_FILE = path.resolve(import.meta.dirname, "events_store.json");
const LOCAL_BOOKINGS_FILE = path.resolve(import.meta.dirname, "event_bookings_store.json");

interface StoredEvent {
  id: string;
  title: string;
  name: string;
  description: string;
  location: string;
  eventDate: string;
  date: string;
  endDate: string;
  status: "upcoming" | "ongoing" | "completed";
  completed: boolean;
  feeAmount: number;
  termsAndConditions: string;
  bookingUrl: string;
  imageUrl: string;
  type: string;
  category: string;
  capacity: number;
  bookingsCount: number;
  createdAt?: string;
  updatedAt?: string;
}

interface StoredBooking {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  eventId: string;
  eventTitle: string;
  eventImage?: string;
  eventDate?: string;
  location?: string;
  bookedAt: string;
  feeAmount: number;
  agreedToTerms: boolean;
  bookingUrl: string;
  hiddenInAdmin?: boolean;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseServerEventDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && value !== null) {
    const ts = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof ts.toDate === "function") return ts.toDate();
    const s = typeof ts.seconds === "number" ? ts.seconds : ts._seconds;
    if (typeof s === "number") return new Date(s * 1000);
  }
  if (typeof value === "number") return new Date(value < 1e12 ? value * 1000 : value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 0, 0, 0, 0);
    const dmy = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/.exec(trimmed);
    if (dmy && MONTH_MAP[dmy[2].toLowerCase()] !== undefined) {
      return new Date(Number(dmy[3]), MONTH_MAP[dmy[2].toLowerCase()], Number(dmy[1]), 0, 0, 0, 0);
    }
    const mdy = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(trimmed);
    if (mdy && MONTH_MAP[mdy[1].toLowerCase()] !== undefined) {
      return new Date(Number(mdy[3]), MONTH_MAP[mdy[1].toLowerCase()], Number(mdy[2]), 0, 0, 0, 0);
    }
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function resolveServerEventStatus(data: Record<string, any>): "upcoming" | "ongoing" | "completed" {
  const raw = String(data.status || "").trim().toLowerCase();
  if (data.completed === true || raw === "completed" || raw === "ended" || raw === "complete" || raw === "done") {
    return "completed";
  }
  const d = parseServerEventDate(data.eventDate || data.date || data.schedule);
  if (d) {
    return toLocalDateKey(new Date()) >= toLocalDateKey(d) ? "ongoing" : "upcoming";
  }
  if (raw === "ongoing" || raw === "live") return "ongoing";
  return "upcoming";
}

function isServerEventCompletedOrExpired(data: Record<string, any> | undefined, fallbackDate?: string): boolean {
  if (data) {
    const raw = String(data.status || "").trim().toLowerCase();
    if (data.completed === true || raw === "completed" || raw === "ended" || raw === "complete" || raw === "done") {
      return true;
    }
  }
  const rawEnd = String(data?.endDate || data?.eventDate || data?.date || fallbackDate || "").trim();
  if (!rawEnd) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawEnd)) {
    const [y, m, day] = rawEnd.split("-").map(Number);
    const endOfDay = new Date(y, m - 1, day, 23, 59, 59, 999);
    return Date.now() > endOfDay.getTime();
  }
  const parsed = parseServerEventDate(rawEnd);
  if (!parsed) return false;
  return Date.now() > parsed.getTime();
}

async function purgeEventTicketsPermanently(eventId: string): Promise<number> {
  const cleanId = String(eventId || "").trim();
  if (!cleanId) return 0;

  const existingLocal = readJsonFile<StoredBooking>(LOCAL_BOOKINGS_FILE);
  const remainingLocal = existingLocal.filter((b) => String(b.eventId || "") !== cleanId);
  const localRemoved = existingLocal.length - remainingLocal.length;
  if (localRemoved > 0) {
    writeJsonFile(LOCAL_BOOKINGS_FILE, remainingLocal);
  }

  let firestoreRemoved = 0;
  if (!isFirestoreQuotaBackoffActive()) {
    try {
      const snap = await firestore
        .collection("event_bookings")
        .where("eventId", "==", cleanId)
        .get();
      if (!snap.empty) {
        await Promise.all(snap.docs.map((d) => d.ref.delete()));
        firestoreRemoved = snap.size;
      }
      await firestore.collection("events").doc(cleanId).set(
        { bookingsCount: 0, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (fsErr) {
      noteFirestoreError(fsErr);
    }
  }

  const updatedEvents = readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE).map((e) =>
    e.id === cleanId ? { ...e, bookingsCount: 0 } : e
  );
  writeJsonFile(LOCAL_EVENTS_FILE, updatedEvents);

  return Math.max(localRemoved, firestoreRemoved);
}

function parseFee(val: unknown): number {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) && val > 0 ? val : 0;
  const n = Number(String(val).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sanitizeUrl(raw: unknown): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

function readJsonFile<T>(filePath: string): T[] {
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch { }
  return [];
}

function writeJsonFile<T>(filePath: string, data: T[]) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("[EventsAPI] Could not write local backup file:", err);
  }
}

function sanitizeImageUrl(raw: unknown): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)) {
    return trimmed.length <= 900_000 ? trimmed : "";
  }
  if (/^(assets\/|\/assets\/)/i.test(trimmed)) return trimmed;
  return sanitizeUrl(trimmed);
}

function isTestArtifactEvent(raw: Record<string, any> | null | undefined): boolean {
  if (!raw || typeof raw !== "object") return false;
  const text = `${raw.title || ""} ${raw.name || ""} ${raw.id || ""}`.toLowerCase();
  return text.includes("__verify_e2e") || text.includes("__smoke_");
}

function normalizeEventRecord(id: string, raw: Record<string, any>): StoredEvent {
  const title = String(raw.title || raw.name || "Community Event").trim();
  const rawDateStr = String(raw.eventDate || raw.date || raw.schedule || "").trim();
  const parsedDate = parseServerEventDate(rawDateStr);
  const hasExplicitTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawDateStr);
  const canonicalDate = hasExplicitTime
    ? rawDateStr.slice(0, 16)
    : parsedDate
      ? toLocalDateKey(parsedDate)
      : rawDateStr;
  const status = resolveServerEventStatus({ ...raw, eventDate: canonicalDate });
  const feeAmount = parseFee(raw.feeAmount ?? raw.fee ?? raw.price ?? 0);
  const imageUrl = sanitizeImageUrl(raw.imageUrl || raw.coverImage || raw.image || "");
  return {
    id,
    title,
    name: title,
    description: String(raw.description || "").trim(),
    location: String(raw.location || "").trim(),
    eventDate: canonicalDate,
    date: canonicalDate,
    endDate: String(raw.endDate || "").trim(),
    status,
    completed: status === "completed",
    feeAmount,
    termsAndConditions: String(raw.termsAndConditions || "").trim(),
    bookingUrl: sanitizeUrl(raw.bookingUrl),
    imageUrl,
    type: String(raw.type || raw.category || "RUNNING").toUpperCase(),
    category: String(raw.category || raw.type || "Running"),
    capacity: Math.max(1, Number(raw.capacity) || 100),
    bookingsCount: Math.max(0, Number(raw.bookingsCount ?? raw.bookings ?? 0) || 0),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function applyEventsCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

export async function backfillBookingsToGoogleSheet(): Promise<{
  total: number;
  synced: number;
  error: string | null;
}> {
  const byId = new Map<string, StoredBooking>();
  if (!isFirestoreQuotaBackoffActive()) {
    try {
      const snap = await firestore.collection("event_bookings").get();
      snap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        byId.set(docSnap.id, {
          id: docSnap.id,
          userId: String(d.userId || ""),
          userName: String(d.userName || "Hive Athlete"),
          userEmail: String(d.userEmail || ""),
          eventId: String(d.eventId || ""),
          eventTitle: String(d.eventTitle || "Hivecity Event"),
          eventImage: sanitizeImageUrl(d.eventImage || d.imageUrl || ""),
          eventDate: String(d.eventDate || d.date || ""),
          location: String(d.location || ""),
          bookedAt: String(d.bookedAt || new Date().toISOString()),
          feeAmount: parseFee(d.feeAmount),
          agreedToTerms: true,
          bookingUrl: sanitizeUrl(d.bookingUrl),
        });
      });
    } catch (fsErr) {
      noteFirestoreError(fsErr);
    }
  }
  for (const b of readJsonFile<StoredBooking>(LOCAL_BOOKINGS_FILE)) {
    const key = b.id || `${b.eventId}_${b.userId}`;
    if (!byId.has(key)) byId.set(key, b);
  }
  const list = Array.from(byId.values()).map((b) => ({
    ...b,
    eventName: b.eventTitle,
    bookingStatus: "Booked",
  }));
  if (list.length === 0) return { total: 0, synced: 0, error: null };
  const batchRes = await postBookingActionToAppsScript("batch_upsert_bookings", { bookings: list });
  if (batchRes.ok) {
    return { total: list.length, synced: Number(batchRes.data?.synced ?? list.length), error: null };
  }
  return { total: list.length, synced: 0, error: batchRes.error || "Apps Script booking backfill failed" };
}

export function registerEventsRoutes(app: Express) {
  app.use("/api/events", applyEventsCors);

  // GET /api/events — Shared source of truth for BOTH Admin Panel & User Activity Events page
  app.get("/api/events", async (_req: Request, res: Response) => {
    try {
      const eventMap: Record<string, StoredEvent> = {};

      // 1. Load authoritative Firestore events via firebase-admin (also merge any _localOnly fallback entries)
      let loadedEventsFromFirestore = false;
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const snap = await firestore.collection("events").get();
          snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            if (isTestArtifactEvent({ ...d, id: docSnap.id })) return;
            eventMap[docSnap.id] = normalizeEventRecord(docSnap.id, d);
          });
          loadedEventsFromFirestore = true;
        } catch (fsErr) {
          noteFirestoreError(fsErr);
          if (!isFirestoreQuotaBackoffActive()) {
            console.warn("[EventsAPI] Firestore read fallback:", fsErr);
          }
        }
      }

      for (const localEvt of readJsonFile<StoredEvent & { _localOnly?: boolean }>(LOCAL_EVENTS_FILE)) {
        if (!localEvt?.id || isTestArtifactEvent(localEvt)) continue;
        if (!loadedEventsFromFirestore || (localEvt._localOnly && !eventMap[localEvt.id])) {
          eventMap[localEvt.id] = normalizeEventRecord(localEvt.id, localEvt);
        }
      }

      // 2. Reconcile exact booking counts from event_bookings
      const bookingsCountMap: Record<string, number> = {};
      let loadedBookingsFromFirestore = false;
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const bSnap = await firestore.collection("event_bookings").get();
          bSnap.forEach((docSnap) => {
            const eid = String(docSnap.data().eventId || "");
            if (eid) bookingsCountMap[eid] = (bookingsCountMap[eid] || 0) + 1;
          });
          loadedBookingsFromFirestore = true;
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
      }

      if (!loadedBookingsFromFirestore) {
        for (const lb of readJsonFile<StoredBooking>(LOCAL_BOOKINGS_FILE)) {
          if (lb?.eventId) bookingsCountMap[lb.eventId] = (bookingsCountMap[lb.eventId] || 0) + 1;
        }
      }

      const events = Object.values(eventMap)
        .map((evt) => ({
          ...evt,
          hiddenInAdmin: isAdminHidden("events", evt.id),
          bookingsCount: loadedBookingsFromFirestore
            ? (bookingsCountMap[evt.id] || 0)
            : Math.max(evt.bookingsCount || 0, bookingsCountMap[evt.id] || 0),
        }))
        .sort((a, b) => (a.eventDate || "").localeCompare(b.eventDate || ""));

      res.json({ events, count: events.length });
    } catch (error) {
      console.error("[EventsAPI] GET /api/events failed:", error);
      res.status(500).json({ error: "Failed to load events" });
    }
  });

  // GET /api/events/bookings — Return authoritative bookings list enriched with event metadata
  app.get("/api/events/bookings", async (_req: Request, res: Response) => {
    try {
      const bookingMap: Record<string, StoredBooking> = {};
      let loadedFromFirestore = false;
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const snap = await firestore.collection("event_bookings").get();
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            bookingMap[docSnap.id] = {
              id: docSnap.id,
              userId: String(d.userId || ""),
              userName: String(d.userName || ""),
              userEmail: String(d.userEmail || ""),
              eventId: String(d.eventId || ""),
              eventTitle: String(d.eventTitle || ""),
              eventImage: sanitizeImageUrl(d.eventImage || d.imageUrl || ""),
              eventDate: String(d.eventDate || d.date || ""),
              location: String(d.location || ""),
              bookedAt: String(d.bookedAt || ""),
              feeAmount: parseFee(d.feeAmount),
              agreedToTerms: Boolean(d.agreedToTerms),
              bookingUrl: sanitizeUrl(d.bookingUrl),
            };
          });
          loadedFromFirestore = true;
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
      }

      for (const b of readJsonFile<StoredBooking>(LOCAL_BOOKINGS_FILE)) {
        const key = b.id || `${b.eventId}_${b.userId}`;
        if (!loadedFromFirestore || !bookingMap[key]) {
          bookingMap[key] = b;
        }
      }

      const localEventsById = new Map<string, StoredEvent>();
      for (const evt of readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE)) {
        if (evt?.id) localEventsById.set(evt.id, evt);
      }

      const expiredEventIds = new Set<string>();
      const bookings = Object.values(bookingMap)
        .filter((b) => {
          const evt = localEventsById.get(b.eventId);
          if (isServerEventCompletedOrExpired(evt, b.eventDate)) {
            if (b.eventId) expiredEventIds.add(b.eventId);
            return false;
          }
          return true;
        })
        .map((b) => {
          const evt = localEventsById.get(b.eventId);
          return {
            ...b,
            eventTitle: b.eventTitle || evt?.title || evt?.name || "Hivecity Event",
            eventImage: b.eventImage || evt?.imageUrl || "",
            eventDate: b.eventDate || evt?.eventDate || evt?.date || "",
            location: b.location || evt?.location || "",
            feeAmount: b.feeAmount || evt?.feeAmount || 0,
            hiddenInAdmin: isAdminHidden("bookings", b.eventId),
          };
        })
        .sort((a, b) => (b.bookedAt || "").localeCompare(a.bookedAt || ""));

      if (expiredEventIds.size > 0) {
        void Promise.all(Array.from(expiredEventIds).map((eid) => purgeEventTicketsPermanently(eid)));
      }

      res.json({ bookings, count: bookings.length });
    } catch (error) {
      console.error("[EventsAPI] GET /api/events/bookings failed:", error);
      res.status(500).json({ error: "Failed to load bookings" });
    }
  });

  // DELETE /api/events/bookings/:eventId — Admin-scoped removal of all booking data for ONE event only
  // Keeps all other events' bookings untouched AND does NOT delete the event from User pages.
  app.delete("/api/events/bookings/:eventId", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;

    try {
      const eventId = String(req.params.eventId || "").trim();
      if (!eventId) {
        res.status(400).json({ error: "Event ID is required" });
        return;
      }

      const hardDelete = String(req.query.hard || "").toLowerCase() === "true";
      if (!hardDelete) {
        markAdminHidden("bookings", eventId);
        res.json({ success: true, eventId, hiddenInAdmin: true, deleted: true });
        return;
      }

      unmarkAdminHidden("bookings", eventId);
      const remaining = readJsonFile<StoredBooking>(LOCAL_BOOKINGS_FILE).filter(
        (b) => b.eventId !== eventId
      );
      writeJsonFile(LOCAL_BOOKINGS_FILE, remaining);

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const snap = await firestore
            .collection("event_bookings")
            .where("eventId", "==", eventId)
            .get();
          await Promise.all(snap.docs.map((d) => d.ref.delete()));
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
      }

      res.json({ success: true, eventId, deleted: true, hardDeleted: true });
    } catch (error) {
      console.error("[EventsAPI] DELETE /api/events/bookings/:eventId failed:", error);
      res.status(500).json({ error: "Failed to delete event bookings" });
    }
  });

  // POST /api/events — Admin-protected create/upsert event via firebase-admin
  app.post("/api/events", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;

    try {
      const body = req.body || {};
      const requestedId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
      const docRef = requestedId
        ? firestore.collection("events").doc(requestedId)
        : firestore.collection("events").doc();
      const eventId = docRef.id;
      const normalized = normalizeEventRecord(eventId, body);

      // Write to Firestore via firebase-admin (authoritative shared store)
      let firestoreSaved = false;
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await docRef.set(
            {
              ...normalized,
              updatedAt: FieldValue.serverTimestamp(),
              createdAt: body.createdAt || FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          firestoreSaved = true;
        } catch (fsErr) {
          noteFirestoreError(fsErr);
          if (!isFirestoreQuotaBackoffActive()) {
            console.warn("[EventsAPI] Firestore write fallback:", fsErr);
          }
        }
      }

      // Mirror to local backup file & ensure newly created/updated event is visible in Admin
      unmarkAdminHidden("events", eventId);
      const localRecord = firestoreSaved ? normalized : { ...normalized, _localOnly: true };
      const local = readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE).filter((e) => e.id !== eventId);
      local.unshift(localRecord);
      writeJsonFile(LOCAL_EVENTS_FILE, local);

      res.status(201).json({ success: true, event: normalized, persistedToFirestore: firestoreSaved });
    } catch (error) {
      console.error("[EventsAPI] POST /api/events failed:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  // PATCH /api/events/:id — Admin-protected event update
  app.patch("/api/events/:id", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;

    try {
      const eventId = String(req.params.id || "").trim();
      if (!eventId) {
        res.status(400).json({ error: "Event ID is required" });
        return;
      }

      let existing: Record<string, any> = {};
      try {
        const snap = await firestore.collection("events").doc(eventId).get();
        if (snap.exists) existing = snap.data() || {};
      } catch { }
      const localList = readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE);
      const localExisting = localList.find((e) => e.id === eventId);
      const merged = normalizeEventRecord(eventId, { ...localExisting, ...existing, ...(req.body || {}) });

      try {
        await firestore
          .collection("events")
          .doc(eventId)
          .set({ ...merged, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      } catch (fsErr) {
        console.warn("[EventsAPI] Firestore patch fallback:", fsErr);
      }

      const nextLocal = [merged, ...localList.filter((e) => e.id !== eventId)];
      writeJsonFile(LOCAL_EVENTS_FILE, nextLocal);

      if (merged.status === "completed" || merged.completed) {
        await purgeEventTicketsPermanently(eventId);
      }

      res.json({ success: true, event: merged });
    } catch (error) {
      console.error("[EventsAPI] PATCH /api/events/:id failed:", error);
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  // POST /api/events/:id/complete — Admin-protected Mark Completed
  app.post("/api/events/:id/complete", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;

    try {
      const eventId = String(req.params.id || "").trim();
      if (!eventId) {
        res.status(400).json({ error: "Event ID is required" });
        return;
      }

      try {
        await firestore.collection("events").doc(eventId).set(
          {
            status: "completed",
            completed: true,
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (fsErr) {
        console.warn("[EventsAPI] Firestore complete fallback:", fsErr);
      }

      const localList = readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE).map((e) =>
        e.id === eventId ? { ...e, status: "completed" as const, completed: true, bookingsCount: 0 } : e
      );
      writeJsonFile(LOCAL_EVENTS_FILE, localList);

      // Permanently delete all associated ticket documents when an event is completed
      const deletedTickets = await purgeEventTicketsPermanently(eventId);

      res.json({ success: true, id: eventId, status: "completed", deletedTickets });
    } catch (error) {
      console.error("[EventsAPI] POST /api/events/:id/complete failed:", error);
      res.status(500).json({ error: "Failed to mark event completed" });
    }
  });

  // DELETE /api/events/:id — Admin-scoped soft-hide (does NOT delete from User pages unless ?hard=true)
  app.delete("/api/events/:id", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;

    try {
      const eventId = String(req.params.id || "").trim();
      if (!eventId) {
        res.status(400).json({ error: "Event ID is required" });
        return;
      }

      const hardDelete = String(req.query.hard || "").toLowerCase() === "true";
      // Permanently delete associated ticket documents whenever an event is deleted/ended
      await purgeEventTicketsPermanently(eventId);
      if (!hardDelete) {
        markAdminHidden("events", eventId);
        res.json({ success: true, id: eventId, hiddenInAdmin: true, deleted: true });
        return;
      }

      unmarkAdminHidden("events", eventId);
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore.collection("events").doc(eventId).delete();
          const relatedBookings = await firestore
            .collection("event_bookings")
            .where("eventId", "==", eventId)
            .get();
          await Promise.all(relatedBookings.docs.map((d) => d.ref.delete()));
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
      }

      const localList = readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE).filter((e) => e.id !== eventId);
      writeJsonFile(LOCAL_EVENTS_FILE, localList);
      const localBookings = readJsonFile<StoredBooking>(LOCAL_BOOKINGS_FILE).filter((b) => b.eventId !== eventId);
      writeJsonFile(LOCAL_BOOKINGS_FILE, localBookings);

      res.json({ success: true, id: eventId, deleted: true, hardDeleted: true });
    } catch (error) {
      console.error("[EventsAPI] DELETE /api/events/:id failed:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // POST /api/events/:id/book — Record user booking & update authoritative bookingsCount
  app.post("/api/events/:id/book", async (req: Request, res: Response) => {
    try {
      const eventId = String(req.params.id || "").trim();
      const body = req.body || {};
      if (!eventId) {
        res.status(400).json({ error: "Event ID is required" });
        return;
      }
      if (!body.agreedToTerms) {
        res.status(400).json({ error: "You must agree to the Terms & Conditions before booking." });
        return;
      }

      const userId = String(body.userId || "guest-athlete").trim();
      const isGuest = !userId || userId === "guest-athlete";
      const requestedBookingId =
        typeof body.id === "string" && body.id.trim()
          ? body.id.trim().replace(/[^a-zA-Z0-9_-]/g, "")
          : "";
      const bookingId = isGuest
        ? requestedBookingId || `${eventId}_guest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        : `${eventId}_${userId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
      const matchedEvent = readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE).find((e) => e.id === eventId);
      const booking: StoredBooking = {
        id: bookingId,
        userId,
        userName: String(body.userName || "Hive Athlete").trim(),
        userEmail: String(body.userEmail || "").trim(),
        eventId,
        eventTitle: String(body.eventTitle || matchedEvent?.title || matchedEvent?.name || "Hivecity Event").trim(),
        eventImage: sanitizeImageUrl(body.eventImage || body.imageUrl || matchedEvent?.imageUrl || ""),
        eventDate: String(body.eventDate || body.date || matchedEvent?.eventDate || matchedEvent?.date || "").trim(),
        location: String(body.location || matchedEvent?.location || "").trim(),
        bookedAt: new Date().toISOString(),
        feeAmount: parseFee(body.feeAmount ?? matchedEvent?.feeAmount),
        agreedToTerms: true,
        bookingUrl: sanitizeUrl(body.bookingUrl || matchedEvent?.bookingUrl),
      };

      unmarkAdminHidden("bookings", eventId);
      const localBookings = readJsonFile<StoredBooking>(LOCAL_BOOKINGS_FILE);
      const nextBookings = [booking, ...localBookings.filter((b) => b.id !== bookingId)];
      writeJsonFile(LOCAL_BOOKINGS_FILE, nextBookings);

      let bookingsCount = nextBookings.filter((b) => b.eventId === eventId).length;

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const bRef = firestore.collection("event_bookings").doc(bookingId);
          await bRef.set({ ...booking, createdAt: FieldValue.serverTimestamp() }, { merge: true });
          const countSnap = await firestore
            .collection("event_bookings")
            .where("eventId", "==", eventId)
            .get();
          bookingsCount = countSnap.size;
          await firestore.collection("events").doc(eventId).set(
            {
              bookingsCount,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch (fsErr) {
          noteFirestoreError(fsErr);
          if (!isFirestoreQuotaBackoffActive()) {
            console.warn("[EventsAPI] Firestore booking fallback:", fsErr);
          }
        }
      }
      const localEvents = readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE).map((e) =>
        e.id === eventId ? { ...e, bookingsCount } : e
      );
      writeJsonFile(LOCAL_EVENTS_FILE, localEvents);

      // Sync confirmed booking to Google Sheets "Ticketing & bookings" tab
      const sheetSyncResult = await postBookingActionToAppsScript("upsert_booking", {
        booking: {
          ...booking,
          eventName: booking.eventTitle,
          bookingStatus: "Booked",
        },
      });
      if (!sheetSyncResult.ok) {
        console.warn("[EventsAPI] Google Sheets booking sync warning:", sheetSyncResult.error);
      }

      res.status(201).json({
        success: true,
        booking,
        bookingsCount,
        sheetSynced: sheetSyncResult.ok,
        sheetError: sheetSyncResult.ok ? null : sheetSyncResult.error || null,
      });
    } catch (error) {
      console.error("[EventsAPI] POST /api/events/:id/book failed:", error);
      res.status(500).json({ error: "Failed to record booking" });
    }
  });

  // POST /api/events/book — Convenience alias accepting eventId in request body
  app.post("/api/events/book", (req: Request, res: Response, next: NextFunction) => {
    const eid = String(req.body?.eventId || "").trim();
    if (!eid) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }
    req.url = `/api/events/${encodeURIComponent(eid)}/book`;
    next("route");
  });

  // GET /api/admin/bookings — Admin-protected bookings stream reconciled with Google Sheets "Ticketing & bookings" tab
  app.get("/api/admin/bookings", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    try {
      const bookingMap: Record<string, StoredBooking> = {};
      let sheetSynced = false;

      const sheetBookingIds = new Set<string>();
      const sheetRes = await postBookingActionToAppsScript("read_bookings");
      if (sheetRes.ok && Array.isArray(sheetRes.data?.bookings)) {
        sheetSynced = true;
        for (const row of sheetRes.data.bookings) {
          const bid = String(row.id || row.Booking_ID || "").trim();
          const eid = String(row.eventId || row.Event_ID || "").trim();
          if (!bid && !eid) continue;
          const key = bid || `${eid}_${row.userId || ""}`;
          sheetBookingIds.add(key);
          bookingMap[key] = {
            id: key,
            userId: String(row.userId || row.User_ID || ""),
            userName: String(row.userName || row.User_Name || "Hive Athlete"),
            userEmail: String(row.userEmail || row.User_Email || ""),
            eventId: eid,
            eventTitle: String(row.eventTitle || row.Event_Name || "Hivecity Event"),
            bookedAt: String(row.bookedAt || row.Booked_At || ""),
            feeAmount: parseFee(row.feeAmount ?? row.Fee_Amount),
            agreedToTerms: true,
            bookingUrl: "",
          };
        }
      }

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const snap = await firestore.collection("event_bookings").get();
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            bookingMap[docSnap.id] = {
              id: docSnap.id,
              userId: String(d.userId || ""),
              userName: String(d.userName || ""),
              userEmail: String(d.userEmail || ""),
              eventId: String(d.eventId || ""),
              eventTitle: String(d.eventTitle || ""),
              eventImage: sanitizeImageUrl(d.eventImage || d.imageUrl || ""),
              eventDate: String(d.eventDate || d.date || ""),
              location: String(d.location || ""),
              bookedAt: String(d.bookedAt || ""),
              feeAmount: parseFee(d.feeAmount),
              agreedToTerms: Boolean(d.agreedToTerms),
              bookingUrl: sanitizeUrl(d.bookingUrl),
            };
          });
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
      }

      for (const b of readJsonFile<StoredBooking>(LOCAL_BOOKINGS_FILE)) {
        const key = b.id || `${b.eventId}_${b.userId}`;
        bookingMap[key] = { ...bookingMap[key], ...b };
      }

      const localEventsById = new Map<string, StoredEvent>();
      for (const evt of readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE)) {
        if (evt?.id) localEventsById.set(evt.id, evt);
      }

      const bookings = Object.values(bookingMap)
        .map((b) => {
          const evt = localEventsById.get(b.eventId);
          return {
            ...b,
            eventTitle: b.eventTitle || evt?.title || evt?.name || "Hivecity Event",
            eventImage: b.eventImage || evt?.imageUrl || "",
            eventDate: b.eventDate || evt?.eventDate || evt?.date || "",
            location: b.location || evt?.location || "",
            feeAmount: b.feeAmount || evt?.feeAmount || 0,
            hiddenInAdmin: isAdminHidden("bookings", b.eventId),
          };
        })
        .sort((a, b) => (b.bookedAt || "").localeCompare(a.bookedAt || ""));

      // Automatic background reconciliation: silently sync any un-synced bookings into "Ticketing & bookings"
      if (sheetSynced) {
        const missingBookings = bookings
          .filter((b) => !sheetBookingIds.has(b.id))
          .map((b) => ({ ...b, eventName: b.eventTitle, bookingStatus: "Booked" }));
        if (missingBookings.length > 0) {
          void postBookingActionToAppsScript("batch_upsert_bookings", { bookings: missingBookings });
        }
      }

      res.json({ success: true, bookings, count: bookings.length, sheetSynced });
    } catch (error) {
      console.error("[EventsAPI] GET /api/admin/bookings failed:", error);
      res.status(500).json({ error: "Failed to load admin bookings" });
    }
  });

  // POST /api/events/cancel — Convenience alias accepting cancellation payload in body
  app.post("/api/events/cancel", (req: Request, res: Response, next: NextFunction) => {
    const eid = String(req.body?.eventId || "").trim();
    if (!eid) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }
    req.method = "DELETE";
    req.url = `/api/events/${encodeURIComponent(eid)}/book`;
    next("route");
  });

  // DELETE /api/events/:id/book — Cancel a user's booking, recalculate bookingsCount, and log "Cancelled" in Google Sheets
  app.delete("/api/events/:id/book", async (req: Request, res: Response) => {
    try {
      const eventId = String(req.params.id || "").trim();
      const body = req.body || {};
      const bookingId = String(body.bookingId || body.id || req.query.bookingId || "").trim();
      const userId = String(body.userId || req.query.userId || "").trim();
      if (!eventId) {
        res.status(400).json({ error: "Event ID is required" });
        return;
      }

      const candidateIds = new Set<string>();
      if (bookingId) candidateIds.add(bookingId);
      if (userId && userId !== "guest-athlete") {
        candidateIds.add(`${eventId}_${userId.replace(/[^a-zA-Z0-9_-]/g, "")}`);
      }

      const allLocalBookings = readJsonFile<StoredBooking>(LOCAL_BOOKINGS_FILE);
      const cancelledRecord = allLocalBookings.find((b) => {
        if (b.eventId !== eventId) return false;
        if (candidateIds.has(b.id)) return true;
        if (userId && userId !== "guest-athlete" && b.userId === userId) return true;
        return false;
      });
      const matchedEvent = readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE).find((e) => e.id === eventId);

      const localBookings = allLocalBookings.filter((b) => {
        if (b.eventId !== eventId) return true;
        if (candidateIds.has(b.id)) return false;
        if (userId && userId !== "guest-athlete" && b.userId === userId) return false;
        return true;
      });
      writeJsonFile(LOCAL_BOOKINGS_FILE, localBookings);

      let bookingsCount = localBookings.filter((b) => b.eventId === eventId).length;

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          for (const id of candidateIds) {
            await firestore.collection("event_bookings").doc(id).delete();
          }
          if (userId && userId !== "guest-athlete") {
            const userSnap = await firestore
              .collection("event_bookings")
              .where("eventId", "==", eventId)
              .where("userId", "==", userId)
              .get();
            await Promise.all(userSnap.docs.map((d) => d.ref.delete()));
          }
          const remainingSnap = await firestore
            .collection("event_bookings")
            .where("eventId", "==", eventId)
            .get();
          bookingsCount = remainingSnap.size;
          await firestore.collection("events").doc(eventId).set(
            {
              bookingsCount,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch (fsErr) {
          noteFirestoreError(fsErr);
          if (!isFirestoreQuotaBackoffActive()) {
            console.warn("[EventsAPI] Firestore cancel booking fallback:", fsErr);
          }
        }
      }

      const localEvents = readJsonFile<StoredEvent>(LOCAL_EVENTS_FILE).map((e) =>
        e.id === eventId ? { ...e, bookingsCount } : e
      );
      writeJsonFile(LOCAL_EVENTS_FILE, localEvents);

      // Update Booking_Status -> "Cancelled" in Google Sheets "Ticketing & bookings" tab (audit trail preserved!)
      const resolvedBookingId =
        cancelledRecord?.id || bookingId || Array.from(candidateIds)[0] || `${eventId}_${userId || "guest"}_${Date.now()}`;
      const resolvedTitle =
        cancelledRecord?.eventTitle ||
        String(body.eventTitle || matchedEvent?.title || matchedEvent?.name || "Hivecity Event").trim();
      const cancelSheetPayload = {
        id: resolvedBookingId,
        bookingId: resolvedBookingId,
        eventId,
        eventTitle: resolvedTitle,
        eventName: resolvedTitle,
        userId: cancelledRecord?.userId || userId || "guest-athlete",
        userName: cancelledRecord?.userName || String(body.userName || "Hive Athlete").trim(),
        userEmail: cancelledRecord?.userEmail || String(body.userEmail || "").trim(),
        bookingStatus: "Cancelled",
        feeAmount: cancelledRecord?.feeAmount ?? parseFee(body.feeAmount ?? matchedEvent?.feeAmount),
        bookedAt: new Date().toISOString(),
      };
      const sheetCancelResult = await postBookingActionToAppsScript("upsert_booking", {
        booking: cancelSheetPayload,
      });
      if (!sheetCancelResult.ok) {
        console.warn("[EventsAPI] Google Sheets cancel status sync warning:", sheetCancelResult.error);
      }

      res.json({
        success: true,
        eventId,
        bookingsCount,
        bookingStatus: "Cancelled",
        sheetSynced: sheetCancelResult.ok,
        sheetError: sheetCancelResult.ok ? null : sheetCancelResult.error || null,
      });
    } catch (error) {
      console.error("[EventsAPI] DELETE /api/events/:id/book failed:", error);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });
}
