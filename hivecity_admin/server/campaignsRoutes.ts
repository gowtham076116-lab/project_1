import fs from "node:fs";
import path from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdminSession, syncRecordToGoogleSheet } from "./adminAuth";
import { isAdminHidden, markAdminHidden, unmarkAdminHidden } from "./adminHiddenStore";
import { firestore, isFirestoreQuotaBackoffActive, noteFirestoreError } from "./firebaseAdmin";

export type CampaignCategory = "Run" | "Food & Beverages";
export type DeliveryStatus = "Delivered Successfully" | "Internet Issue" | "Not Sent";

export interface CampaignRecord {
  id: string;
  category: CampaignCategory;
  title: string;
  imageUrl: string;
  message: string;
  ctaUrl: string;
  deliveryStatus: DeliveryStatus;
  deliveryMessage: string;
  resendCount: number;
  resentAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const LOCAL_CAMPAIGNS_FILE = path.resolve(import.meta.dirname, "campaigns_store.json");

function readLocalCampaigns(): CampaignRecord[] {
  try {
    if (fs.existsSync(LOCAL_CAMPAIGNS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_CAMPAIGNS_FILE, "utf-8"));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch { }
  return [];
}

function writeLocalCampaigns(list: CampaignRecord[]): void {
  try {
    fs.writeFileSync(LOCAL_CAMPAIGNS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.warn("[CampaignsAPI] Local write warning:", err);
  }
}

function sanitizeImage(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(s)) {
    return s.length <= 900_000 ? s : "";
  }
  if (/^(assets\/|\/assets\/|https?:\/\/)/i.test(s)) return s;
  return "";
}

function sanitizeCtaUrl(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("#") || s.startsWith("/")) return s;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
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

function normalizeCampaign(id: string, raw: Record<string, any>): CampaignRecord {
  const catRaw = String(raw.category || "Run").trim().toLowerCase();
  const category: CampaignCategory =
    catRaw.includes("food") || catRaw.includes("beverage") ? "Food & Beverages" : "Run";
  const statusRaw = String(raw.deliveryStatus || "Delivered Successfully").trim();
  const deliveryStatus: DeliveryStatus =
    statusRaw === "Internet Issue" || statusRaw === "Not Sent"
      ? statusRaw
      : "Delivered Successfully";
  const defaultMsg =
    deliveryStatus === "Internet Issue"
      ? "Not sent due to an internet connection issue. Please check your connection and resend."
      : deliveryStatus === "Not Sent"
        ? "Campaign notification failed to deliver."
        : "Campaign notification delivered successfully to users.";
  return {
    id,
    category,
    title: String(raw.title || "Hivecity Announcement").trim(),
    imageUrl: sanitizeImage(raw.imageUrl || raw.image || raw.coverImage || ""),
    message: String(raw.message || raw.description || "").trim(),
    ctaUrl: sanitizeCtaUrl(raw.ctaUrl || raw.actionUrl || ""),
    deliveryStatus,
    deliveryMessage: String(raw.deliveryMessage || defaultMsg).trim(),
    resendCount: Math.max(0, Math.floor(Number(raw.resendCount) || 0)),
    resentAt: raw.resentAt ? toIso(raw.resentAt) : undefined,
    createdBy: String(raw.createdBy || "admin").trim(),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
  };
}

async function syncNotificationDocToSheet(campaign: CampaignRecord): Promise<{ ok: boolean; error?: string }> {
  const res = await syncRecordToGoogleSheet(
    "append_notification",
    {
      notification: {
        id: campaign.id,
        category: campaign.category,
        deliveryStatus: campaign.deliveryStatus,
        title: campaign.title,
        message: campaign.message,
        sentAt: campaign.resentAt || campaign.createdAt,
      },
    },
    { retries: 1 }
  );
  return { ok: res.ok, error: res.error };
}

function applyCampaignsCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

async function loadAllCampaigns(): Promise<CampaignRecord[]> {
  const map = new Map<string, CampaignRecord>();
  if (!isFirestoreQuotaBackoffActive()) {
    try {
      const snap = await firestore.collection("community_campaigns").get();
      snap.forEach((docSnap) => {
        map.set(docSnap.id, normalizeCampaign(docSnap.id, docSnap.data() || {}));
      });
    } catch (err) {
      noteFirestoreError(err);
    }
  }
  for (const local of readLocalCampaigns()) {
    if (local?.id && !map.has(local.id)) {
      map.set(local.id, normalizeCampaign(local.id, local));
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function registerCampaignsRoutes(app: Express) {
  app.use("/api/campaigns", applyCampaignsCors);

  // GET /api/campaigns — User-facing live campaigns feed for Notifications page
  app.get("/api/campaigns", async (_req: Request, res: Response) => {
    try {
      const campaigns = await loadAllCampaigns();
      res.json({ success: true, count: campaigns.length, campaigns });
    } catch (err) {
      console.error("[CampaignsAPI] GET /api/campaigns failed:", err);
      res.status(500).json({ error: "Failed to load campaigns." });
    }
  });

  // GET /api/admin/campaigns — Admin Campaign Studio list (respecting Admin-scoped soft delete)
  app.get("/api/admin/campaigns", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    try {
      const all = await loadAllCampaigns();
      const campaigns = all.filter((c) => !isAdminHidden("campaigns", c.id));
      res.json({ success: true, count: campaigns.length, campaigns });
    } catch (err) {
      console.error("[CampaignsAPI] GET /api/admin/campaigns failed:", err);
      res.status(500).json({ error: "Failed to load admin campaigns." });
    }
  });

  // POST /api/admin/campaigns — Admin create/publish Run or Food & Beverages campaign
  app.post("/api/admin/campaigns", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;
    try {
      const body = req.body || {};
      const title = String(body.title || "").trim();
      const message = String(body.message || body.description || "").trim();
      if (!title) {
        res.status(400).json({ error: "Campaign Title / Headline is required." });
        return;
      }
      if (!message) {
        res.status(400).json({ error: "Campaign Message / Description is required." });
        return;
      }

      const id =
        typeof body.id === "string" && body.id.trim()
          ? body.id.trim()
          : `CMP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const now = new Date().toISOString();
      const campaign = normalizeCampaign(id, {
        ...body,
        title,
        message,
        createdBy: admin.email,
        createdAt: now,
        updatedAt: now,
      });

      unmarkAdminHidden("campaigns", id);
      const localList = readLocalCampaigns().filter((c) => c.id !== id);
      localList.unshift(campaign);
      writeLocalCampaigns(localList);

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore
            .collection("community_campaigns")
            .doc(id)
            .set({ ...campaign, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        } catch (err) {
          noteFirestoreError(err);
        }
      }

      const sheetResult = await syncNotificationDocToSheet(campaign);

      res.status(201).json({
        success: true,
        campaign,
        sheetSynced: sheetResult.ok,
        sheetError: sheetResult.ok ? null : sheetResult.error || null,
      });
    } catch (err) {
      console.error("[CampaignsAPI] POST /api/admin/campaigns failed:", err);
      res.status(500).json({ error: "Failed to publish campaign." });
    }
  });

  // GET /api/admin/notifications — Admin delivery log of all sent/resent campaign notifications
  app.get("/api/admin/notifications", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    try {
      const all = await loadAllCampaigns();
      const notifications = all
        .filter((c) => !isAdminHidden("campaigns", c.id))
        .sort((a, b) => (b.resentAt || b.createdAt || "").localeCompare(a.resentAt || a.createdAt || ""));
      res.json({ success: true, count: notifications.length, notifications });
    } catch (err) {
      console.error("[CampaignsAPI] GET /api/admin/notifications failed:", err);
      res.status(500).json({ error: "Failed to load notification delivery logs." });
    }
  });

  // POST /api/admin/campaigns/:id/resend — Re-broadcast campaign to User Notifications & append to Sheet Notifications tab
  app.post("/api/admin/campaigns/:id/resend", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;
    try {
      const id = String(req.params.id || "").trim();
      const all = await loadAllCampaigns();
      const existing = all.find((c) => c.id === id);
      if (!existing) {
        res.status(404).json({ error: "Campaign notification not found." });
        return;
      }

      const now = new Date().toISOString();
      const updated: CampaignRecord = {
        ...existing,
        deliveryStatus: "Delivered Successfully",
        deliveryMessage: "Campaign notification delivered successfully to users.",
        resendCount: (existing.resendCount || 0) + 1,
        resentAt: now,
        updatedAt: now,
      };

      const localList = [updated, ...readLocalCampaigns().filter((c) => c.id !== id)];
      writeLocalCampaigns(localList);

      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore
            .collection("community_campaigns")
            .doc(id)
            .set({ ...updated, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        } catch (err) {
          noteFirestoreError(err);
        }
      }

      const sheetResult = await syncNotificationDocToSheet(updated);
      res.json({
        success: true,
        notification: updated,
        sheetSynced: sheetResult.ok,
        sheetError: sheetResult.ok ? null : sheetResult.error || null,
      });
    } catch (err) {
      console.error("[CampaignsAPI] POST /api/admin/campaigns/:id/resend failed:", err);
      res.status(500).json({ error: "Failed to resend campaign notification." });
    }
  });

  // DELETE /api/admin/campaigns/:id — Admin-scoped deletion
  app.delete("/api/admin/campaigns/:id", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    try {
      const id = String(req.params.id || "").trim();
      if (!id) {
        res.status(400).json({ error: "Campaign ID is required." });
        return;
      }
      markAdminHidden("campaigns", id);
      const hard = String(req.query.hard || "").toLowerCase() === "true";
      if (hard) {
        writeLocalCampaigns(readLocalCampaigns().filter((c) => c.id !== id));
        if (!isFirestoreQuotaBackoffActive()) {
          try {
            await firestore.collection("community_campaigns").doc(id).delete();
          } catch (err) {
            noteFirestoreError(err);
          }
        }
      }
      res.json({ success: true, id, deleted: true });
    } catch (err) {
      console.error("[CampaignsAPI] DELETE /api/admin/campaigns/:id failed:", err);
      res.status(500).json({ error: "Failed to delete campaign." });
    }
  });
}
