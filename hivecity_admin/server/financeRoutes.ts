import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { requireAdminSession, syncRecordToGoogleSheet } from "./adminAuth";
import { isAdminHidden } from "./adminHiddenStore";
import { firestore, isFirestoreQuotaBackoffActive, noteFirestoreError } from "./firebaseAdmin";
import type {
  CentralPaymentRecord,
  CommunitySessionRecord,
  CommunitySessionRegistrationRecord,
} from "./communitySessionsRoutes";

export interface FinanceLedgerItem {
  paymentId: string;
  source: "community_session" | "event_booking" | "sponsor";
  referenceId: string;
  name: string;
  userId: string;
  userEmail: string;
  grossAmount: number;
  refundAmount: number;
  netAmount: number;
  currency: string;
  paymentStatus: "verified" | "refunded";
  verifiedAt: string;
}

export interface FinanceDailyPoint {
  date: string;
  label: string;
  amount: number;
}

export interface FinanceSignal {
  id: string;
  severity: "info" | "warning" | "positive";
  title: string;
  detail: string;
}

export interface FinanceDashboardResponse {
  range: "today" | "30d";
  grossRevenue: number;
  grossDeltaPct: number;
  avgOrderValue: number;
  aovDeltaPct: number;
  refunds: number;
  refundsDeltaPct: number;
  netRevenue: number;
  verifiedCount: number;
  breakdown: {
    communitySessions: number;
    eventBookings: number;
    sponsors: number;
  };
  dailySeries: FinanceDailyPoint[];
  signals: FinanceSignal[];
  records: FinanceLedgerItem[];
}

const LOCAL_PAYMENTS_FILE = path.resolve(import.meta.dirname, "payments_store.json");
const LOCAL_SESSIONS_FILE = path.resolve(import.meta.dirname, "community_sessions_store.json");
const LOCAL_REGISTRATIONS_FILE = path.resolve(import.meta.dirname, "community_session_registrations_store.json");
const LOCAL_BOOKINGS_FILE = path.resolve(import.meta.dirname, "event_bookings_store.json");
const LOCAL_SPONSORS_FILE = path.resolve(import.meta.dirname, "sponsors_store.json");

function readJsonArray<T>(filePath: string): T[] {
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch { }
  return [];
}

function parseAmount(raw: unknown): number {
  const n = Number(String(raw ?? "0").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pctDelta(current: number, prior: number): number {
  if (prior <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 100);
}

export async function mirrorFinanceRecordToSheet(item: FinanceLedgerItem): Promise<{ ok: boolean; error?: string }> {
  if ((item.paymentStatus !== "verified" && item.paymentStatus !== "refunded") || item.grossAmount <= 0) {
    return { ok: true };
  }
  const res = await syncRecordToGoogleSheet(
    "upsert_finance_record",
    {
      record: {
        paymentId: item.paymentId,
        source: item.source,
        referenceId: item.referenceId,
        name: item.name,
        userId: item.userId,
        userEmail: item.userEmail,
        grossAmount: item.grossAmount,
        refundAmount: item.refundAmount,
        netAmount: item.netAmount,
        currency: item.currency || "INR",
        paymentStatus: item.paymentStatus,
        verifiedAt: item.verifiedAt,
      },
    },
    { retries: 1 }
  );
  return { ok: res.ok, error: res.error };
}

export function aggregateFinanceData(params: {
  payments: CentralPaymentRecord[];
  bookings: Array<Record<string, any>>;
  sponsors: Array<Record<string, any>>;
  sessions: CommunitySessionRecord[];
  registrations: CommunitySessionRegistrationRecord[];
  range: "today" | "30d";
  now?: Date;
}): FinanceDashboardResponse {
  const now = params.now || new Date();
  const dedup = new Map<string, FinanceLedgerItem>();

  // 1. Verified & Refunded Community Session Payments (deduplicated strictly by paymentId/registrationId)
  const seenRegIds = new Set<string>();
  for (const p of params.payments) {
    if (p.source !== "community_session") continue;
    if (p.paymentStatus !== "verified" && p.paymentStatus !== "refunded") continue;
    const amt = parseAmount(p.amount);
    if (amt <= 0) continue;
    const key = String(p.gatewayPaymentId || p.paymentId || "").trim();
    if (!key || dedup.has(key)) continue;
    if (p.registrationId && seenRegIds.has(p.registrationId)) continue;
    if (p.registrationId) seenRegIds.add(p.registrationId);

    const isRefunded = p.paymentStatus === "refunded";
    dedup.set(key, {
      paymentId: key,
      source: "community_session",
      referenceId: p.sessionId || p.registrationId || key,
      name: p.sessionTitle || p.sessionId || "Community Session",
      userId: p.userId || "",
      userEmail: p.userEmail || "",
      grossAmount: amt,
      refundAmount: isRefunded ? amt : 0,
      netAmount: isRefunded ? 0 : amt,
      currency: p.currency || "INR",
      paymentStatus: isRefunded ? "refunded" : "verified",
      verifiedAt: p.verifiedAt || p.createdAt || now.toISOString(),
    });
  }

  // 2. Confirmed Paid Event Tickets (excluding cancelled or free ₹0)
  for (const b of params.bookings) {
    const status = String(b.status || b.bookingStatus || "Booked").trim().toLowerCase();
    if (status === "cancelled") continue;
    const fee = parseAmount(b.feeAmount ?? b.Fee_Amount);
    if (fee <= 0) continue;
    const bid = String(b.id || b.Booking_ID || `${b.eventId || "evt"}_${b.userId || "u"}`).trim();
    if (!bid || dedup.has(bid)) continue;
    dedup.set(bid, {
      paymentId: bid,
      source: "event_booking",
      referenceId: String(b.eventId || bid),
      name: String(b.eventTitle || b.Event_Name || "Hivecity Event"),
      userId: String(b.userId || ""),
      userEmail: String(b.userEmail || ""),
      grossAmount: fee,
      refundAmount: 0,
      netAmount: fee,
      currency: "INR",
      paymentStatus: "verified",
      verifiedAt: String(b.bookedAt || b.Booked_At || now.toISOString()),
    });
  }

  // 3. Active Sponsorships (excluding admin-hidden, deduplicated by sponsor id)
  for (const s of params.sponsors) {
    const sid = String(s.id || s.Sponsor_ID || "").trim();
    if (!sid || isAdminHidden("sponsors", sid) || dedup.has(sid)) continue;
    const amt = parseAmount(s.sponsorshipAmount ?? s.Sponsorship_Amount);
    if (amt <= 0) continue;
    dedup.set(sid, {
      paymentId: sid,
      source: "sponsor",
      referenceId: sid,
      name: `Sponsor: ${String(s.sponsorName || s.Sponsor_Name || "Partner")}`,
      userId: "sponsor",
      userEmail: String(s.companyLink || ""),
      grossAmount: amt,
      refundAmount: 0,
      netAmount: amt,
      currency: "INR",
      paymentStatus: "verified",
      verifiedAt: String(s.createdAt || s.Created_At || now.toISOString()),
    });
  }

  const allRecords = Array.from(dedup.values()).sort((a, b) =>
    (b.verifiedAt || "").localeCompare(a.verifiedAt || "")
  );

  const windowMs = params.range === "today" ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  const currentStart = now.getTime() - windowMs;
  const priorStart = currentStart - windowMs;

  let curGross = 0;
  let curRefunds = 0;
  let curVerifiedCount = 0;
  let priorGross = 0;
  let priorRefunds = 0;
  let priorVerifiedCount = 0;

  const breakdown = { communitySessions: 0, eventBookings: 0, sponsors: 0 };
  const dailyMap = new Map<string, number>();

  for (const r of allRecords) {
    const ts = new Date(r.verifiedAt).getTime();
    const inCurrent = !isNaN(ts) ? ts >= currentStart : true;
    const inPrior = !isNaN(ts) && ts >= priorStart && ts < currentStart;

    if (inCurrent) {
      if (r.paymentStatus === "verified") {
        curGross += r.grossAmount;
        curVerifiedCount++;
        if (r.source === "community_session") breakdown.communitySessions += r.grossAmount;
        else if (r.source === "event_booking") breakdown.eventBookings += r.grossAmount;
        else if (r.source === "sponsor") breakdown.sponsors += r.grossAmount;

        const dayKey = !isNaN(ts)
          ? new Date(ts).toISOString().slice(0, 10)
          : now.toISOString().slice(0, 10);
        dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + r.grossAmount);
      } else if (r.paymentStatus === "refunded") {
        curRefunds += r.refundAmount;
      }
    } else if (inPrior) {
      if (r.paymentStatus === "verified") {
        priorGross += r.grossAmount;
        priorVerifiedCount++;
      } else if (r.paymentStatus === "refunded") {
        priorRefunds += r.refundAmount;
      }
    }
  }

  const curAov = curVerifiedCount > 0 ? Math.round(curGross / curVerifiedCount) : 0;
  const priorAov = priorVerifiedCount > 0 ? Math.round(priorGross / priorVerifiedCount) : 0;

  const dailySeries: FinanceDailyPoint[] = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, amount]) => ({
      date,
      label: date.slice(5), // MM-DD
      amount,
    }));

  // Data-driven operational signals for "What deserves attention"
  const signals: FinanceSignal[] = [];
  const pendingPaidRegs = params.registrations.filter(
    (r) => r.sessionType === "paid" && r.registrationStatus === "pending"
  );
  if (pendingPaidRegs.length > 0) {
    signals.push({
      id: "pending-paid-regs",
      severity: "warning",
      title: `${pendingPaidRegs.length} pending paid registration${pendingPaidRegs.length > 1 ? "s" : ""}`,
      detail: "Awaiting gateway signature verification before seats or revenue are finalized.",
    });
  }

  for (const s of params.sessions.filter((x) => x.status === "published")) {
    const fillRatio = s.maxCapacity > 0 ? s.confirmedCount / s.maxCapacity : 0;
    if (fillRatio >= 0.8) {
      signals.push({
        id: `near-cap-${s.sessionId}`,
        severity: "info",
        title: `"${s.title}" is ${Math.round(fillRatio * 100)}% full`,
        detail: `${Math.max(0, s.maxCapacity - s.confirmedCount)} of ${s.maxCapacity} seats remaining.`,
      });
    }
  }

  if (curGross > 0) {
    const topSource =
      breakdown.communitySessions >= breakdown.eventBookings && breakdown.communitySessions >= breakdown.sponsors
        ? { label: "Community Sessions", val: breakdown.communitySessions }
        : breakdown.eventBookings >= breakdown.sponsors
          ? { label: "Event Ticketing", val: breakdown.eventBookings }
          : { label: "Sponsorships", val: breakdown.sponsors };
    signals.push({
      id: "top-revenue-source",
      severity: "positive",
      title: `Top revenue driver: ${topSource.label}`,
      detail: `₹${Math.round(topSource.val).toLocaleString("en-IN")} verified across ${curVerifiedCount} paid transaction${curVerifiedCount === 1 ? "" : "s"}.`,
    });
  }

  return {
    range: params.range,
    grossRevenue: curGross,
    grossDeltaPct: pctDelta(curGross, priorGross),
    avgOrderValue: curAov,
    aovDeltaPct: pctDelta(curAov, priorAov),
    refunds: curRefunds,
    refundsDeltaPct: pctDelta(curRefunds, priorRefunds),
    netRevenue: Math.max(0, curGross - curRefunds),
    verifiedCount: curVerifiedCount,
    breakdown,
    dailySeries,
    signals: signals.slice(0, 4),
    records: allRecords,
  };
}

export function registerFinanceRoutes(app: Express) {
  app.get("/api/admin/finance", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;

    try {
      const rangeParam = String(req.query.range || "30d").toLowerCase();
      const range: "today" | "30d" = rangeParam === "today" ? "today" : "30d";

      const paymentsMap = new Map<string, CentralPaymentRecord>();
      const bookingsMap = new Map<string, Record<string, any>>();
      const sponsorsMap = new Map<string, Record<string, any>>();
      const sessionsMap = new Map<string, CommunitySessionRecord>();
      const regsMap = new Map<string, CommunitySessionRegistrationRecord>();

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const [paySnap, bkSnap, spSnap, sessSnap, regSnap] = await Promise.all([
            firestore.collection("payments").get(),
            firestore.collection("event_bookings").get(),
            firestore.collection("sponsors").get(),
            firestore.collection("community_sessions").get(),
            firestore.collection("community_session_registrations").get(),
          ]);
          paySnap.forEach((d) => paymentsMap.set(d.id, { paymentId: d.id, ...(d.data() as any) }));
          bkSnap.forEach((d) => bookingsMap.set(d.id, { id: d.id, ...(d.data() as any) }));
          spSnap.forEach((d) => sponsorsMap.set(d.id, { id: d.id, ...(d.data() as any) }));
          sessSnap.forEach((d) => sessionsMap.set(d.id, { sessionId: d.id, ...(d.data() as any) }));
          regSnap.forEach((d) => regsMap.set(d.id, { registrationId: d.id, ...(d.data() as any) }));
        } catch (err) {
          noteFirestoreError(err);
        }
      }

      for (const p of readJsonArray<CentralPaymentRecord>(LOCAL_PAYMENTS_FILE)) {
        if (p?.paymentId && !paymentsMap.has(p.paymentId)) paymentsMap.set(p.paymentId, p);
      }
      for (const b of readJsonArray<Record<string, any>>(LOCAL_BOOKINGS_FILE)) {
        const id = String(b?.id || "");
        if (id && !bookingsMap.has(id)) bookingsMap.set(id, b);
      }
      for (const s of readJsonArray<Record<string, any>>(LOCAL_SPONSORS_FILE)) {
        const id = String(s?.id || "");
        if (id && !sponsorsMap.has(id)) sponsorsMap.set(id, s);
      }
      for (const s of readJsonArray<CommunitySessionRecord>(LOCAL_SESSIONS_FILE)) {
        if (s?.sessionId && !sessionsMap.has(s.sessionId)) sessionsMap.set(s.sessionId, s);
      }
      for (const r of readJsonArray<CommunitySessionRegistrationRecord>(LOCAL_REGISTRATIONS_FILE)) {
        if (r?.registrationId && !regsMap.has(r.registrationId)) regsMap.set(r.registrationId, r);
      }

      const dashboard = aggregateFinanceData({
        payments: Array.from(paymentsMap.values()),
        bookings: Array.from(bookingsMap.values()),
        sponsors: Array.from(sponsorsMap.values()),
        sessions: Array.from(sessionsMap.values()),
        registrations: Array.from(regsMap.values()),
        range,
      });

      // Background mirror of verified/refunded records into "Revenue & Finance" Google Sheet tab
      if (dashboard.records.length > 0) {
        void Promise.all(dashboard.records.slice(0, 25).map((item) => mirrorFinanceRecordToSheet(item)));
      }

      res.json({ success: true, ...dashboard });
    } catch (err) {
      console.error("[FinanceAPI] GET /api/admin/finance failed:", err);
      res.status(500).json({ error: "Failed to compute revenue & finance dashboard." });
    }
  });
}
