import fs from "node:fs";
import path from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdminSession, syncRecordToGoogleSheet } from "./adminAuth";
import { firestore, isFirestoreQuotaBackoffActive, noteFirestoreError } from "./firebaseAdmin";

export type SupportTicketStatus = "Open" | "Verified & Resolved";

export interface SupportTicketRecord {
  id: string;
  userId: string;
  userName: string;
  mobile: string;
  email: string;
  subject: string;
  concern: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
}

const LOCAL_SUPPORT_FILE = path.resolve(import.meta.dirname, "support_tickets_store.json");

function readLocalTickets(): SupportTicketRecord[] {
  try {
    if (fs.existsSync(LOCAL_SUPPORT_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_SUPPORT_FILE, "utf-8"));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch { }
  return [];
}

function writeLocalTickets(list: SupportTicketRecord[]): void {
  try {
    fs.writeFileSync(LOCAL_SUPPORT_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.warn("[SupportAPI] Local write warning:", err);
  }
}

function toIso(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === "string") return val;
  if (val instanceof Date) return val.toISOString();
  const ts = val as { toDate?: () => Date; seconds?: number };
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return new Date().toISOString();
}

function normalizeTicket(id: string, raw: Record<string, any>): SupportTicketRecord {
  const statusRaw = String(raw.status || "Open").trim();
  const status: SupportTicketStatus =
    statusRaw === "Verified & Resolved" || statusRaw.toLowerCase().includes("resolved")
      ? "Verified & Resolved"
      : "Open";
  return {
    id,
    userId: String(raw.userId || "guest").trim(),
    userName: String(raw.userName || "Hive Athlete").trim(),
    mobile: String(raw.mobile || raw.phone || "").trim(),
    email: String(raw.email || "").trim(),
    subject: String(raw.subject || "Other").trim(),
    concern: String(raw.concern || raw.message || "").trim(),
    status,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
  };
}

function applySupportCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

async function loadAllTickets(): Promise<SupportTicketRecord[]> {
  const map = new Map<string, SupportTicketRecord>();
  if (!isFirestoreQuotaBackoffActive()) {
    try {
      const snap = await firestore.collection("support_tickets").get();
      snap.forEach((d) => map.set(d.id, normalizeTicket(d.id, d.data() || {})));
    } catch (err) {
      noteFirestoreError(err);
    }
  }
  for (const local of readLocalTickets()) {
    if (local?.id && !map.has(local.id)) {
      map.set(local.id, normalizeTicket(local.id, local));
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

async function syncTicketToSheet(ticket: SupportTicketRecord) {
  return syncRecordToGoogleSheet(
    "upsert_support_ticket",
    { ticket },
    { retries: 1 }
  );
}

export function registerSupportRoutes(app: Express) {
  app.use("/api/support", applySupportCors);

  // POST /api/support/tickets — User Help form submission
  app.post("/api/support/tickets", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const userName = String(body.userName || body.name || "Hive Athlete").trim();
      const mobile = String(body.mobile || body.phone || "").trim();
      const email = String(body.email || "").trim();
      const subject = String(body.subject || "Other").trim();
      const concern = String(body.concern || body.message || "").trim();

      if (!mobile && !email) {
        res.status(400).json({ error: "Please provide at least a Mobile Number or an Email ID." });
        return;
      }
      if (!concern) {
        res.status(400).json({ error: "Please describe your problem or concern." });
        return;
      }

      const id = `SUP-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const now = new Date().toISOString();
      const ticket = normalizeTicket(id, {
        userId: String(body.userId || "guest").trim(),
        userName,
        mobile,
        email,
        subject,
        concern,
        status: "Open",
        createdAt: now,
        updatedAt: now,
      });

      const next = [ticket, ...readLocalTickets().filter((t) => t.id !== id)];
      writeLocalTickets(next);

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore
            .collection("support_tickets")
            .doc(id)
            .set({ ...ticket, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        } catch (err) {
          noteFirestoreError(err);
        }
      }

      const sheetRes = await syncTicketToSheet(ticket);
      res.status(201).json({
        success: true,
        ticket,
        sheetSynced: sheetRes.ok,
      });
    } catch (err) {
      console.error("[SupportAPI] POST /api/support/tickets failed:", err);
      res.status(500).json({ error: "Could not submit your help request." });
    }
  });

  // GET /api/admin/support/tickets — Admin Support Centre directory
  app.get("/api/admin/support/tickets", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    try {
      const tickets = await loadAllTickets();
      res.json({ success: true, count: tickets.length, tickets });
    } catch (err) {
      console.error("[SupportAPI] GET /api/admin/support/tickets failed:", err);
      res.status(500).json({ error: "Failed to load support tickets." });
    }
  });

  // PATCH /api/admin/support/tickets/:id — Toggle Open / Verified & Resolved and sync to Sheet
  app.patch("/api/admin/support/tickets/:id", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    try {
      const id = String(req.params.id || "").trim();
      const all = await loadAllTickets();
      const existing = all.find((t) => t.id === id);
      if (!existing) {
        res.status(404).json({ error: "Support ticket not found." });
        return;
      }

      const nextStatus: SupportTicketStatus =
        String(req.body?.status || "").toLowerCase().includes("open")
          ? "Open"
          : "Verified & Resolved";
      const updated: SupportTicketRecord = {
        ...existing,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };

      const next = [updated, ...readLocalTickets().filter((t) => t.id !== id)];
      writeLocalTickets(next);

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore
            .collection("support_tickets")
            .doc(id)
            .set({ ...updated, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        } catch (err) {
          noteFirestoreError(err);
        }
      }

      const sheetRes = await syncTicketToSheet(updated);
      res.json({ success: true, ticket: updated, sheetSynced: sheetRes.ok });
    } catch (err) {
      console.error("[SupportAPI] PATCH /api/admin/support/tickets/:id failed:", err);
      res.status(500).json({ error: "Failed to update ticket status." });
    }
  });
}
