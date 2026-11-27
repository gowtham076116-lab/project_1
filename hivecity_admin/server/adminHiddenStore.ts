import fs from "node:fs";
import path from "node:path";

export type AdminHiddenCategory = "events" | "nutrients" | "marketplace" | "users" | "bookings" | "sponsors" | "campaigns";

export interface AdminHiddenStore {
  events: string[];
  nutrients: string[];
  marketplace: string[];
  users: string[];
  bookings: string[];
  sponsors: string[];
  campaigns: string[];
}

const ADMIN_HIDDEN_FILE = path.resolve(import.meta.dirname, "admin_hidden_store.json");

function emptyStore(): AdminHiddenStore {
  return { events: [], nutrients: [], marketplace: [], users: [], bookings: [], sponsors: [], campaigns: [] };
}

export function readAdminHiddenStore(): AdminHiddenStore {
  try {
    if (fs.existsSync(ADMIN_HIDDEN_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ADMIN_HIDDEN_FILE, "utf-8"));
      return {
        events: Array.isArray(parsed?.events) ? parsed.events.map(String) : [],
        nutrients: Array.isArray(parsed?.nutrients) ? parsed.nutrients.map(String) : [],
        marketplace: Array.isArray(parsed?.marketplace) ? parsed.marketplace.map(String) : [],
        users: Array.isArray(parsed?.users) ? parsed.users.map(String) : [],
        bookings: Array.isArray(parsed?.bookings) ? parsed.bookings.map(String) : [],
        sponsors: Array.isArray(parsed?.sponsors) ? parsed.sponsors.map(String) : [],
        campaigns: Array.isArray(parsed?.campaigns) ? parsed.campaigns.map(String) : [],
      };
    }
  } catch { }
  return emptyStore();
}

function writeAdminHiddenStore(store: AdminHiddenStore): void {
  try {
    fs.writeFileSync(ADMIN_HIDDEN_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("[AdminHiddenStore] Could not write hidden store:", err);
  }
}

export function isAdminHidden(category: AdminHiddenCategory, id: string): boolean {
  const clean = String(id || "").trim();
  if (!clean) return false;
  const store = readAdminHiddenStore();
  return store[category].includes(clean);
}

export function markAdminHidden(category: AdminHiddenCategory, id: string): AdminHiddenStore {
  const clean = String(id || "").trim();
  const store = readAdminHiddenStore();
  if (clean && !store[category].includes(clean)) {
    store[category].unshift(clean);
    writeAdminHiddenStore(store);
  }
  return store;
}

export function unmarkAdminHidden(category: AdminHiddenCategory, id: string): AdminHiddenStore {
  const clean = String(id || "").trim();
  const store = readAdminHiddenStore();
  if (clean && store[category].includes(clean)) {
    store[category] = store[category].filter((item) => item !== clean);
    writeAdminHiddenStore(store);
  }
  return store;
}
