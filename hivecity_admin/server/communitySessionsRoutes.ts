import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import {
  requireAdminSession,
  syncRecordToGoogleSheet,
  verifyFirebaseIdToken,
} from "./adminAuth";
import {
  firestore,
  isFirestoreQuotaBackoffActive,
  noteFirestoreError,
} from "./firebaseAdmin";

export type SessionType = "free" | "paid";
export type SessionStatus = "draft" | "published" | "cancelled" | "completed";
export type RegistrationStatus = "pending" | "confirmed" | "cancelled";
export type PaymentStatus = "free" | "pending" | "verified" | "failed" | "refunded";

export interface CommunitySessionRecord {
  sessionId: string;
  title: string;
  description: string;
  category: string;
  coverImage: string;
  organizer: string;
  date: string;
  startTime: string;
  endTime: string;
  locationOrMeetingDetails: string;
  maxCapacity: number;
  confirmedCount: number;
  pendingCount: number;
  sessionType: SessionType;
  ticketPrice: number;
  currency: string;
  registrationDeadline: string;
  status: SessionStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunitySessionRegistrationRecord {
  registrationId: string;
  sessionId: string;
  sessionTitle: string;
  sessionType: SessionType;
  userId: string;
  userName: string;
  userEmail: string;
  paymentId: string | null;
  gatewayOrderId?: string | null;
  registrationStatus: RegistrationStatus;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  createdAt: string;
  updatedAt: string;
}

export interface CentralPaymentRecord {
  paymentId: string;
  gatewayOrderId: string;
  gatewayPaymentId: string;
  source: "community_session";
  sessionId: string;
  sessionTitle?: string;
  registrationId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  amount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommunitySessionMetrics {
  totalRegistrations: number;
  confirmedParticipants: number;
  pendingRegistrations: number;
  cancelledRegistrations: number;
  availableSeats: number;
  paidParticipants: number;
  freeParticipants: number;
  verifiedRevenue: number;
}

export interface RevenueSummary {
  grossVerifiedRevenue: number;
  refundedAmount: number;
  netVerifiedRevenue: number;
  verifiedTransactionsCount: number;
  averageOrderValue: number;
  pendingCount: number;
  failedCount: number;
  transactions: CentralPaymentRecord[];
}

export interface SessionStoreBackend {
  readSessions: () => Promise<CommunitySessionRecord[]>;
  writeSessions: (list: CommunitySessionRecord[]) => Promise<void>;
  readRegistrations: () => Promise<CommunitySessionRegistrationRecord[]>;
  writeRegistrations: (list: CommunitySessionRegistrationRecord[]) => Promise<void>;
  readPayments: () => Promise<CentralPaymentRecord[]>;
  writePayments: (list: CentralPaymentRecord[]) => Promise<void>;
  syncRegistrationToSheet: (reg: CommunitySessionRegistrationRecord) => Promise<{ ok: boolean; error?: string }>;
  createGatewayOrder?: (params: {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }) => Promise<{ id: string; amount: number; currency: string }>;
  getGatewayCredentials?: () => { keyId: string; keySecret: string; webhookSecret: string };
}

const LOCAL_SESSIONS_FILE = path.resolve(import.meta.dirname, "community_sessions_store.json");
const LOCAL_REGISTRATIONS_FILE = path.resolve(import.meta.dirname, "community_session_registrations_store.json");
const LOCAL_PAYMENTS_FILE = path.resolve(import.meta.dirname, "payments_store.json");

function readJsonArray<T>(filePath: string): T[] {
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch { }
  return [];
}

function writeJsonArray<T>(filePath: string, list: T[]): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.warn("[CommunitySessions] Local write warning:", err);
  }
}

function sanitizeCoverImage(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(s)) {
    // Prevent massive raw base64 bloat in Firestore/local store
    return s.length <= 400_000 ? s : "";
  }
  if (/^(assets\/|\/assets\/|https?:\/\/)/i.test(s)) return s;
  return "";
}

function parsePositiveNumber(raw: unknown): number {
  const n = Number(String(raw ?? "0").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Per-session in-process async mutex so concurrent requests cannot race on capacity
const sessionLocks = new Map<string, Promise<void>>();
async function withSessionLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  sessionLocks.set(key, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export function computeHmacSha256(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyHmacSignature(secret: string, payload: string, providedSignature: string): boolean {
  if (!secret || !providedSignature) return false;
  const expected = computeHmacSha256(secret, payload);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(providedSignature).trim(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getDefaultGatewayCredentials() {
  return {
    keyId: String(process.env.RAZORPAY_KEY_ID || "").trim(),
    keySecret: String(process.env.RAZORPAY_KEY_SECRET || "").trim(),
    webhookSecret: String(
      process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || ""
    ).trim(),
  };
}

async function createRazorpayOrderLive(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string }> {
  const { keyId, keySecret } = getDefaultGatewayCredentials();
  if (!keyId || !keySecret) {
    throw new Error("PAYMENT_GATEWAY_NOT_CONFIGURED");
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    throw new Error(data?.error?.description || `Payment gateway order error (${res.status})`);
  }
  return { id: String(data.id), amount: Number(data.amount || params.amountPaise), currency: String(data.currency || params.currency) };
}

function createDefaultBackend(): SessionStoreBackend {
  return {
    readSessions: async () => {
      const map = new Map<string, CommunitySessionRecord>();
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const snap = await firestore.collection("community_sessions").get();
          snap.forEach((d) => {
            const raw = d.data() || {};
            map.set(d.id, normalizeSessionRecord(d.id, raw));
          });
        } catch (err) {
          noteFirestoreError(err);
        }
      }
      for (const local of readJsonArray<CommunitySessionRecord>(LOCAL_SESSIONS_FILE)) {
        if (local?.sessionId && !map.has(local.sessionId)) {
          map.set(local.sessionId, normalizeSessionRecord(local.sessionId, local));
        }
      }
      return Array.from(map.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    },
    writeSessions: async (list) => {
      writeJsonArray(LOCAL_SESSIONS_FILE, list);
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await Promise.all(
            list.slice(0, 20).map((s) =>
              firestore
                .collection("community_sessions")
                .doc(s.sessionId)
                .set({ ...s, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
            )
          );
        } catch (err) {
          noteFirestoreError(err);
        }
      }
    },
    readRegistrations: async () => {
      const map = new Map<string, CommunitySessionRegistrationRecord>();
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const snap = await firestore.collection("community_session_registrations").get();
          snap.forEach((d) => {
            const raw = d.data() || {};
            map.set(d.id, normalizeRegistrationRecord(d.id, raw));
          });
        } catch (err) {
          noteFirestoreError(err);
        }
      }
      for (const local of readJsonArray<CommunitySessionRegistrationRecord>(LOCAL_REGISTRATIONS_FILE)) {
        if (local?.registrationId && !map.has(local.registrationId)) {
          map.set(local.registrationId, normalizeRegistrationRecord(local.registrationId, local));
        }
      }
      return Array.from(map.values()).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    },
    writeRegistrations: async (list) => {
      writeJsonArray(LOCAL_REGISTRATIONS_FILE, list);
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await Promise.all(
            list.slice(0, 20).map((r) =>
              firestore
                .collection("community_session_registrations")
                .doc(r.registrationId)
                .set({ ...r, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
            )
          );
        } catch (err) {
          noteFirestoreError(err);
        }
      }
    },
    readPayments: async () => {
      const map = new Map<string, CentralPaymentRecord>();
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          const snap = await firestore.collection("payments").get();
          snap.forEach((d) => {
            const raw = d.data() || {};
            map.set(d.id, normalizePaymentRecord(d.id, raw));
          });
        } catch (err) {
          noteFirestoreError(err);
        }
      }
      for (const local of readJsonArray<CentralPaymentRecord>(LOCAL_PAYMENTS_FILE)) {
        if (local?.paymentId && !map.has(local.paymentId)) {
          map.set(local.paymentId, normalizePaymentRecord(local.paymentId, local));
        }
      }
      return Array.from(map.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    },
    writePayments: async (list) => {
      writeJsonArray(LOCAL_PAYMENTS_FILE, list);
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await Promise.all(
            list.slice(0, 20).map((p) =>
              firestore
                .collection("payments")
                .doc(p.paymentId)
                .set({ ...p, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
            )
          );
        } catch (err) {
          noteFirestoreError(err);
        }
      }
    },
    syncRegistrationToSheet: async (reg) => {
      const res = await syncRecordToGoogleSheet(
        "upsert_session_registration",
        {
          registration: {
            registrationId: reg.registrationId,
            sessionId: reg.sessionId,
            sessionTitle: reg.sessionTitle,
            userId: reg.userId,
            userName: reg.userName,
            userEmail: reg.userEmail,
            sessionType: reg.sessionType,
            registrationStatus: reg.registrationStatus,
            paymentStatus: reg.paymentStatus,
            amountPaid: reg.amountPaid,
            paymentId: reg.paymentId || "",
            updatedAt: reg.updatedAt,
          },
        },
        { retries: 1 }
      );
      return { ok: res.ok, error: res.error };
    },
    createGatewayOrder: createRazorpayOrderLive,
    getGatewayCredentials: getDefaultGatewayCredentials,
  };
}

function toIsoString(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === "string") return val;
  if (val instanceof Date) return val.toISOString();
  const ts = val as { toDate?: () => Date; seconds?: number };
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return new Date().toISOString();
}

export function normalizeSessionRecord(id: string, raw: Record<string, any>): CommunitySessionRecord {
  const sessionType: SessionType = String(raw.sessionType || "free").toLowerCase() === "paid" ? "paid" : "free";
  const statusRaw = String(raw.status || "draft").toLowerCase();
  const status: SessionStatus =
    statusRaw === "published" || statusRaw === "cancelled" || statusRaw === "completed"
      ? statusRaw
      : "draft";
  const maxCapacity = Math.max(1, Math.floor(Number(raw.maxCapacity) || 20));
  const ticketPrice = sessionType === "paid" ? parsePositiveNumber(raw.ticketPrice) : 0;
  return {
    sessionId: id,
    title: String(raw.title || "Community Session").trim(),
    description: String(raw.description || "").trim(),
    category: String(raw.category || "Running").trim(),
    coverImage: sanitizeCoverImage(raw.coverImage || ""),
    organizer: String(raw.organizer || "Hive City Team").trim(),
    date: String(raw.date || "").trim(),
    startTime: String(raw.startTime || "").trim(),
    endTime: String(raw.endTime || "").trim(),
    locationOrMeetingDetails: String(raw.locationOrMeetingDetails || "").trim(),
    maxCapacity,
    confirmedCount: Math.max(0, Math.floor(Number(raw.confirmedCount) || 0)),
    pendingCount: Math.max(0, Math.floor(Number(raw.pendingCount) || 0)),
    sessionType,
    ticketPrice,
    currency: String(raw.currency || "INR").toUpperCase(),
    registrationDeadline: String(raw.registrationDeadline || "").trim(),
    status,
    createdBy: String(raw.createdBy || "admin").trim(),
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

export function normalizeRegistrationRecord(id: string, raw: Record<string, any>): CommunitySessionRegistrationRecord {
  const sessionType: SessionType = String(raw.sessionType || "free").toLowerCase() === "paid" ? "paid" : "free";
  const regRaw = String(raw.registrationStatus || "pending").toLowerCase();
  const registrationStatus: RegistrationStatus =
    regRaw === "confirmed" || regRaw === "cancelled" ? regRaw : "pending";
  const payRaw = String(raw.paymentStatus || (sessionType === "free" ? "free" : "pending")).toLowerCase();
  const paymentStatus: PaymentStatus =
    payRaw === "free" || payRaw === "verified" || payRaw === "failed" || payRaw === "refunded"
      ? payRaw
      : "pending";
  return {
    registrationId: id,
    sessionId: String(raw.sessionId || "").trim(),
    sessionTitle: String(raw.sessionTitle || "Community Session").trim(),
    sessionType,
    userId: String(raw.userId || "").trim(),
    userName: String(raw.userName || "Hive Athlete").trim(),
    userEmail: String(raw.userEmail || "").trim(),
    paymentId: raw.paymentId ? String(raw.paymentId) : null,
    gatewayOrderId: raw.gatewayOrderId ? String(raw.gatewayOrderId) : null,
    registrationStatus,
    paymentStatus,
    amountPaid: parsePositiveNumber(raw.amountPaid),
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

export function normalizePaymentRecord(id: string, raw: Record<string, any>): CentralPaymentRecord {
  const payRaw = String(raw.paymentStatus || "pending").toLowerCase();
  const paymentStatus: PaymentStatus =
    payRaw === "verified" || payRaw === "failed" || payRaw === "refunded" || payRaw === "free"
      ? payRaw
      : "pending";
  return {
    paymentId: id,
    gatewayOrderId: String(raw.gatewayOrderId || "").trim(),
    gatewayPaymentId: String(raw.gatewayPaymentId || id).trim(),
    source: "community_session",
    sessionId: String(raw.sessionId || "").trim(),
    sessionTitle: raw.sessionTitle ? String(raw.sessionTitle) : undefined,
    registrationId: String(raw.registrationId || "").trim(),
    userId: String(raw.userId || "").trim(),
    userName: raw.userName ? String(raw.userName) : undefined,
    userEmail: raw.userEmail ? String(raw.userEmail) : undefined,
    amount: parsePositiveNumber(raw.amount),
    currency: String(raw.currency || "INR").toUpperCase(),
    paymentStatus,
    verifiedAt: raw.verifiedAt ? toIsoString(raw.verifiedAt) : null,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

export function computeSessionMetrics(
  session: CommunitySessionRecord,
  registrations: CommunitySessionRegistrationRecord[],
  payments: CentralPaymentRecord[]
): CommunitySessionMetrics {
  const regs = registrations.filter((r) => r.sessionId === session.sessionId);
  const confirmed = regs.filter((r) => r.registrationStatus === "confirmed");
  const pending = regs.filter((r) => r.registrationStatus === "pending");
  const cancelled = regs.filter((r) => r.registrationStatus === "cancelled");
  const paidParticipants = confirmed.filter((r) => r.sessionType === "paid" && r.paymentStatus === "verified").length;
  const freeParticipants = confirmed.filter((r) => r.sessionType === "free" || r.paymentStatus === "free").length;

  // Strictly count ONLY verified payments from central payments ledger (each gatewayPaymentId once)
  const seenPayments = new Set<string>();
  let verifiedRevenue = 0;
  for (const p of payments) {
    if (p.source !== "community_session" || p.sessionId !== session.sessionId) continue;
    const dedupKey = p.gatewayPaymentId || p.paymentId;
    if (seenPayments.has(dedupKey)) continue;
    seenPayments.add(dedupKey);
    if (p.paymentStatus === "verified") {
      verifiedRevenue += p.amount;
    }
  }

  return {
    totalRegistrations: regs.length,
    confirmedParticipants: confirmed.length,
    pendingRegistrations: pending.length,
    cancelledRegistrations: cancelled.length,
    availableSeats: Math.max(0, session.maxCapacity - confirmed.length),
    paidParticipants,
    freeParticipants,
    verifiedRevenue,
  };
}

export function computeRevenueSummary(payments: CentralPaymentRecord[]): RevenueSummary {
  const seen = new Set<string>();
  let grossVerifiedRevenue = 0;
  let refundedAmount = 0;
  let verifiedTransactionsCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  const uniqueTransactions: CentralPaymentRecord[] = [];

  for (const p of payments) {
    if (p.source !== "community_session") continue;
    const key = p.gatewayPaymentId || p.paymentId;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueTransactions.push(p);

    if (p.paymentStatus === "verified") {
      grossVerifiedRevenue += p.amount;
      verifiedTransactionsCount++;
    } else if (p.paymentStatus === "refunded") {
      refundedAmount += p.amount;
    } else if (p.paymentStatus === "pending") {
      pendingCount++;
    } else if (p.paymentStatus === "failed") {
      failedCount++;
    }
  }

  const netVerifiedRevenue = Math.max(0, grossVerifiedRevenue - refundedAmount);
  const averageOrderValue =
    verifiedTransactionsCount > 0 ? Math.round(grossVerifiedRevenue / verifiedTransactionsCount) : 0;

  return {
    grossVerifiedRevenue,
    refundedAmount,
    netVerifiedRevenue,
    verifiedTransactionsCount,
    averageOrderValue,
    pendingCount,
    failedCount,
    transactions: uniqueTransactions,
  };
}

export function validateSessionPayload(body: Record<string, any>): { ok: true } | { ok: false; error: string } {
  const title = String(body.title || "").trim();
  const date = String(body.date || "").trim();
  const maxCapacity = Number(body.maxCapacity);
  const sessionType = String(body.sessionType || "free").toLowerCase();
  const ticketPrice = parsePositiveNumber(body.ticketPrice);

  if (!title) return { ok: false, error: "Session title is required." };
  if (!date) return { ok: false, error: "Session date is required." };
  if (!Number.isFinite(maxCapacity) || maxCapacity < 1) {
    return { ok: false, error: "Max capacity must be at least 1." };
  }
  if (sessionType !== "free" && sessionType !== "paid") {
    return { ok: false, error: "Session type must be 'free' or 'paid'." };
  }
  if (sessionType === "paid" && ticketPrice <= 0) {
    return { ok: false, error: "Paid sessions require a ticket price greater than ₹0." };
  }
  return { ok: true };
}

function isDeadlinePassed(deadline: string): boolean {
  if (!deadline) return false;
  const parsed = new Date(deadline);
  if (isNaN(parsed.getTime())) return false;
  return Date.now() > parsed.getTime();
}

export function createCommunitySessionsService(backend: SessionStoreBackend = createDefaultBackend()) {
  return {
    async listAdminSessions() {
      const [sessions, regs, payments] = await Promise.all([
        backend.readSessions(),
        backend.readRegistrations(),
        backend.readPayments(),
      ]);
      return sessions.map((s) => ({
        ...s,
        metrics: computeSessionMetrics(s, regs, payments),
      }));
    },

    async listPublishedSessions() {
      const [sessions, regs] = await Promise.all([
        backend.readSessions(),
        backend.readRegistrations(),
      ]);
      return sessions
        .filter((s) => s.status === "published")
        .map((s) => {
          const confirmedCount = regs.filter(
            (r) => r.sessionId === s.sessionId && r.registrationStatus === "confirmed"
          ).length;
          return {
            ...s,
            confirmedCount,
            availableSeats: Math.max(0, s.maxCapacity - confirmedCount),
          };
        });
    },

    async createSession(body: Record<string, any>, adminEmail: string) {
      const valid = validateSessionPayload(body);
      if (!valid.ok) return { status: 400, error: valid.error };

      const now = new Date().toISOString();
      const sessionId =
        typeof body.sessionId === "string" && body.sessionId.trim()
          ? body.sessionId.trim()
          : `CS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const record = normalizeSessionRecord(sessionId, {
        ...body,
        createdBy: adminEmail,
        confirmedCount: 0,
        pendingCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      const list = await backend.readSessions();
      const next = [record, ...list.filter((s) => s.sessionId !== sessionId)];
      await backend.writeSessions(next);
      return { status: 201, session: record };
    },

    async updateSession(sessionId: string, patch: Record<string, any>) {
      const list = await backend.readSessions();
      const existing = list.find((s) => s.sessionId === sessionId);
      if (!existing) return { status: 404, error: "Community session not found." };

      const mergedRaw = { ...existing, ...patch, sessionId, updatedAt: new Date().toISOString() };
      const valid = validateSessionPayload(mergedRaw);
      if (!valid.ok) return { status: 400, error: valid.error };

      const updated = normalizeSessionRecord(sessionId, mergedRaw);
      const next = list.map((s) => (s.sessionId === sessionId ? updated : s));
      await backend.writeSessions(next);
      return { status: 200, session: updated };
    },

    async listParticipants(sessionId: string) {
      const regs = await backend.readRegistrations();
      return regs.filter((r) => r.sessionId === sessionId);
    },

    async listUserRegistrations(userId: string) {
      const [regs, sessions] = await Promise.all([
        backend.readRegistrations(),
        backend.readSessions(),
      ]);
      const sessionMap = new Map(sessions.map((s) => [s.sessionId, s]));
      return regs
        .filter((r) => r.userId === userId)
        .map((r) => {
          const s = sessionMap.get(r.sessionId);
          return {
            ...r,
            date: s?.date || "",
            startTime: s?.startTime || "",
            endTime: s?.endTime || "",
            locationOrMeetingDetails: s?.locationOrMeetingDetails || "",
            sessionStatus: s?.status || "published",
          };
        });
    },

    async registerFree(
      sessionId: string,
      user: { uid: string; email: string; displayName: string }
    ) {
      return withSessionLock(sessionId, async () => {
        const [sessions, regs] = await Promise.all([
          backend.readSessions(),
          backend.readRegistrations(),
        ]);
        const session = sessions.find((s) => s.sessionId === sessionId);
        if (!session) return { status: 404, error: "Community session not found." };
        if (session.status !== "published") {
          return { status: 409, error: `Session is ${session.status} and not accepting registrations.` };
        }
        if (session.sessionType !== "free") {
          return { status: 400, error: "This is a paid session. Complete payment checkout to register." };
        }
        if (isDeadlinePassed(session.registrationDeadline)) {
          return { status: 409, error: "Registration deadline has passed." };
        }

        const registrationId = `${sessionId}_${user.uid}`;
        const existingReg = regs.find((r) => r.registrationId === registrationId);
        if (existingReg && existingReg.registrationStatus !== "cancelled") {
          return { status: 409, error: "You are already registered for this session." };
        }

        const confirmedCount = regs.filter(
          (r) => r.sessionId === sessionId && r.registrationStatus === "confirmed"
        ).length;
        if (confirmedCount >= session.maxCapacity) {
          return { status: 409, error: "Session is full. No seats available." };
        }

        const now = new Date().toISOString();
        const registration: CommunitySessionRegistrationRecord = {
          registrationId,
          sessionId,
          sessionTitle: session.title,
          sessionType: "free",
          userId: user.uid,
          userName: user.displayName || user.email.split("@")[0] || "Hive Athlete",
          userEmail: user.email,
          paymentId: null,
          gatewayOrderId: null,
          registrationStatus: "confirmed",
          paymentStatus: "free",
          amountPaid: 0,
          createdAt: existingReg?.createdAt || now,
          updatedAt: now,
        };

        const nextRegs = [registration, ...regs.filter((r) => r.registrationId !== registrationId)];
        const nextConfirmed = confirmedCount + 1;
        const nextSessions = sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, confirmedCount: nextConfirmed, updatedAt: now } : s
        );

        await Promise.all([
          backend.writeRegistrations(nextRegs),
          backend.writeSessions(nextSessions),
        ]);

        const sheetSync = await backend.syncRegistrationToSheet(registration);
        return {
          status: 201,
          registration,
          availableSeats: Math.max(0, session.maxCapacity - nextConfirmed),
          sheetSynced: sheetSync.ok,
        };
      });
    },

    async createPaidOrder(
      sessionId: string,
      user: { uid: string; email: string; displayName: string }
    ) {
      return withSessionLock(sessionId, async () => {
        const [sessions, regs, payments] = await Promise.all([
          backend.readSessions(),
          backend.readRegistrations(),
          backend.readPayments(),
        ]);
        const session = sessions.find((s) => s.sessionId === sessionId);
        if (!session) return { status: 404, error: "Community session not found." };
        if (session.status !== "published") {
          return { status: 409, error: `Session is ${session.status} and not accepting registrations.` };
        }
        if (session.sessionType !== "paid" || session.ticketPrice <= 0) {
          return { status: 400, error: "This session does not require payment." };
        }
        if (isDeadlinePassed(session.registrationDeadline)) {
          return { status: 409, error: "Registration deadline has passed." };
        }

        const registrationId = `${sessionId}_${user.uid}`;
        const existingReg = regs.find((r) => r.registrationId === registrationId);
        if (existingReg && existingReg.registrationStatus === "confirmed") {
          return { status: 409, error: "You are already registered for this session." };
        }

        const confirmedCount = regs.filter(
          (r) => r.sessionId === sessionId && r.registrationStatus === "confirmed"
        ).length;
        if (confirmedCount >= session.maxCapacity) {
          return { status: 409, error: "Session is full. No seats available." };
        }

        const creds = (backend.getGatewayCredentials || getDefaultGatewayCredentials)();
        if (!creds.keyId || !creds.keySecret) {
          return {
            status: 503,
            code: "PAYMENT_GATEWAY_NOT_CONFIGURED",
            error: "Payment gateway (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) is not configured on the server.",
          };
        }

        const orderCreator = backend.createGatewayOrder || createRazorpayOrderLive;
        const order = await orderCreator({
          amountPaise: Math.round(session.ticketPrice * 100),
          currency: session.currency || "INR",
          receipt: registrationId.slice(0, 40),
          notes: {
            sessionId,
            registrationId,
            userId: user.uid,
            source: "community_session",
          },
        });

        const now = new Date().toISOString();
        const registration: CommunitySessionRegistrationRecord = {
          registrationId,
          sessionId,
          sessionTitle: session.title,
          sessionType: "paid",
          userId: user.uid,
          userName: user.displayName || user.email.split("@")[0] || "Hive Athlete",
          userEmail: user.email,
          paymentId: null,
          gatewayOrderId: order.id,
          registrationStatus: "pending",
          paymentStatus: "pending",
          amountPaid: 0,
          createdAt: existingReg?.createdAt || now,
          updatedAt: now,
        };

        const pendingPayment: CentralPaymentRecord = {
          paymentId: order.id,
          gatewayOrderId: order.id,
          gatewayPaymentId: "",
          source: "community_session",
          sessionId,
          sessionTitle: session.title,
          registrationId,
          userId: user.uid,
          userName: registration.userName,
          userEmail: registration.userEmail,
          amount: session.ticketPrice,
          currency: session.currency || "INR",
          paymentStatus: "pending",
          verifiedAt: null,
          createdAt: now,
          updatedAt: now,
        };

        const nextRegs = [registration, ...regs.filter((r) => r.registrationId !== registrationId)];
        const pendingCount = nextRegs.filter(
          (r) => r.sessionId === sessionId && r.registrationStatus === "pending"
        ).length;
        const nextSessions = sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, pendingCount, updatedAt: now } : s
        );
        const nextPayments = [pendingPayment, ...payments.filter((p) => p.paymentId !== order.id)];

        await Promise.all([
          backend.writeRegistrations(nextRegs),
          backend.writeSessions(nextSessions),
          backend.writePayments(nextPayments),
        ]);

        const sheetSync = await backend.syncRegistrationToSheet(registration);
        return {
          status: 201,
          order: {
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: creds.keyId,
          },
          registration,
          sheetSynced: sheetSync.ok,
        };
      });
    },

    async verifyPayment(params: {
      sessionId: string;
      gatewayOrderId: string;
      gatewayPaymentId: string;
      gatewaySignature: string;
      paymentOutcome?: "verified" | "failed";
      userId: string;
    }) {
      return withSessionLock(params.sessionId, async () => {
        const creds = (backend.getGatewayCredentials || getDefaultGatewayCredentials)();
        const [sessions, regs, payments] = await Promise.all([
          backend.readSessions(),
          backend.readRegistrations(),
          backend.readPayments(),
        ]);
        const session = sessions.find((s) => s.sessionId === params.sessionId);
        if (!session) return { status: 404, error: "Community session not found." };

        const registrationId = `${params.sessionId}_${params.userId}`;
        const existingReg = regs.find((r) => r.registrationId === registrationId);
        if (!existingReg) return { status: 404, error: "Pending registration not found." };

        const now = new Date().toISOString();

        // Explicit failed payment handling: zero seat granted, zero revenue recorded
        if (params.paymentOutcome === "failed") {
          const failedReg: CommunitySessionRegistrationRecord = {
            ...existingReg,
            registrationStatus: "cancelled",
            paymentStatus: "failed",
            amountPaid: 0,
            paymentId: params.gatewayPaymentId || null,
            updatedAt: now,
          };
          const payDocId = params.gatewayPaymentId || params.gatewayOrderId || `fail_${registrationId}`;
          const failedPayment: CentralPaymentRecord = {
            paymentId: payDocId,
            gatewayOrderId: params.gatewayOrderId,
            gatewayPaymentId: params.gatewayPaymentId || "",
            source: "community_session",
            sessionId: params.sessionId,
            sessionTitle: session.title,
            registrationId,
            userId: params.userId,
            userName: existingReg.userName,
            userEmail: existingReg.userEmail,
            amount: 0,
            currency: session.currency || "INR",
            paymentStatus: "failed",
            verifiedAt: null,
            createdAt: now,
            updatedAt: now,
          };

          const nextRegs = [failedReg, ...regs.filter((r) => r.registrationId !== registrationId)];
          const pendingCount = nextRegs.filter(
            (r) => r.sessionId === params.sessionId && r.registrationStatus === "pending"
          ).length;
          const nextSessions = sessions.map((s) =>
            s.sessionId === params.sessionId ? { ...s, pendingCount, updatedAt: now } : s
          );
          const nextPayments = [
            failedPayment,
            ...payments.filter((p) => p.paymentId !== payDocId && p.gatewayOrderId !== params.gatewayOrderId),
          ];

          await Promise.all([
            backend.writeRegistrations(nextRegs),
            backend.writeSessions(nextSessions),
            backend.writePayments(nextPayments),
          ]);
          const sheetSync = await backend.syncRegistrationToSheet(failedReg);
          return { status: 200, verified: false, registration: failedReg, sheetSynced: sheetSync.ok };
        }

        // Verify cryptographic HMAC-SHA256 signature on trusted backend
        const sigPayload = `${params.gatewayOrderId}|${params.gatewayPaymentId}`;
        if (!verifyHmacSignature(creds.keySecret, sigPayload, params.gatewaySignature)) {
          return { status: 400, error: "Invalid payment signature. Verification rejected." };
        }

        // Idempotency: if this gatewayPaymentId was already verified, return cleanly without double-counting
        const alreadyVerifiedPayment = payments.find(
          (p) => p.gatewayPaymentId === params.gatewayPaymentId && p.paymentStatus === "verified"
        );
        if (alreadyVerifiedPayment && existingReg.registrationStatus === "confirmed") {
          return {
            status: 200,
            verified: true,
            idempotent: true,
            registration: existingReg,
            payment: alreadyVerifiedPayment,
            sheetSynced: true,
          };
        }

        // Re-check atomic seat capacity before confirming
        const confirmedCount = regs.filter(
          (r) => r.sessionId === params.sessionId && r.registrationStatus === "confirmed"
        ).length;
        if (confirmedCount >= session.maxCapacity) {
          return { status: 409, error: "Session reached max capacity before payment confirmation." };
        }

        const confirmedReg: CommunitySessionRegistrationRecord = {
          ...existingReg,
          paymentId: params.gatewayPaymentId,
          gatewayOrderId: params.gatewayOrderId,
          registrationStatus: "confirmed",
          paymentStatus: "verified",
          amountPaid: session.ticketPrice,
          updatedAt: now,
        };

        // Deterministic doc ID = gatewayPaymentId so each verified payment is counted ONLY ONCE
        const verifiedPayment: CentralPaymentRecord = {
          paymentId: params.gatewayPaymentId,
          gatewayOrderId: params.gatewayOrderId,
          gatewayPaymentId: params.gatewayPaymentId,
          source: "community_session",
          sessionId: params.sessionId,
          sessionTitle: session.title,
          registrationId,
          userId: params.userId,
          userName: existingReg.userName,
          userEmail: existingReg.userEmail,
          amount: session.ticketPrice,
          currency: session.currency || "INR",
          paymentStatus: "verified",
          verifiedAt: now,
          createdAt: now,
          updatedAt: now,
        };

        const nextRegs = [confirmedReg, ...regs.filter((r) => r.registrationId !== registrationId)];
        const nextConfirmed = confirmedCount + 1;
        const nextPending = nextRegs.filter(
          (r) => r.sessionId === params.sessionId && r.registrationStatus === "pending"
        ).length;
        const nextSessions = sessions.map((s) =>
          s.sessionId === params.sessionId
            ? { ...s, confirmedCount: nextConfirmed, pendingCount: nextPending, updatedAt: now }
            : s
        );
        const nextPayments = [
          verifiedPayment,
          ...payments.filter(
            (p) => p.paymentId !== params.gatewayPaymentId && p.gatewayOrderId !== params.gatewayOrderId
          ),
        ];

        await Promise.all([
          backend.writeRegistrations(nextRegs),
          backend.writeSessions(nextSessions),
          backend.writePayments(nextPayments),
        ]);

        const sheetSync = await backend.syncRegistrationToSheet(confirmedReg);
        // Automatically mirror verified payment into "Revenue & Finance" sheet tab
        void syncRecordToGoogleSheet(
          "upsert_finance_record",
          {
            record: {
              paymentId: verifiedPayment.gatewayPaymentId,
              source: "community_session",
              referenceId: verifiedPayment.sessionId,
              name: verifiedPayment.sessionTitle || session.title,
              userId: verifiedPayment.userId,
              userEmail: verifiedPayment.userEmail || "",
              grossAmount: verifiedPayment.amount,
              refundAmount: 0,
              netAmount: verifiedPayment.amount,
              currency: verifiedPayment.currency || "INR",
              paymentStatus: "verified",
              verifiedAt: verifiedPayment.verifiedAt || now,
            },
          },
          { retries: 1 }
        );
        return {
          status: 200,
          verified: true,
          registration: confirmedReg,
          payment: verifiedPayment,
          sheetSynced: sheetSync.ok,
        };
      });
    },

    async cancelRegistration(sessionId: string, userId: string) {
      return withSessionLock(sessionId, async () => {
        const [sessions, regs] = await Promise.all([
          backend.readSessions(),
          backend.readRegistrations(),
        ]);
        const session = sessions.find((s) => s.sessionId === sessionId);
        const registrationId = `${sessionId}_${userId}`;
        const existing = regs.find((r) => r.registrationId === registrationId);
        if (!existing) return { status: 404, error: "Registration not found." };

        const now = new Date().toISOString();
        const cancelled: CommunitySessionRegistrationRecord = {
          ...existing,
          registrationStatus: "cancelled",
          updatedAt: now,
        };
        const nextRegs = [cancelled, ...regs.filter((r) => r.registrationId !== registrationId)];
        const confirmedCount = nextRegs.filter(
          (r) => r.sessionId === sessionId && r.registrationStatus === "confirmed"
        ).length;
        const pendingCount = nextRegs.filter(
          (r) => r.sessionId === sessionId && r.registrationStatus === "pending"
        ).length;

        const nextSessions = sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, confirmedCount, pendingCount, updatedAt: now } : s
        );

        await Promise.all([
          backend.writeRegistrations(nextRegs),
          backend.writeSessions(nextSessions),
        ]);
        const sheetSync = await backend.syncRegistrationToSheet(cancelled);
        return {
          status: 200,
          registration: cancelled,
          availableSeats: session ? Math.max(0, session.maxCapacity - confirmedCount) : 0,
          sheetSynced: sheetSync.ok,
        };
      });
    },

    async getRevenueSummary() {
      const payments = await backend.readPayments();
      return computeRevenueSummary(payments);
    },
  };
}

function applySessionsCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-razorpay-signature");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

async function requireFirebaseUser(req: Request, res: Response) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : String(req.body?.idToken || "").trim();
  if (!token) {
    res.status(401).json({ error: "Authentication required. Please sign in first." });
    return null;
  }
  const verified = await verifyFirebaseIdToken(token);
  if (!verified || !verified.uid) {
    res.status(401).json({ error: "Invalid or expired Firebase ID token." });
    return null;
  }
  return verified;
}

export function registerCommunitySessionsRoutes(app: Express) {
  const service = createCommunitySessionsService();

  app.use("/api/community-sessions", applySessionsCors);
  app.use("/api/webhooks/payments", applySessionsCors);

  // ================= ADMIN ENDPOINTS =================
  app.get("/api/admin/community-sessions", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    try {
      const sessions = await service.listAdminSessions();
      res.json({ success: true, count: sessions.length, sessions });
    } catch (err) {
      console.error("[CommunitySessions] GET /api/admin/community-sessions failed:", err);
      res.status(500).json({ error: "Failed to load community sessions." });
    }
  });

  app.post("/api/admin/community-sessions", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;
    try {
      const result = await service.createSession(req.body || {}, admin.email);
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json({ success: true, session: result.session });
    } catch (err) {
      console.error("[CommunitySessions] POST /api/admin/community-sessions failed:", err);
      res.status(500).json({ error: "Failed to create community session." });
    }
  });

  app.patch("/api/admin/community-sessions/:id", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    try {
      const sessionId = String(req.params.id || "").trim();
      const result = await service.updateSession(sessionId, req.body || {});
      if (result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ success: true, session: result.session });
    } catch (err) {
      console.error("[CommunitySessions] PATCH /api/admin/community-sessions/:id failed:", err);
      res.status(500).json({ error: "Failed to update community session." });
    }
  });

  app.get("/api/admin/community-sessions/:id/participants", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    try {
      const sessionId = String(req.params.id || "").trim();
      const participants = await service.listParticipants(sessionId);
      res.json({ success: true, count: participants.length, participants });
    } catch (err) {
      console.error("[CommunitySessions] GET participants failed:", err);
      res.status(500).json({ error: "Failed to load participants." });
    }
  });

  app.get("/api/admin/revenue/summary", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    try {
      const summary = await service.getRevenueSummary();
      res.json({ success: true, ...summary });
    } catch (err) {
      console.error("[CommunitySessions] GET /api/admin/revenue/summary failed:", err);
      res.status(500).json({ error: "Failed to load revenue summary." });
    }
  });

  // ================= USER & PAYMENT ENDPOINTS =================
  app.get("/api/community-sessions", async (_req: Request, res: Response) => {
    try {
      const sessions = await service.listPublishedSessions();
      res.json({ success: true, count: sessions.length, sessions });
    } catch (err) {
      console.error("[CommunitySessions] GET /api/community-sessions failed:", err);
      res.status(500).json({ error: "Failed to load published community sessions." });
    }
  });

  app.get("/api/community-sessions/my-registrations", async (req: Request, res: Response) => {
    const user = await requireFirebaseUser(req, res);
    if (!user) return;
    try {
      const registrations = await service.listUserRegistrations(user.uid);
      res.json({ success: true, count: registrations.length, registrations });
    } catch (err) {
      console.error("[CommunitySessions] GET my-registrations failed:", err);
      res.status(500).json({ error: "Failed to load your registrations." });
    }
  });

  app.post("/api/community-sessions/:id/register-free", async (req: Request, res: Response) => {
    const user = await requireFirebaseUser(req, res);
    if (!user) return;
    try {
      const sessionId = String(req.params.id || "").trim();
      const result = await service.registerFree(sessionId, user);
      if ("error" in result && result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      console.error("[CommunitySessions] register-free failed:", err);
      res.status(500).json({ error: "Failed to register for session." });
    }
  });

  app.post("/api/community-sessions/:id/create-order", async (req: Request, res: Response) => {
    const user = await requireFirebaseUser(req, res);
    if (!user) return;
    try {
      const sessionId = String(req.params.id || "").trim();
      const result = await service.createPaidOrder(sessionId, user);
      if ("error" in result && result.error) {
        res.status(result.status).json({ error: result.error, code: (result as any).code });
        return;
      }
      res.status(201).json({ success: true, ...result });
    } catch (err: any) {
      console.error("[CommunitySessions] create-order failed:", err);
      res.status(500).json({ error: err?.message || "Failed to initiate payment order." });
    }
  });

  app.post("/api/community-sessions/verify-payment", async (req: Request, res: Response) => {
    const user = await requireFirebaseUser(req, res);
    if (!user) return;
    try {
      const body = req.body || {};
      const result = await service.verifyPayment({
        sessionId: String(body.sessionId || "").trim(),
        gatewayOrderId: String(body.gatewayOrderId || body.razorpay_order_id || "").trim(),
        gatewayPaymentId: String(body.gatewayPaymentId || body.razorpay_payment_id || "").trim(),
        gatewaySignature: String(body.gatewaySignature || body.razorpay_signature || "").trim(),
        paymentOutcome: body.paymentOutcome === "failed" ? "failed" : "verified",
        userId: user.uid,
      });
      if ("error" in result && result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.status(result.status).json({ success: true, ...result });
    } catch (err) {
      console.error("[CommunitySessions] verify-payment failed:", err);
      res.status(500).json({ error: "Payment verification failed." });
    }
  });

  app.post("/api/community-sessions/:id/cancel", async (req: Request, res: Response) => {
    const user = await requireFirebaseUser(req, res);
    if (!user) return;
    try {
      const sessionId = String(req.params.id || "").trim();
      const result = await service.cancelRegistration(sessionId, user.uid);
      if ("error" in result && result.error) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[CommunitySessions] cancel failed:", err);
      res.status(500).json({ error: "Failed to cancel registration." });
    }
  });

  // Trusted Payment Gateway Webhook (Razorpay HMAC-SHA256 verified)
  app.post("/api/webhooks/payments", async (req: Request, res: Response) => {
    try {
      const creds = getDefaultGatewayCredentials();
      const sig = String(req.headers["x-razorpay-signature"] || "").trim();
      const rawBody = JSON.stringify(req.body || {});
      if (!creds.webhookSecret || !verifyHmacSignature(creds.webhookSecret, rawBody, sig)) {
        res.status(401).json({ error: "Invalid webhook signature." });
        return;
      }

      const eventType = String(req.body?.event || "");
      const paymentEntity = req.body?.payload?.payment?.entity || {};
      const notes = paymentEntity.notes || {};
      const sessionId = String(notes.sessionId || "").trim();
      const userId = String(notes.userId || "").trim();
      const orderId = String(paymentEntity.order_id || "").trim();
      const paymentId = String(paymentEntity.id || "").trim();

      if (sessionId && userId && orderId && paymentId) {
        if (eventType === "payment.captured") {
          const validSig = computeHmacSha256(creds.keySecret, `${orderId}|${paymentId}`);
          await service.verifyPayment({
            sessionId,
            gatewayOrderId: orderId,
            gatewayPaymentId: paymentId,
            gatewaySignature: validSig,
            paymentOutcome: "verified",
            userId,
          });
        } else if (eventType === "payment.failed") {
          await service.verifyPayment({
            sessionId,
            gatewayOrderId: orderId,
            gatewayPaymentId: paymentId,
            gatewaySignature: "",
            paymentOutcome: "failed",
            userId,
          });
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("[PaymentsWebhook] Error:", err);
      res.status(500).json({ error: "Webhook processing failed." });
    }
  });
}
