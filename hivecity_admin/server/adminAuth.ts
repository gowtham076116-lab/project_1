import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Express, Request, Response, NextFunction } from "express";
import {
  firestore,
  firebaseAdminAuth,
  isFirestoreQuotaBackoffActive,
  noteFirestoreError,
} from "./firebaseAdmin";
import { isAdminHidden, markAdminHidden } from "./adminHiddenStore";
import { FieldValue } from "firebase-admin/firestore";

dotenv.config();
if (fs.existsSync(path.resolve(process.cwd(), ".env.local"))) {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
}

// Consolidate all permissions into a single full-access ADMIN role
export type AdminRole = "ADMIN";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  emailVerified: boolean;
}

export interface AdminSessionPayload {
  adminId: string;
  email: string;
  name: string;
  role: AdminRole;
  emailVerified: boolean;
  iat: number;
  exp: number;
}

// Cookie dedicated strictly to Admin sessions — separate from ordinary user sessions
export const HIVE_ADMIN_COOKIE = "hive_admin_session";
export const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Exact Firebase Project Config
const FIREBASE_API_KEY = "AIzaSyDm1OW7KxPv_y9ZziQL-HK-_4YIJjxfqpY";
const PRIMARY_AUTHORIZED_ADMIN_EMAIL = "hivecity10@gmail.com";

// HMAC token signing secret must be supplied privately through the backend environment.
function getAdminSecret(): string {
  const secret =
    process.env.ADMIN_JWT_SECRET?.trim() ||
    process.env.MANUS_JWT_SECRET?.trim() ||
    "";

  if (secret.length < 32) {
    throw new Error(
      "ADMIN_JWT_SECRET (or MANUS_JWT_SECRET) must be configured with at least 32 characters."
    );
  }

  return secret;
}

// File path for persisting registered admins in the admin collection
const ADMIN_REGISTRY_FILE = path.resolve(import.meta.dirname, "admin_users.json");

function loadAdminRegistry(): Record<string, { email: string; name: string; uid: string; createdAt: string }> {
  try {
    if (fs.existsSync(ADMIN_REGISTRY_FILE)) {
      const data = fs.readFileSync(ADMIN_REGISTRY_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn("[AdminAuth] Could not read admin registry file, initializing default.");
  }
  const defaultRegistry: Record<string, { email: string; name: string; uid: string; createdAt: string }> = {
    [PRIMARY_AUTHORIZED_ADMIN_EMAIL.toLowerCase()]: {
      email: PRIMARY_AUTHORIZED_ADMIN_EMAIL.toLowerCase(),
      name: "Hive City Super Admin",
      uid: "root-admin-uid",
      createdAt: new Date().toISOString(),
    },
  };
  saveAdminRegistry(defaultRegistry);
  return defaultRegistry;
}

function saveAdminRegistry(registry: Record<string, { email: string; name: string; uid: string; createdAt: string }>) {
  try {
    fs.writeFileSync(ADMIN_REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf-8");
  } catch (e) {
    console.error("[AdminAuth] Failed to write admin registry file:", e);
  }
}

let ADMIN_REGISTRY = loadAdminRegistry();

// Persistent configuration for Admin settings (including Google Apps Script Web App URL)
const ADMIN_CONFIG_FILE = path.resolve(import.meta.dirname, "admin_config.json");
const LOCAL_USERS_STORE_FILE = path.resolve(import.meta.dirname, "users_store.json");

export function getGoogleScriptUrl(): string {
  const envUrl =
    process.env.APPS_SCRIPT_WEB_APP_URL?.trim() ||
    process.env.GOOGLE_SCRIPT_URL?.trim() ||
    "";
  if (envUrl) return envUrl;
  try {
    if (fs.existsSync(ADMIN_CONFIG_FILE)) {
      const conf = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, "utf-8"));
      if (conf.googleScriptUrl) return String(conf.googleScriptUrl).trim();
    }
  } catch (e) { }
  return "";
}

export function setGoogleScriptUrl(url: string) {
  try {
    let conf: Record<string, any> = {};
    if (fs.existsSync(ADMIN_CONFIG_FILE)) {
      conf = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, "utf-8"));
    }
    const clean = (url || "").trim();
    conf.googleScriptUrl = clean;
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(conf, null, 2), "utf-8");
    process.env.GOOGLE_SCRIPT_URL = clean;
    process.env.APPS_SCRIPT_WEB_APP_URL = clean;
  } catch (e) {
    console.error("[AdminAuth] Failed to save Google Script URL:", e);
  }
}

/**
 * Returns the cryptographically secure shared secret for server-to-Apps-Script communication.
 * Kept exclusively in backend environment variables and never sent to browser clients.
 */
export function getAppsScriptSecret(): string {
  return (
    process.env.APPS_SCRIPT_SHARED_SECRET?.trim() ||
    process.env.APPS_SCRIPT_SECRET?.trim() ||
    ""
  );
}

/**
 * Centralized, retrying server-to-server Google Apps Script writer/reader.
 * Permanently uses backend APPS_SCRIPT_WEB_APP_URL + APPS_SCRIPT_SHARED_SECRET
 * so every current and future sheet-backed record syncs automatically with zero manual clicks.
 */
export async function syncRecordToGoogleSheet(
  action: string,
  payload: Record<string, any> = {},
  options: { retries?: number; scriptUrl?: string; secret?: string } = {}
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const scriptUrl = (options.scriptUrl || getGoogleScriptUrl()).trim();
  const secret = (options.secret || getAppsScriptSecret()).trim();
  if (!scriptUrl) {
    return { ok: false, status: 400, error: "APPS_SCRIPT_WEB_APP_URL is not configured." };
  }
  if (!secret) {
    return { ok: false, status: 500, error: "APPS_SCRIPT_SHARED_SECRET is not configured." };
  }

  const maxAttempts = Math.max(1, (options.retries ?? 1) + 1);
  let lastError = "Failed to reach Google Apps Script.";
  let lastStatus = 502;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          secret,
          sharedSecret: secret,
          ...payload,
        }),
        redirect: "follow",
      });
      lastStatus = res.status;
      const text = await res.text();
      if (/^\s*</.test(text)) {
        lastError = `Apps Script returned an HTML login/error page (HTTP ${res.status}). Verify Web App access ("Anyone") and deployment version.`;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        return { ok: false, status: 502, error: lastError };
      }

      let parsed: any = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        lastError = `Apps Script returned non-JSON response (HTTP ${res.status}).`;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        return { ok: false, status: 502, error: lastError };
      }

      if (!res.ok || parsed.status === "error") {
        const msg = String(parsed.message || `Apps Script error (${res.status})`);
        if (/secret|unauthorized/i.test(msg)) {
          return {
            ok: false,
            status: 403,
            data: parsed,
            error: `${msg} Ensure APPS_SCRIPT_SHARED_SECRET in Apps Script Script Properties matches backend .env.local.`,
          };
        }
        lastError = msg;
        if (res.status >= 500 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        return { ok: false, status: res.ok ? 400 : res.status, data: parsed, error: msg };
      }

      return { ok: true, status: 200, data: parsed };
    } catch (err: any) {
      lastError = err?.message || "Failed to reach Google Apps Script.";
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
    }
  }

  return { ok: false, status: lastStatus, error: lastError };
}

export interface UnifiedSyncedUser {
  uid: string;
  email: string;
  displayName: string;
  name: string;
  username: string;
  mobile: string;
  city: string;
  bio: string;
  photoURL: string | null;
  provider: string;
  role: string;
  emailVerified: boolean;
  status: string;
  bmi?: number;
  bmiCategory?: string;
  dailyCalorieTarget?: number;
  registrationDate: string;
  createdAt: string;
  lastLogin: string;
  lastLoginAt: string;
  updatedAt: string;
  runsCount: number;
  postsCount: number;
  followersCount: number;
  followingCount: number;
  isPrivate: boolean;
  discoverable: boolean;
  profileSuggestions?: any[];
  sheetSynced: boolean;
}

function toIsoSafe(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as any).toDate === "function"
  ) {
    try {
      const d = (value as any).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : "";
    } catch {
      return "";
    }
  }
  return "";
}

function readLocalUsersStore(): UnifiedSyncedUser[] {
  try {
    if (!fs.existsSync(LOCAL_USERS_STORE_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(LOCAL_USERS_STORE_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalUsersStore(users: UnifiedSyncedUser[]): void {
  try {
    fs.writeFileSync(LOCAL_USERS_STORE_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch (e) {
    console.error("[AdminAuth] Failed to write local users fallback store:", e);
  }
}

function upsertLocalUserStore(record: UnifiedSyncedUser): UnifiedSyncedUser {
  const existingList = readLocalUsersStore();
  const idx = existingList.findIndex(
    (u) =>
      (record.uid && u.uid === record.uid) ||
      (!u.uid && record.email && u.email?.toLowerCase() === record.email.toLowerCase())
  );
  if (idx >= 0) {
    const prev = existingList[idx];
    const merged: UnifiedSyncedUser = {
      ...prev,
      ...record,
      registrationDate: prev.registrationDate || record.registrationDate,
      createdAt: prev.createdAt || record.createdAt || prev.registrationDate || record.registrationDate,
      mobile: record.mobile || prev.mobile || "",
      city: record.city || prev.city || "",
      bio: record.bio || prev.bio || "",
      username: record.username || prev.username || "",
      bmi: record.bmi !== undefined ? record.bmi : prev.bmi,
      bmiCategory: record.bmiCategory || prev.bmiCategory,
      dailyCalorieTarget:
        record.dailyCalorieTarget !== undefined ? record.dailyCalorieTarget : prev.dailyCalorieTarget,
      sheetSynced: Boolean(record.sheetSynced || prev.sheetSynced),
    };
    existingList[idx] = merged;
    writeLocalUsersStore(existingList);
    return merged;
  }
  existingList.unshift(record);
  writeLocalUsersStore(existingList);
  return record;
}

export function normalizeUnifiedUserRecord(
  raw: Record<string, any>,
  opts?: { defaultUid?: string; sheetSynced?: boolean }
): UnifiedSyncedUser | null {
  const uid = String(
    raw.uid || raw.Firebase_UID || raw.UID || raw.userId || opts?.defaultUid || ""
  ).trim();
  const email = String(raw.email || raw.Email || "").trim().toLowerCase();
  if (!uid && !email) return null;

  const displayName = String(
    raw.displayName ||
    raw.Display_Name ||
    raw["Display Name"] ||
    raw.name ||
    (email ? email.split("@")[0] : "Athlete")
  ).trim();
  const regIso =
    toIsoSafe(
      raw.registrationDate || raw.Registration_Date || raw["Registration Date"] || raw.createdAt
    ) || "";
  const lastLoginIso =
    toIsoSafe(
      raw.lastSignIn ||
      raw.Last_SignIn ||
      raw.lastLogin ||
      raw["Last Login"] ||
      raw.lastLoginAt ||
      raw.lastActive ||
      raw.updatedAt
    ) || regIso;
  const updatedIso = toIsoSafe(raw.updatedAt || raw["Updated At"]) || lastLoginIso || regIso;
  const rawStatus = String(raw.status || raw.Status || "").trim();
  const statusLower = rawStatus.toLowerCase();
  const emailVerified =
    raw.emailVerified !== undefined
      ? Boolean(raw.emailVerified)
      : statusLower
        ? !statusLower.includes("pending")
        : true;
  const normalizedStatus =
    statusLower === "suspended"
      ? "suspended"
      : statusLower.includes("pending") || !emailVerified
        ? "Pending Verification"
        : "active";
  const provider = String(raw.provider || raw.Provider || "password").trim();
  const role = String(
    raw.role || (email && isAuthorizedAdminEmail(email) ? "ADMIN" : "USER")
  ).trim();

  return {
    uid: uid || `email-${email}`,
    email,
    displayName,
    name: displayName,
    username: String(raw.username || (email ? email.split("@")[0] : "athlete")).trim(),
    mobile: String(raw.mobile || raw.Mobile || raw.phone || "").trim(),
    city: String(raw.city || "").trim(),
    bio: String(raw.bio || "").trim(),
    photoURL: raw.photoURL ? String(raw.photoURL) : null,
    provider,
    role,
    emailVerified,
    status: normalizedStatus,
    bmi: typeof raw.bmi === "number" && Number.isFinite(raw.bmi) ? raw.bmi : undefined,
    bmiCategory: raw.bmiCategory ? String(raw.bmiCategory) : undefined,
    dailyCalorieTarget:
      typeof raw.dailyCalorieTarget === "number" && Number.isFinite(raw.dailyCalorieTarget)
        ? raw.dailyCalorieTarget
        : undefined,
    registrationDate: regIso,
    createdAt: regIso,
    lastLogin: lastLoginIso,
    lastLoginAt: lastLoginIso,
    updatedAt: updatedIso,
    runsCount: Number(raw.runsCount || 0),
    postsCount: Number(raw.postsCount || 0),
    followersCount: Number(raw.followersCount || 0),
    followingCount: Number(raw.followingCount || 0),
    isPrivate: Boolean(raw.isPrivate),
    discoverable: raw.discoverable !== false,
    profileSuggestions: Array.isArray(raw.profileSuggestions) ? raw.profileSuggestions : [],
    sheetSynced: Boolean(opts?.sheetSynced || raw.sheetSynced),
  };
}

export function mergeUnifiedUsers(sources: UnifiedSyncedUser[][]): UnifiedSyncedUser[] {
  const byUid = new Map<string, UnifiedSyncedUser>();
  const emailToUid = new Map<string, string>();

  for (const list of sources) {
    for (const item of list) {
      if (!item) continue;
      const cleanUid = (item.uid || "").trim();
      const cleanEmail = (item.email || "").trim().toLowerCase();
      let targetKey = cleanUid;

      if (cleanEmail && emailToUid.has(cleanEmail)) {
        const mappedUid = emailToUid.get(cleanEmail)!;
        if (cleanUid.startsWith("email-") || !cleanUid) {
          targetKey = mappedUid;
        } else if (mappedUid.startsWith("email-")) {
          // Promote legacy email-only entry to real Firebase UID
          const oldEntry = byUid.get(mappedUid);
          if (oldEntry) {
            byUid.delete(mappedUid);
            byUid.set(cleanUid, { ...oldEntry, uid: cleanUid });
          }
          emailToUid.set(cleanEmail, cleanUid);
          targetKey = cleanUid;
        }
      }

      if (!targetKey) continue;
      const existing = byUid.get(targetKey);
      if (!existing) {
        byUid.set(targetKey, { ...item, uid: targetKey });
        if (cleanEmail) emailToUid.set(cleanEmail, targetKey);
      } else {
        const pickLatestIso = (a: string, b: string) => {
          if (!a) return b;
          if (!b) return a;
          return new Date(b).getTime() > new Date(a).getTime() ? b : a;
        };
        const pickEarliestIso = (a: string, b: string) => {
          if (!a) return b;
          if (!b) return a;
          return new Date(b).getTime() < new Date(a).getTime() ? b : a;
        };
        byUid.set(targetKey, {
          ...existing,
          email: existing.email || item.email,
          displayName:
            existing.displayName && existing.displayName !== "Athlete" && existing.displayName !== "Hive Athlete"
              ? existing.displayName
              : item.displayName || existing.displayName,
          name:
            existing.name && existing.name !== "Athlete" && existing.name !== "Hive Athlete"
              ? existing.name
              : item.name || existing.name,
          username: existing.username && existing.username !== "athlete" ? existing.username : item.username || existing.username,
          mobile: existing.mobile || item.mobile,
          city: existing.city || item.city,
          bio: existing.bio || item.bio,
          photoURL: existing.photoURL || item.photoURL,
          provider: existing.provider || item.provider,
          role: existing.role === "ADMIN" || item.role === "ADMIN" ? "ADMIN" : existing.role || item.role,
          emailVerified: Boolean(existing.emailVerified || item.emailVerified),
          status:
            existing.status === "suspended" || item.status === "suspended"
              ? "suspended"
              : existing.emailVerified || item.emailVerified
                ? "active"
                : existing.status || item.status,
          bmi: existing.bmi !== undefined ? existing.bmi : item.bmi,
          bmiCategory: existing.bmiCategory || item.bmiCategory,
          dailyCalorieTarget:
            existing.dailyCalorieTarget !== undefined ? existing.dailyCalorieTarget : item.dailyCalorieTarget,
          registrationDate: pickEarliestIso(existing.registrationDate, item.registrationDate),
          createdAt: pickEarliestIso(existing.createdAt, item.createdAt),
          lastLogin: pickLatestIso(existing.lastLogin, item.lastLogin),
          lastLoginAt: pickLatestIso(existing.lastLoginAt, item.lastLoginAt),
          updatedAt: pickLatestIso(existing.updatedAt, item.updatedAt),
          runsCount: Math.max(existing.runsCount || 0, item.runsCount || 0),
          postsCount: Math.max(existing.postsCount || 0, item.postsCount || 0),
          followersCount: Math.max(existing.followersCount || 0, item.followersCount || 0),
          followingCount: Math.max(existing.followingCount || 0, item.followingCount || 0),
          sheetSynced: Boolean(existing.sheetSynced || item.sheetSynced),
        });
        if (cleanEmail) emailToUid.set(cleanEmail, targetKey);
      }
    }
  }

  return Array.from(byUid.values()).sort((a, b) => {
    const tA = new Date(a.lastLogin || a.registrationDate || 0).getTime() || 0;
    const tB = new Date(b.lastLogin || b.registrationDate || 0).getTime() || 0;
    return tB - tA;
  });
}

/**
 * Check whether an email is in the authorized admin collection/whitelist.
 */
export function isAuthorizedAdminEmail(email: string): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (normalized === PRIMARY_AUTHORIZED_ADMIN_EMAIL.toLowerCase()) return true;
  return Boolean(ADMIN_REGISTRY[normalized]);
}

/**
 * Enforce that the incoming request has a valid, authenticated admin session
 * belonging to an authorized admin on the whitelist.
 */
export function requireAdminSession(req: Request, res: Response): AdminUser | null {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    res.status(401).json({
      error: "UNAUTHENTICATED",
      message: "Administrative authentication required to access this resource.",
    });
    return null;
  }
  if (!isAuthorizedAdminEmail(admin.email)) {
    res.status(403).json({
      error: "FORBIDDEN",
      message: "Access restricted: account is not an authorized administrator.",
    });
    return null;
  }
  return admin;
}

/**
 * Register or update an admin in the admin collection.
 */
export function registerAuthorizedAdmin(uid: string, email: string, name: string) {
  const normalized = email.trim().toLowerCase();
  ADMIN_REGISTRY[normalized] = {
    email: normalized,
    name: name || "Hive Administrator",
    uid,
    createdAt: new Date().toISOString(),
  };
  saveAdminRegistry(ADMIN_REGISTRY);
}

/**
 * Create a cryptographically signed HMAC-SHA256 session token.
 */
export function signAdminToken(user: AdminUser): string {
  const now = Date.now();
  const payload: AdminSessionPayload = {
    adminId: user.id,
    email: user.email,
    name: user.name,
    role: "ADMIN",
    emailVerified: user.emailVerified,
    iat: now,
    exp: now + ADMIN_SESSION_DURATION_MS,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getAdminSecret())
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Verify HMAC-SHA256 admin session token with constant-time equality check.
 */
export function verifyAdminToken(token: string): AdminUser | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;

  const expectedSignature = crypto
    .createHmac("sha256", getAdminSecret())
    .update(payloadB64)
    .digest("base64url");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload: AdminSessionPayload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    );

    if (Date.now() > payload.exp) {
      return null;
    }

    return {
      id: payload.adminId,
      email: payload.email,
      name: payload.name,
      role: "ADMIN",
      emailVerified: payload.emailVerified,
    };
  } catch {
    return null;
  }
}

/**
 * Extract and verify Admin user from request cookies or Authorization header.
 */
export function getAdminFromRequest(req: Request): AdminUser | null {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${HIVE_ADMIN_COOKIE}=`));

    if (match) {
      const token = match.substring(HIVE_ADMIN_COOKIE.length + 1);
      const verified = verifyAdminToken(token);
      if (verified) return verified;
    }
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    const verified = verifyAdminToken(token);
    if (verified) return verified;
  }

  return null;
}

/**
 * Verify a Firebase ID Token using Google's official Identity Toolkit API.
 * Ensures the token is valid, unexpired, and issued for the hivecity-32eb6 project.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
} | null> {
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("[Firebase Token Verify Failed]:", errText);
      return null;
    }

    const data = await response.json();
    if (!data.users || data.users.length === 0) {
      return null;
    }

    const user = data.users[0];
    return {
      uid: user.localId,
      email: user.email || "",
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName || user.email?.split("@")[0] || "Admin User",
    };
  } catch (error) {
    console.error("[Firebase Verification Error]:", error);
    return null;
  }
}

/**
 * Register Express admin auth routes.
 */
export function registerAdminAuthRoutes(app: Express) {
  /**
   * POST /api/admin/firebase-session
   * Receives Firebase ID token after Firebase Auth sign-in or registration.
   * Verifies ID token with Google, enforces email verification and admin collection check.
   */
  app.post("/api/admin/firebase-session", async (req: Request, res: Response) => {
    const { idToken, name } = req.body || {};

    if (!idToken) {
      res.status(400).json({ error: "Firebase ID token is required" });
      return;
    }

    const verifiedFirebaseUser = await verifyFirebaseIdToken(idToken);
    if (!verifiedFirebaseUser) {
      res.status(401).json({
        error: "INVALID_TOKEN",
        message: "Invalid or expired Firebase ID token. Please authenticate again.",
      });
      return;
    }

    const { uid, email, emailVerified, displayName } = verifiedFirebaseUser;

    // 1. Enforce mandatory email verification
    if (!emailVerified) {
      res.status(403).json({
        error: "EMAIL_NOT_VERIFIED",
        message: "Email verification required. Please click the verification link sent to your email before accessing the dashboard.",
        email,
      });
      return;
    }

    // 2. Enforce admin collection separation from ordinary users
    if (!isAuthorizedAdminEmail(email)) {
      res.status(403).json({
        error: "NOT_AN_ADMIN",
        message: "Access Denied: This Firebase account is an ordinary user account, not an authorized administrator. Only accounts in the 'admins' collection are permitted.",
        email,
      });
      return;
    }

    // Register / update in admin registry
    registerAuthorizedAdmin(uid, email, name || displayName);

    const adminUser: AdminUser = {
      id: uid,
      email,
      name: name || displayName || "Hive Administrator",
      role: "ADMIN",
      emailVerified: true,
    };

    const token = signAdminToken(adminUser);

    // Set secure HttpOnly cookie
    res.cookie(HIVE_ADMIN_COOKIE, token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ADMIN_SESSION_DURATION_MS,
    });

    res.json({
      success: true,
      token,
      admin: adminUser,
    });
  });

  /**
   * GET /api/admin/me
   * Verified on every page load and route guard check.
   */
  app.get("/api/admin/me", (req: Request, res: Response) => {
    const admin = getAdminFromRequest(req);

    if (!admin) {
      res.status(401).json({ authenticated: false, admin: null });
      return;
    }

    res.json({
      authenticated: true,
      admin,
    });
  });

  /**
   * POST /api/admin/logout
   * Clears the server HttpOnly session cookie.
   */
  app.post("/api/admin/logout", (_req: Request, res: Response) => {
    res.clearCookie(HIVE_ADMIN_COOKIE, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    res.json({ success: true });
  });

  /**
   * GET /api/admin/google-script-url
   * Returns currently configured Google Apps Script Web App URL.
   * Protected: requires verified admin session and authorized admin email.
   */
  app.get("/api/admin/google-script-url", (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    res.json({ scriptUrl: getGoogleScriptUrl() });
  });

  /**
   * POST /api/admin/google-script-url
   * Saves updated Google Apps Script Web App URL.
   * Protected: requires verified admin session and authorized admin email.
   */
  app.post("/api/admin/google-script-url", (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    const { scriptUrl } = req.body || {};
    setGoogleScriptUrl(scriptUrl || "");
    res.json({ success: true, scriptUrl: getGoogleScriptUrl() });
  });

  /**
   * Helper: fetches user rows from Google Apps Script Web App using
   * an authenticated server-to-server POST request with the shared secret in the body.
   */
  async function fetchUsersFromAppsScript(
    scriptUrl: string,
    secret: string
  ): Promise<{ status: number; data: any }> {
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "read_users",
        secret,
        sharedSecret: secret,
      }),
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        status: 502,
        data: {
          configured: true,
          error: `Google Apps Script returned status ${response.status} (${response.statusText})`,
          scriptUrl,
          users: [],
        },
      };
    }

    const text = await response.text();
    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        status: 502,
        data: {
          configured: true,
          error: "Google Apps Script returned non-JSON response. Please verify deployment settings.",
          rawResponse: text.slice(0, 300),
          scriptUrl,
          users: [],
        },
      };
    }

    if (parsed.status === "error") {
      const msg = String(parsed.message || "Failed to authenticate with Google Apps Script");
      const needsScriptProperty =
        parsed.code === "SCRIPT_SECRET_NOT_CONFIGURED" ||
        parsed.code === "UNAUTHORIZED_SECRET" ||
        /secret|unauthorized/i.test(msg);
      return {
        status: 403,
        data: {
          configured: true,
          connected: false,
          needsScriptProperty,
          error: msg,
          scriptUrl,
          users: [],
        },
      };
    }

    const users = Array.isArray(parsed.users) ? parsed.users : [];
    return {
      status: 200,
      data: {
        configured: true,
        connected: true,
        needsScriptProperty: false,
        success: true,
        count: users.length,
        users,
        scriptUrl,
      },
    };
  }

  function applyUserSyncCors(req: Request, res: Response, next: NextFunction) {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  }

  app.use("/api/users/sync", applyUserSyncCors);
  app.use("/api/tracking/sync-user", applyUserSyncCors);

  async function listFirebaseAuthUsers(): Promise<UnifiedSyncedUser[]> {
    const authUsers: UnifiedSyncedUser[] = [];
    try {
      let nextPageToken: string | undefined = undefined;
      let pageGuard = 0;
      do {
        const page = await firebaseAdminAuth.listUsers(1000, nextPageToken);
        for (const record of page.users) {
          const primaryProvider =
            (record.providerData && record.providerData[0]?.providerId) || "password";
          const norm = normalizeUnifiedUserRecord(
            {
              uid: record.uid,
              email: record.email || "",
              displayName: record.displayName || "",
              mobile: record.phoneNumber || "",
              photoURL: record.photoURL || null,
              provider: primaryProvider,
              emailVerified: Boolean(record.emailVerified),
              status: record.disabled
                ? "suspended"
                : record.emailVerified
                  ? "Verified"
                  : "Pending Verification",
              registrationDate: record.metadata?.creationTime || "",
              lastSignIn: record.metadata?.lastSignInTime || record.metadata?.creationTime || "",
              updatedAt: record.metadata?.lastRefreshTime || record.metadata?.lastSignInTime || "",
            },
            { defaultUid: record.uid }
          );
          if (norm) authUsers.push(norm);
        }
        nextPageToken = page.pageToken;
        pageGuard++;
      } while (nextPageToken && pageGuard < 50);
    } catch {
      console.warn("[AdminUsers] Firebase Auth listUsers fallback active");
    }
    return authUsers;
  }

  async function collectUnifiedRealUsers(sheetUsers: UnifiedSyncedUser[] = []): Promise<UnifiedSyncedUser[]> {
    let firestoreUsers: UnifiedSyncedUser[] = [];
    if (!isFirestoreQuotaBackoffActive()) {
      try {
        const snap = await firestore.collection("users").get();
        firestoreUsers = snap.docs
          .map((docSnap) =>
            normalizeUnifiedUserRecord(docSnap.data() || {}, { defaultUid: docSnap.id })
          )
          .filter((u): u is UnifiedSyncedUser => Boolean(u));
      } catch (fsErr) {
        noteFirestoreError(fsErr);
        if (!isFirestoreQuotaBackoffActive()) {
          console.warn("[AdminUsers] Firestore users read fallback active");
        }
      }
    }

    const authUsers = await listFirebaseAuthUsers();
    const localUsers = readLocalUsersStore()
      .map((item) => normalizeUnifiedUserRecord(item))
      .filter((u): u is UnifiedSyncedUser => Boolean(u));

    // Merge Firestore profile fields (Display_Name, Mobile, City, BMI) + Firebase Auth + Sheet + Local store
    return mergeUnifiedUsers([firestoreUsers, authUsers, sheetUsers, localUsers]);
  }

  function toSheetStatusLabel(u: UnifiedSyncedUser): string {
    const s = String(u.status || "").toLowerCase();
    if (s === "blocked") return "Blocked";
    if (s === "restricted") return "Restricted";
    if (s === "suspended") return "Suspended";
    if (!u.emailVerified || s.includes("pending")) return "Pending Verification";
    return "Verified";
  }

  function formatUserForSheetPayload(u: UnifiedSyncedUser) {
    const nowIso = new Date().toISOString();
    const regDate = u.registrationDate || u.createdAt || nowIso;
    const lastSignIn = u.lastLogin || u.lastLoginAt || regDate;
    return {
      uid: u.uid,
      Firebase_UID: u.uid,
      email: (u.email || "").trim().toLowerCase(),
      displayName: (u.displayName || u.name || (u.email ? u.email.split("@")[0] : "Athlete")).trim(),
      registrationDate: regDate,
      lastSignIn,
      lastLogin: lastSignIn,
      status: toSheetStatusLabel(u),
      emailVerified: Boolean(u.emailVerified),
      provider: u.provider || "password",
      mobile: u.mobile || "",
    };
  }

  async function runSheetsBackfill(scriptUrl: string, secret: string) {
    const allUsers = await collectUnifiedRealUsers();
    const eligibleUsers = allUsers.filter(
      (u) => Boolean(u.uid) && !u.uid.startsWith("email-")
    );
    const skipped = allUsers.length - eligibleUsers.length;
    const sheetPayloads = eligibleUsers.map(formatUserForSheetPayload);

    if (sheetPayloads.length === 0) {
      return {
        httpStatus: 200,
        body: {
          success: true,
          scanned: allUsers.length,
          synced: 0,
          created: 0,
          updated: 0,
          skipped,
          failed: 0,
          nextCursor: null,
          hasMore: false,
          errors: [],
        },
      };
    }

    // 1. Try single locked batch_upsert_users call first (fast, zero rate-limit issues)
    let fallbackToSequential = false;
    try {
      const batchRes = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "batch_upsert_users",
          secret,
          sharedSecret: secret,
          users: sheetPayloads,
        }),
        redirect: "follow",
      });
      const batchText = await batchRes.text();
      let batchJson: any = null;
      try {
        batchJson = JSON.parse(batchText);
      } catch {
        batchJson = null;
      }

      if (batchRes.ok && batchJson && batchJson.status === "success") {
        for (const u of eligibleUsers) {
          upsertLocalUserStore({ ...u, sheetSynced: true });
        }
        return {
          httpStatus: 200,
          body: {
            success: Number(batchJson.failed || 0) === 0,
            scanned: allUsers.length,
            synced: Number(batchJson.synced ?? sheetPayloads.length),
            created: Number(batchJson.created || 0),
            updated: Number(batchJson.updated || 0),
            skipped: skipped + Number(batchJson.skipped || 0),
            failed: Number(batchJson.failed || 0),
            sheetName: batchJson.sheetName || undefined,
            nextCursor: null,
            hasMore: false,
            errors: Array.isArray(batchJson.errors) ? batchJson.errors.slice(0, 20) : [],
          },
        };
      }

      const errMsg = String(batchJson?.message || batchJson?.error || "");
      const isAuthErr =
        batchJson?.code === "SCRIPT_SECRET_NOT_CONFIGURED" ||
        batchJson?.code === "UNAUTHORIZED_SECRET" ||
        /unauthorized|secret/i.test(errMsg);

      if (isAuthErr) {
        return {
          httpStatus: 403,
          body: {
            success: false,
            needsScriptProperty: true,
            message: errMsg || "Apps Script rejected shared secret. Configure APPS_SCRIPT_SHARED_SECRET in Apps Script Project Settings > Script Properties and redeploy.",
            scanned: allUsers.length,
            synced: 0,
            failed: sheetPayloads.length,
            skipped,
          },
        };
      }

      // Older deployed Code.gs without batch_upsert_users returns "Missing primary key: Firebase UID is required."
      if (/primary key|uid is required/i.test(errMsg)) {
        fallbackToSequential = true;
      } else {
        return {
          httpStatus: 502,
          body: {
            success: false,
            message: errMsg || `Google Apps Script returned HTTP ${batchRes.status}`,
            scanned: allUsers.length,
            synced: 0,
            failed: sheetPayloads.length,
            skipped,
          },
        };
      }
    } catch (err: any) {
      return {
        httpStatus: 502,
        body: {
          success: false,
          message: err?.message || "Failed to reach Google Apps Script Web App.",
          scanned: allUsers.length,
          synced: 0,
          failed: sheetPayloads.length,
          skipped,
        },
      };
    }

    // 2. Sequential upsert_user fallback if deployed Apps Script is on an older version
    let synced = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: Array<{ uid: string; message: string }> = [];

    if (fallbackToSequential) {
      for (let i = 0; i < eligibleUsers.length; i++) {
        const u = eligibleUsers[i];
        const rowPayload = {
          action: "upsert_user",
          secret,
          sharedSecret: secret,
          ...sheetPayloads[i],
        };
        try {
          const response = await fetch(scriptUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rowPayload),
            redirect: "follow",
          });
          const text = await response.text();
          let result: any = {};
          try {
            result = JSON.parse(text);
          } catch {
            throw new Error("Apps Script returned a non-JSON response.");
          }
          if (response.ok && result.status === "success") {
            synced++;
            if (result.action === "updated") updated++;
            else created++;
            upsertLocalUserStore({ ...u, sheetSynced: true });
          } else {
            failed++;
            errors.push({
              uid: u.uid,
              message: String(result.message || result.error || `Apps Script HTTP ${response.status}`),
            });
          }
        } catch (err: any) {
          failed++;
          errors.push({
            uid: u.uid,
            message: err?.message || "Apps Script request failed.",
          });
        }
      }
    }

    return {
      httpStatus: 200,
      body: {
        success: failed === 0,
        scanned: allUsers.length,
        synced,
        created,
        updated,
        skipped,
        failed,
        nextCursor: null,
        hasMore: false,
        errors: errors.slice(0, 20),
      },
    };
  }

  /**
   * GET /api/admin/users
   * Protected: requires verified admin session and authorized admin whitelist check.
   * Fetches live user rows from Google Sheets (via authenticated Apps Script POST)
   * AND reconciles/merges with Firebase Auth (listUsers) + Firestore (firebase-admin)
   * + local server fallback store, deduplicated strictly by Firebase UID.
   */
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;

    const customUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
    const scriptUrl = customUrl || getGoogleScriptUrl();
    const secret = getAppsScriptSecret();

    let sheetUsers: UnifiedSyncedUser[] = [];
    const sheetStatus: {
      configured: boolean;
      connected: boolean;
      scriptUrl: string;
      needsScriptProperty: boolean;
      error: string | null;
      lastSynced: string | null;
    } = {
      configured: Boolean(scriptUrl),
      connected: false,
      scriptUrl,
      needsScriptProperty: false,
      error: null,
      lastSynced: null,
    };

    if (!scriptUrl) {
      sheetStatus.error = "Google Apps Script Web App URL is not configured yet.";
    } else if (!secret) {
      sheetStatus.needsScriptProperty = true;
      sheetStatus.error = "APPS_SCRIPT_SHARED_SECRET / APPS_SCRIPT_SECRET is not configured in backend environment.";
    } else {
      try {
        const result = await fetchUsersFromAppsScript(scriptUrl, secret);
        if (result.status === 200 && Array.isArray(result.data?.users)) {
          sheetUsers = result.data.users
            .map((row: any) => normalizeUnifiedUserRecord(row, { sheetSynced: true }))
            .filter((u: UnifiedSyncedUser | null): u is UnifiedSyncedUser => Boolean(u));
          sheetStatus.connected = true;
          sheetStatus.lastSynced = new Date().toISOString();
        } else {
          sheetStatus.connected = false;
          sheetStatus.needsScriptProperty = Boolean(result.data?.needsScriptProperty);
          sheetStatus.error =
            result.data?.error || "Could not read users from Google Apps Script.";
        }
      } catch (err: any) {
        sheetStatus.connected = false;
        sheetStatus.error = err?.message || "Google Apps Script unreachable.";
      }
    }

    const mergedUsers = (await collectUnifiedRealUsers(sheetUsers)).map((u) => ({
      ...u,
      hiddenInAdmin: isAdminHidden("users", u.uid),
    }));

    // Automatic background reconciliation: silently upsert any real Firestore/Auth users missing from the sheet
    if (sheetStatus.connected && scriptUrl && secret) {
      const sheetUidSet = new Set(sheetUsers.map((u) => u.uid));
      const missingForSheet = mergedUsers.filter(
        (u) => Boolean(u.uid) && !u.uid.startsWith("email-") && !sheetUidSet.has(u.uid)
      );
      if (missingForSheet.length > 0) {
        const missingPayloads = missingForSheet.map(formatUserForSheetPayload);
        void syncRecordToGoogleSheet(
          "batch_upsert_users",
          { users: missingPayloads },
          { scriptUrl, secret, retries: 1 }
        ).then((syncRes) => {
          if (syncRes.ok) {
            for (const u of missingForSheet) {
              upsertLocalUserStore({ ...u, sheetSynced: true });
            }
          }
        });
      }
    }

    res.json({
      success: true,
      count: mergedUsers.length,
      users: mergedUsers,
      sheetStatus,
    });
  });

  /**
   * DELETE /api/admin/users/:uid
   * Admin-only soft-hide: hides a user row from the Admin Panel view WITHOUT deleting
   * the user from Firebase Auth, Firestore, or Google Sheets.
   */
  app.delete("/api/admin/users/:uid", (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;
    const uid = String(req.params.uid || "").trim();
    if (!uid) {
      res.status(400).json({ error: "User UID is required" });
      return;
    }
    markAdminHidden("users", uid);
    res.json({ success: true, uid, hiddenInAdmin: true, deleted: true });
  });

  // Local fallback warnings store (paired with Firestore users/{uid}/notifications)
  const LOCAL_WARNINGS_FILE = path.resolve(import.meta.dirname, "user_warnings_store.json");
  const readLocalWarnings = (): Record<string, any[]> => {
    try {
      if (fs.existsSync(LOCAL_WARNINGS_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(LOCAL_WARNINGS_FILE, "utf-8"));
        return parsed && typeof parsed === "object" ? parsed : {};
      }
    } catch { }
    return {};
  };
  const writeLocalWarnings = (map: Record<string, any[]>) => {
    try {
      fs.writeFileSync(LOCAL_WARNINGS_FILE, JSON.stringify(map, null, 2), "utf-8");
    } catch { }
  };

  /**
   * POST /api/admin/users/:uid/restrict
   * Sends a warning notification directly to the user's Firestore notifications subcollection
   * and updates the user's status to "Restricted" in Firestore, local store, and Google Sheets.
   */
  app.post("/api/admin/users/:uid/restrict", async (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res);
    if (!admin) return;

    const uid = String(req.params.uid || "").trim();
    if (!uid) {
      res.status(400).json({ error: "User UID is required." });
      return;
    }
    const warningMessage =
      String(req.body?.warningMessage || req.body?.message || "").trim() ||
      "Don't do unwanted activity";
    const nowIso = new Date().toISOString();
    const warningDoc = {
      id: `WARN-${Date.now()}`,
      type: "restriction_warning",
      title: "Account Warning · Restricted",
      message: warningMessage,
      sentBy: admin.email,
      read: false,
      createdAt: nowIso,
    };

    // 1. Write warning notification + "Restricted" status to Firestore
    if (!isFirestoreQuotaBackoffActive()) {
      try {
        await firestore.collection("users").doc(uid).collection("notifications").doc(warningDoc.id).set({
          ...warningDoc,
          createdAt: FieldValue.serverTimestamp(),
        });
        await firestore.collection("users").doc(uid).set(
          {
            status: "Restricted",
            restricted: true,
            lastWarning: warningMessage,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        noteFirestoreError(err);
      }
    }

    // 2. Mirror warning + status to local stores
    const warningsMap = readLocalWarnings();
    warningsMap[uid] = [warningDoc, ...(warningsMap[uid] || [])];
    writeLocalWarnings(warningsMap);

    const allUsers = await collectUnifiedRealUsers();
    const existing = allUsers.find((u) => u.uid === uid);
    const updatedUser: UnifiedSyncedUser = existing
      ? { ...existing, status: "Restricted", updatedAt: nowIso }
      : {
          uid,
          email: String(req.body?.email || "").trim().toLowerCase(),
          displayName: String(req.body?.displayName || "Athlete").trim(),
          name: String(req.body?.displayName || "Athlete").trim(),
          username: "",
          mobile: String(req.body?.mobile || "").trim(),
          city: "",
          bio: "",
          photoURL: null,
          provider: "password",
          role: "USER",
          emailVerified: true,
          status: "Restricted",
          registrationDate: nowIso,
          createdAt: nowIso,
          lastLogin: nowIso,
          lastLoginAt: nowIso,
          updatedAt: nowIso,
          runsCount: 0,
          postsCount: 0,
          followersCount: 0,
          followingCount: 0,
          isPrivate: false,
          discoverable: true,
          sheetSynced: false,
        };
    upsertLocalUserStore(updatedUser);

    // 3. Sync Restricted status to Google Sheets
    const sheetRes = await syncRecordToGoogleSheet(
      "upsert_user",
      formatUserForSheetPayload(updatedUser),
      { retries: 1 }
    );

    res.json({
      success: true,
      uid,
      status: "Restricted",
      warning: warningDoc,
      sheetSynced: sheetRes.ok,
    });
  });

  /**
   * POST /api/admin/users/:uid/block
   * Sets user status to "Blocked" (or "Verified" when unblocking) in Firestore & Google Sheets,
   * and immediately revokes active Firebase Auth sessions + disables login when blocked.
   */
  app.post("/api/admin/users/:uid/block", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;

    const uid = String(req.params.uid || "").trim();
    if (!uid) {
      res.status(400).json({ error: "User UID is required." });
      return;
    }
    const shouldBlock = req.body?.blocked !== false;
    const nextStatus = shouldBlock ? "Blocked" : "Verified";
    const nowIso = new Date().toISOString();

    // 1. Update Firestore status
    if (!isFirestoreQuotaBackoffActive()) {
      try {
        await firestore.collection("users").doc(uid).set(
          {
            status: nextStatus,
            blocked: shouldBlock,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        noteFirestoreError(err);
      }
    }

    // 2. Revoke active Firebase Auth refresh tokens & toggle Auth disabled state
    try {
      if (shouldBlock) {
        await firebaseAdminAuth.revokeRefreshTokens(uid);
      }
      await firebaseAdminAuth.updateUser(uid, { disabled: shouldBlock });
    } catch (authErr) {
      console.warn("[AdminUsers] Firebase Auth block/unblock note:", authErr);
    }

    // 3. Update local store & sync to Google Sheets
    const allUsers = await collectUnifiedRealUsers();
    const existing = allUsers.find((u) => u.uid === uid);
    const updatedUser: UnifiedSyncedUser = existing
      ? { ...existing, status: nextStatus, updatedAt: nowIso }
      : {
          uid,
          email: String(req.body?.email || "").trim().toLowerCase(),
          displayName: String(req.body?.displayName || "Athlete").trim(),
          name: String(req.body?.displayName || "Athlete").trim(),
          username: "",
          mobile: String(req.body?.mobile || "").trim(),
          city: "",
          bio: "",
          photoURL: null,
          provider: "password",
          role: "USER",
          emailVerified: true,
          status: nextStatus,
          registrationDate: nowIso,
          createdAt: nowIso,
          lastLogin: nowIso,
          lastLoginAt: nowIso,
          updatedAt: nowIso,
          runsCount: 0,
          postsCount: 0,
          followersCount: 0,
          followingCount: 0,
          isPrivate: false,
          discoverable: true,
          sheetSynced: false,
        };
    upsertLocalUserStore(updatedUser);

    const sheetRes = await syncRecordToGoogleSheet(
      "upsert_user",
      formatUserForSheetPayload(updatedUser),
      { retries: 1 }
    );

    res.json({
      success: true,
      uid,
      blocked: shouldBlock,
      status: nextStatus,
      sheetSynced: sheetRes.ok,
    });
  });

  // CORS-enabled user access status & admin warnings endpoint for the User Site
  app.use("/api/users/:uid/access-status", applyUserSyncCors);
  app.get("/api/users/:uid/access-status", async (req: Request, res: Response) => {
    const uid = String(req.params.uid || "").trim();
    if (!uid) {
      res.status(400).json({ error: "UID is required." });
      return;
    }
    let status = "Verified";
    let blocked = false;
    let warnings: any[] = [];

    if (!isFirestoreQuotaBackoffActive()) {
      try {
        const snap = await firestore.collection("users").doc(uid).get();
        if (snap.exists) {
          const d = snap.data() || {};
          status = String(d.status || "Verified");
          blocked = Boolean(d.blocked) || status.toLowerCase() === "blocked";
        }
        const wSnap = await firestore.collection("users").doc(uid).collection("notifications").get();
        wSnap.forEach((docSnap) => {
          warnings.push({ id: docSnap.id, ...(docSnap.data() || {}) });
        });
      } catch (err) {
        noteFirestoreError(err);
      }
    }

    const localUser = readLocalUsersStore().find((u) => u.uid === uid);
    if (localUser) {
      if (String(localUser.status || "").toLowerCase() === "blocked") {
        status = "Blocked";
        blocked = true;
      } else if (status === "Verified" && localUser.status) {
        status = localUser.status;
      }
    }

    const localWarns = readLocalWarnings()[uid] || [];
    const seen = new Set(warnings.map((w) => w.id));
    for (const lw of localWarns) {
      if (!seen.has(lw.id)) warnings.push(lw);
    }

    res.json({
      success: true,
      uid,
      status,
      blocked,
      restricted: status.toLowerCase() === "restricted",
      warnings,
    });
  });

  /**
   * POST /api/admin/sheets/backfill
   * Protected: requires verified admin session and authorized admin whitelist check.
   * Fetches all existing real users from Firebase Auth (listUsers) merged with Firestore
   * and local profile fields, and upserts them into Google Sheets via APPS_SCRIPT_WEB_APP_URL.
   */
  app.post("/api/admin/sheets/backfill", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;

    const customUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const scriptUrl = customUrl || getGoogleScriptUrl();
    const secret = getAppsScriptSecret();

    if (!scriptUrl) {
      res.status(400).json({
        success: false,
        message: "Google Apps Script Web App URL (APPS_SCRIPT_WEB_APP_URL) is not configured yet.",
      });
      return;
    }

    if (!secret) {
      res.status(500).json({
        success: false,
        needsScriptProperty: true,
        message: "APPS_SCRIPT_SHARED_SECRET / APPS_SCRIPT_SECRET is not configured in backend environment.",
      });
      return;
    }

    try {
      const result = await runSheetsBackfill(scriptUrl, secret);
      if (result.httpStatus === 200) {
        const [{ backfillSponsorsToGoogleSheet }, { backfillBookingsToGoogleSheet }] = await Promise.all([
          import("./sponsorsRoutes"),
          import("./eventsRoutes"),
        ]);
        const [sponsorsBackfill, bookingsBackfill] = await Promise.all([
          backfillSponsorsToGoogleSheet(),
          backfillBookingsToGoogleSheet(),
        ]);
        res.status(result.httpStatus).json({
          ...result.body,
          sponsorsBackfill,
          bookingsBackfill,
        });
        return;
      }
      res.status(result.httpStatus).json(result.body);
    } catch (error: any) {
      console.error("[SheetsBackfill] Error:", error?.message || "Internal error");
      res.status(500).json({
        success: false,
        message: "Google Sheets backfill failed.",
      });
    }
  });

  /**
   * GET /api/admin/google-sheet-users
   * Protected: requires verified admin session and authorized admin email.
   * Queries Google Apps Script via authenticated server-to-server POST.
   */
  app.get("/api/admin/google-sheet-users", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;

    const customUrl = (req.query.url as string) || "";
    const scriptUrl = customUrl ? customUrl.trim() : getGoogleScriptUrl();

    if (!scriptUrl) {
      res.json({
        configured: false,
        message: "No Google Apps Script Web App URL configured yet.",
        users: [],
      });
      return;
    }

    const secret = getAppsScriptSecret();
    if (!secret) {
      res.status(500).json({
        configured: true,
        error: "Server APPS_SCRIPT_SECRET is not configured in backend environment.",
        scriptUrl,
        users: [],
      });
      return;
    }

    try {
      const result = await fetchUsersFromAppsScript(scriptUrl, secret);
      res.status(result.status).json(result.data);
    } catch (err: any) {
      console.error("[GoogleSheetProxy] Error fetching sheet users:", err?.message || "Internal error");
      res.status(500).json({
        configured: true,
        error: err?.message || "Failed to fetch from Google Apps Script Web App",
        scriptUrl,
        users: [],
      });
    }
  });

  /**
   * POST /api/admin/google-sheet-users
   * Protected: requires verified admin session and authorized admin email.
   * Supports manual sync trigger / URL test from Admin Portal.
   */
  app.post("/api/admin/google-sheet-users", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;

    const { url } = req.body || {};
    const scriptUrl = url ? String(url).trim() : getGoogleScriptUrl();

    if (!scriptUrl) {
      res.json({
        configured: false,
        message: "No Google Apps Script Web App URL configured yet.",
        users: [],
      });
      return;
    }

    const secret = getAppsScriptSecret();
    if (!secret) {
      res.status(500).json({
        configured: true,
        error: "Server APPS_SCRIPT_SHARED_SECRET / APPS_SCRIPT_SECRET is not configured in backend environment.",
        scriptUrl,
        users: [],
      });
      return;
    }

    try {
      const result = await fetchUsersFromAppsScript(scriptUrl, secret);
      res.status(result.status).json(result.data);
    } catch (err: any) {
      console.error("[GoogleSheetProxy] Error fetching sheet users:", err?.message || "Internal error");
      res.status(500).json({
        configured: true,
        error: err?.message || "Failed to fetch from Google Apps Script Web App",
        scriptUrl,
        users: [],
      });
    }
  });

  /**
   * POST /api/admin/firestore-sync
   * Backwards-compatible alias delegating to the unified Firebase Auth + Firestore + Local
   * Google Sheets backfill routine.
   */
  app.post("/api/admin/firestore-sync", async (req: Request, res: Response) => {
    if (!requireAdminSession(req, res)) return;

    const scriptUrl = getGoogleScriptUrl();
    const secret = getAppsScriptSecret();

    if (!scriptUrl || !secret) {
      res.status(500).json({
        success: false,
        needsScriptProperty: !secret,
        message: "Google Apps Script configuration is missing.",
      });
      return;
    }

    try {
      const result = await runSheetsBackfill(scriptUrl, secret);
      if (result.httpStatus === 200) {
        const [{ backfillSponsorsToGoogleSheet }, { backfillBookingsToGoogleSheet }] = await Promise.all([
          import("./sponsorsRoutes"),
          import("./eventsRoutes"),
        ]);
        const [sponsorsBackfill, bookingsBackfill] = await Promise.all([
          backfillSponsorsToGoogleSheet(),
          backfillBookingsToGoogleSheet(),
        ]);
        res.status(result.httpStatus).json({
          ...result.body,
          sponsorsBackfill,
          bookingsBackfill,
        });
        return;
      }
      res.status(result.httpStatus).json(result.body);
    } catch (error: any) {
      console.error("[FirestoreSync] Error:", error?.message || "Internal error");
      res.status(500).json({
        success: false,
        message: "User synchronization to Google Sheets failed.",
      });
    }
  });
  /**
   * Unified user synchronization handler mounted at BOTH:
   * - POST /api/users/sync
   * - POST /api/tracking/sync-user
   *
   * Security architecture:
   * 1. Extracts Firebase ID token from Authorization: Bearer <token> or req.body.idToken.
   * 2. Verifies ID token server-side with Google Identity Toolkit (never trusting client UID/email).
   * 3. Persists verified user record to Firestore (firebase-admin) + local fallback store so zero
   *    signups/logins/profile updates are ever lost.
   * 4. Forwards the verified 9-column payload to Google Apps Script with the backend shared secret
   *    and handles HTTP 302 redirects cleanly.
   */
  async function handleUserSync(req: Request, res: Response) {
    const body = req.body || {};
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
    const idToken = bearerToken || (typeof body.idToken === "string" ? body.idToken.trim() : "");

    if (!idToken) {
      res.status(400).json({
        error: "MISSING_TOKEN",
        message: "Firebase ID token is required for user synchronization.",
      });
      return;
    }

    // 1. Verify token server-side with Google Identity Toolkit
    const verifiedUser = await verifyFirebaseIdToken(idToken);
    if (!verifiedUser) {
      res.status(401).json({
        error: "INVALID_TOKEN",
        message: "Invalid or expired Firebase ID token.",
      });
      return;
    }

    // 2. Strict identity derivation from verified token (NEVER trust client UID/email)
    const verifiedUid = verifiedUser.uid;
    const verifiedEmail = verifiedUser.email.trim().toLowerCase();
    const isEmailVerified = verifiedUser.emailVerified;

    if (!verifiedUid || !verifiedEmail) {
      res.status(401).json({
        error: "UNVERIFIED_IDENTITY",
        message: "Could not derive verified UID or email from token.",
      });
      return;
    }

    // 3. Status determination: Verified requires emailVerified === true
    let derivedStatus = "Verified";
    if (body.status === "Pending Verification" || !isEmailVerified) {
      derivedStatus = "Pending Verification";
    }

    const rawName = typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim()
      : typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : verifiedUser.displayName;
    const cleanDisplayName = String(rawName || "Athlete").trim().slice(0, 100);
    const cleanMobile = String(body.mobile || body.phone || "").trim().slice(0, 20);
    const cleanCity = typeof body.city === "string" ? body.city.trim().slice(0, 80) : "";
    const cleanBio = typeof body.bio === "string" ? body.bio.trim().slice(0, 300) : "";
    const cleanUsername = typeof body.username === "string" ? body.username.trim().slice(0, 40) : "";
    const cleanProvider = typeof body.provider === "string" && body.provider.trim()
      ? body.provider.trim().slice(0, 30)
      : "password";
    const bmiVal = typeof body.bmi === "number" && Number.isFinite(body.bmi) ? Number(body.bmi) : undefined;
    const bmiCat = typeof body.bmiCategory === "string" ? body.bmiCategory.trim().slice(0, 30) : undefined;
    const calTarget =
      typeof body.dailyCalorieTarget === "number" && Number.isFinite(body.dailyCalorieTarget)
        ? Math.round(body.dailyCalorieTarget)
        : undefined;

    const nowIso = new Date().toISOString();
    let cleanRegDate =
      typeof body.registrationDate === "string" && !isNaN(new Date(body.registrationDate).getTime())
        ? new Date(body.registrationDate).toISOString()
        : nowIso;

    // 4. Persist verified user record to Firestore (firebase-admin) preserving original createdAt
    let existingMobile = "";
    if (!isFirestoreQuotaBackoffActive()) {
      try {
        const userRef = firestore.collection("users").doc(verifiedUid);
        const existingSnap = await userRef.get();
        const existingData = existingSnap.exists ? (existingSnap.data() || {}) : {};
        const existingCreatedIso = toIsoSafe(existingData.createdAt || existingData.registrationDate);
        if (existingCreatedIso) cleanRegDate = existingCreatedIso;
        if (typeof existingData.mobile === "string" && existingData.mobile.trim()) {
          existingMobile = existingData.mobile.trim();
        }

        const firestoreUpdate: Record<string, any> = {
          uid: verifiedUid,
          email: verifiedEmail,
          name: cleanDisplayName || existingData.name || "Athlete",
          displayName: cleanDisplayName || existingData.displayName || "Athlete",
          provider: cleanProvider || existingData.provider || "password",
          emailVerified: isEmailVerified,
          status: existingData.status === "suspended" ? "suspended" : derivedStatus,
          lastLogin: nowIso,
          lastLoginAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (!existingSnap.exists) {
          firestoreUpdate.createdAt = cleanRegDate;
          firestoreUpdate.registrationDate = cleanRegDate;
        }
        if (cleanMobile) firestoreUpdate.mobile = cleanMobile;
        if (cleanCity) firestoreUpdate.city = cleanCity;
        if (cleanBio) firestoreUpdate.bio = cleanBio;
        if (cleanUsername) firestoreUpdate.username = cleanUsername;
        if (bmiVal !== undefined) firestoreUpdate.bmi = bmiVal;
        if (bmiCat) firestoreUpdate.bmiCategory = bmiCat;
        if (calTarget !== undefined) firestoreUpdate.dailyCalorieTarget = calTarget;

        await userRef.set(firestoreUpdate, { merge: true });
      } catch (fsErr) {
        noteFirestoreError(fsErr);
        if (!isFirestoreQuotaBackoffActive()) {
          console.warn("[UserSync] Firestore persistence fallback active");
        }
      }
    }

    const effectiveMobile = cleanMobile || existingMobile;

    // 5. Persist verified record into local server fallback store
    const localRecord = normalizeUnifiedUserRecord({
      uid: verifiedUid,
      email: verifiedEmail,
      displayName: cleanDisplayName,
      name: cleanDisplayName,
      username: cleanUsername || verifiedEmail.split("@")[0],
      mobile: effectiveMobile,
      city: cleanCity,
      bio: cleanBio,
      provider: cleanProvider,
      emailVerified: isEmailVerified,
      status: derivedStatus,
      bmi: bmiVal,
      bmiCategory: bmiCat,
      dailyCalorieTarget: calTarget,
      registrationDate: cleanRegDate,
      createdAt: cleanRegDate,
      lastLogin: nowIso,
      updatedAt: nowIso,
      sheetSynced: false,
    });
    if (localRecord) {
      upsertLocalUserStore(localRecord);
    }

    // 6. Forward verified 9-column payload to Google Apps Script (handling HTTP 302 redirects cleanly)
    const scriptUrl = getGoogleScriptUrl();
    const secret = getAppsScriptSecret();

    if (!scriptUrl || !secret) {
      res.json({
        success: true,
        persisted: true,
        synced: false,
        sheetSynced: false,
        message: "User saved to Hivecity store; Google Apps Script URL or secret is pending configuration.",
        uid: verifiedUid,
      });
      return;
    }

    try {
      const payload = {
        action: "upsert_user",
        secret,
        sharedSecret: secret,
        uid: verifiedUid,
        Firebase_UID: verifiedUid,
        email: verifiedEmail,
        displayName: cleanDisplayName || "Athlete",
        registrationDate: cleanRegDate,
        lastSignIn: nowIso,
        lastLogin: nowIso,
        status: derivedStatus,
        emailVerified: isEmailVerified,
        provider: cleanProvider,
        mobile: effectiveMobile,
      };

      const response = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "follow",
      });

      const text = await response.text();
      let result: any = {};
      try {
        result = JSON.parse(text);
      } catch {
        result = { status: "error", message: "Apps Script returned non-JSON response." };
      }

      const sheetOk = response.ok && result.status === "success";
      if (sheetOk && localRecord) {
        upsertLocalUserStore({ ...localRecord, sheetSynced: true });
      }

      if (!sheetOk) {
        console.warn("[UserSync] Apps Script sync did not succeed (HTTP " + response.status + ")");
      }

      res.json({
        success: true,
        persisted: true,
        synced: sheetOk,
        sheetSynced: sheetOk,
        sheetError: sheetOk ? undefined : String(result.message || `Apps Script HTTP ${response.status}`),
        action: result.action || (sheetOk ? "upserted" : "stored_locally"),
        uid: verifiedUid,
      });
    } catch (err: any) {
      console.error("[UserSync] Error forwarding user tracking:", err?.message || "Internal error");
      res.json({
        success: true,
        persisted: true,
        synced: false,
        sheetSynced: false,
        sheetError: err?.message || "Google Apps Script unreachable",
        uid: verifiedUid,
      });
    }
  }

  app.post("/api/users/sync", handleUserSync);
  app.post("/api/tracking/sync-user", handleUserSync);
}
