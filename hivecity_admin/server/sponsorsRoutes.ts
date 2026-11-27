import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdminSession, syncRecordToGoogleSheet } from "./adminAuth";
import { isAdminHidden, markAdminHidden, unmarkAdminHidden } from "./adminHiddenStore";
import { firestore, isFirestoreQuotaBackoffActive, noteFirestoreError } from "./firebaseAdmin";

export interface SponsorRecord {
  id: string;
  sponsorName: string;
  companyDetails: string;
  companyLink: string;
  linkedinProfile: string;
  companyLocation: string;
  sponsorshipAmount: number;
  packageType: "Monthly" | "Yearly";
  createdAt: string;
}

const LOCAL_SPONSORS_FILE = path.resolve(import.meta.dirname, "sponsors_store.json");

function readLocalSponsors(): SponsorRecord[] {
  try {
    if (fs.existsSync(LOCAL_SPONSORS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_SPONSORS_FILE, "utf-8"));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch { }
  return [];
}

function writeLocalSponsors(list: SponsorRecord[]): void {
  try {
    fs.writeFileSync(LOCAL_SPONSORS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.warn("[SponsorsAPI] Could not write local sponsors store:", err);
  }
}

function sanitizeOptionalUrl(raw: unknown): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return trimmed;
  }
}

function normalizeSponsorRecord(raw: Record<string, any>): SponsorRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const sponsorName = String(raw.sponsorName || raw.Sponsor_Name || "").trim();
  const id = String(raw.id || raw.Sponsor_ID || raw.sponsorId || "").trim();
  if (!sponsorName && !id) return null;
  const amountRaw = raw.sponsorshipAmount ?? raw.Sponsorship_Amount ?? 0;
  const amountNum = Number(String(amountRaw).replace(/[^0-9.]/g, ""));
  const pkgRaw = String(raw.packageType || raw.Package_Type || "Monthly").trim().toLowerCase();
  return {
    id: id || `SPN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    sponsorName: sponsorName || "Sponsor",
    companyDetails: String(raw.companyDetails || raw.Company_Details || "").trim(),
    companyLink: sanitizeOptionalUrl(raw.companyLink || raw.Company_Link || ""),
    linkedinProfile: sanitizeOptionalUrl(raw.linkedinProfile || raw.LinkedIn_Profile || ""),
    companyLocation: String(raw.companyLocation || raw.Company_Location || "").trim(),
    sponsorshipAmount: Number.isFinite(amountNum) && amountNum > 0 ? amountNum : 0,
    packageType: pkgRaw === "yearly" ? "Yearly" : "Monthly",
    createdAt: String(raw.createdAt || raw.Created_At || new Date().toISOString()).trim(),
  };
}

async function postSponsorsActionToAppsScript(
  action: "read_sponsors" | "upsert_sponsor" | "delete_sponsor",
  extra: Record<string, any> = {}
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const result = await syncRecordToGoogleSheet(action, extra, { retries: 1 });
  return { ok: result.ok, data: result.data, error: result.error };
}

export async function backfillSponsorsToGoogleSheet(): Promise<{
  total: number;
  synced: number;
  error: string | null;
}> {
  const byId = new Map<string, SponsorRecord>();
  if (!isFirestoreQuotaBackoffActive()) {
    try {
      const snap = await firestore.collection("sponsors").get();
      snap.forEach((docSnap) => {
        const norm = normalizeSponsorRecord({ id: docSnap.id, ...(docSnap.data() || {}) });
        if (norm && !isAdminHidden("sponsors", norm.id)) byId.set(norm.id, norm);
      });
    } catch (fsErr) {
      noteFirestoreError(fsErr);
    }
  }
  for (const local of readLocalSponsors()) {
    const norm = normalizeSponsorRecord(local);
    if (norm && !isAdminHidden("sponsors", norm.id) && !byId.has(norm.id)) {
      byId.set(norm.id, norm);
    }
  }
  const list = Array.from(byId.values());
  let synced = 0;
  let lastError: string | null = null;
  for (const sponsor of list) {
    const res = await postSponsorsActionToAppsScript("upsert_sponsor", { sponsor });
    if (res.ok) synced++;
    else lastError = res.error || "Apps Script sponsor sync failed";
  }
  return { total: list.length, synced, error: lastError };
}

export function registerSponsorsRoutes(app: Express) {
  // GET /api/admin/sponsors — Authenticated Admin read synced with "sponsors details" sheet tab
  app.get("/api/admin/sponsors", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;

    const merged = new Map<string, SponsorRecord>();
    let sheetSynced = false;
    let sheetError: string | null = null;

    const sheetIds = new Set<string>();
    const sheetResult = await postSponsorsActionToAppsScript("read_sponsors");
    if (sheetResult.ok && Array.isArray(sheetResult.data?.sponsors)) {
      sheetSynced = true;
      for (const row of sheetResult.data.sponsors) {
        const norm = normalizeSponsorRecord(row);
        if (norm) {
          merged.set(norm.id, norm);
          sheetIds.add(norm.id);
        }
      }
    } else if (sheetResult.error) {
      sheetError = sheetResult.error;
    }

    if (!isFirestoreQuotaBackoffActive()) {
      try {
        const snap = await firestore.collection("sponsors").get();
        snap.forEach((docSnap) => {
          const norm = normalizeSponsorRecord({ id: docSnap.id, ...(docSnap.data() || {}) });
          if (norm && !merged.has(norm.id)) merged.set(norm.id, norm);
        });
      } catch (fsErr) {
        noteFirestoreError(fsErr);
      }
    }

    for (const local of readLocalSponsors()) {
      const norm = normalizeSponsorRecord(local);
      if (norm && !merged.has(norm.id)) {
        merged.set(norm.id, norm);
      }
    }

    const sponsors = Array.from(merged.values())
      .filter((s) => !isAdminHidden("sponsors", s.id))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    // Automatic background reconciliation: silently push any un-synced sponsors into Google Sheets
    if (sheetSynced) {
      const missingInSheet = sponsors.filter((s) => !sheetIds.has(s.id));
      for (const sponsor of missingInSheet) {
        void postSponsorsActionToAppsScript("upsert_sponsor", { sponsor });
      }
    }

    res.json({
      success: true,
      count: sponsors.length,
      sponsors,
      sheetSynced,
      sheetError,
    });
  });

  // POST /api/admin/sponsors — Authenticated Admin create/upsert sponsor + sync to "sponsors details" tab
  app.post("/api/admin/sponsors", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;

    try {
      const body = req.body || {};
      const sponsorName = String(body.sponsorName || body.Sponsor_Name || "").trim();
      if (!sponsorName) {
        res.status(400).json({ error: "Sponsor / Contact Name is required." });
        return;
      }

      const sponsor = normalizeSponsorRecord({
        ...body,
        id: body.id || `SPN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        createdAt: body.createdAt || new Date().toISOString(),
      });
      if (!sponsor) {
        res.status(400).json({ error: "Invalid sponsor payload." });
        return;
      }

      unmarkAdminHidden("sponsors", sponsor.id);
      const localList = readLocalSponsors().filter((s) => s.id !== sponsor.id);
      localList.unshift(sponsor);
      writeLocalSponsors(localList);

      // Mirror to Firestore so Sponsors live in both Firebase & Google Sheets
      if (!isFirestoreQuotaBackoffActive()) {
        try {
          await firestore.collection("sponsors").doc(sponsor.id).set(
            { ...sponsor, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
        } catch (fsErr) {
          noteFirestoreError(fsErr);
        }
      }

      const sheetResult = await postSponsorsActionToAppsScript("upsert_sponsor", { sponsor });
      if (!sheetResult.ok) {
        console.warn("[SponsorsAPI] Google Sheets sync warning:", sheetResult.error);
      }

      res.status(201).json({
        success: true,
        sponsor,
        sheetSynced: sheetResult.ok,
        sheetError: sheetResult.ok ? null : sheetResult.error || null,
      });
    } catch (error) {
      console.error("[SponsorsAPI] POST /api/admin/sponsors failed:", error);
      res.status(500).json({ error: "Failed to save sponsor." });
    }
  });

  // DELETE /api/admin/sponsors/:id — Admin-scoped sponsor delete (removes from Admin & sheet)
  app.delete("/api/admin/sponsors/:id", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;

    try {
      const sponsorId = String(req.params.id || "").trim();
      if (!sponsorId) {
        res.status(400).json({ error: "Sponsor ID is required." });
        return;
      }

      markAdminHidden("sponsors", sponsorId);
      const remaining = readLocalSponsors().filter((s) => s.id !== sponsorId);
      writeLocalSponsors(remaining);

      const sheetResult = await postSponsorsActionToAppsScript("delete_sponsor", { sponsorId });

      res.json({
        success: true,
        id: sponsorId,
        deleted: true,
        sheetSynced: sheetResult.ok,
        sheetError: sheetResult.ok ? null : sheetResult.error || null,
      });
    } catch (error) {
      console.error("[SponsorsAPI] DELETE /api/admin/sponsors/:id failed:", error);
      res.status(500).json({ error: "Failed to delete sponsor." });
    }
  });
}
