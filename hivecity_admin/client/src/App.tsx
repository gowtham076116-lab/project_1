import { useMemo, useState, useEffect, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  ClipboardList,
  Command,
  Compass,
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  FileClock,
  FileSpreadsheet,
  Filter,
  Gamepad2,
  Hexagon,
  Image,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  ListFilter,
  LockKeyhole,
  LogOut,
  Mail,
  Map,
  MapPin,
  Menu,
  MessageSquareWarning,
  Moon,
  MoreHorizontal,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Sun,
  Ticket,
  Trash2,
  Trophy,
  UserCheck,
  Users,
  UserX,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { CommunitySessionsAdmin } from "./components/CommunitySessionsAdmin";
import { CampaignStudioAdmin } from "./components/CampaignStudioAdmin";
import { NotificationsDeliveryAdmin } from "./components/NotificationsDeliveryAdmin";
import { SupportCentreAdmin } from "./components/SupportCentreAdmin";
import { AdminUsersRolesView } from "./components/AdminUsersRolesView";
import { SettingsAdminView } from "./components/SettingsAdminView";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import {
  AdminAuthProvider,
  useAdminAuth,
  type AdminUser,
  type AdminRole,
} from "./contexts/AdminAuthContext";
import AdminLogin from "./pages/AdminLogin";
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, updateDoc, serverTimestamp, where } from "firebase/firestore";
import { db } from "./lib/firebase";
import {
  resolveEventStatus,
  formatEventFee,
  parseFeeNumber,
  normalizeBookingUrl,
  formatEventSchedule,
  SHARED_EVENTS_STORAGE_KEY,
  SHARED_BOOKINGS_STORAGE_KEY,
  EVENTS_UPDATED_EVENT,
  type HiveEventStatus,
  type EventBookingRecord,
} from "./utils/eventLifecycle";
import {
  getAllEvents,
  syncLocalEventsToServer,
  saveEventToServer,
  markEventCompletedOnServer,
  deleteEventOnServer,
  deleteEventBookingsInAdminOnServer,
  fetchAllBookingsFromServer,
  normalizeUnifiedEvent,
} from "./lib/eventsStore";
import {
  getAllNutrients,
  createNutrientOnServer,
  deleteNutrientOnServer,
  writeCachedLocalNutrients,
  normalizeUnifiedNutrient,
  NUTRIENTS_UPDATED_EVENT,
  SHARED_NUTRIENTS_STORAGE_KEY,
  getAllMarketplaceProducts,
  getAllMarketplaceOrders,
  createMarketplaceProductOnServer,
  deleteMarketplaceProductOnServer,
  writeCachedLocalMarketplaceProducts,
  normalizeUnifiedProduct,
  MARKETPLACE_UPDATED_EVENT,
  SHARED_MARKETPLACE_STORAGE_KEY,
  type UnifiedNutrientRecipe,
  type UnifiedMarketplaceProduct,
} from "./lib/contentStore";
import {
  EventsHostingStudio,
  type StudioTab,
  type CreateEventFormPayload,
  type CreateNutrientFormPayload,
  type CreateProductFormPayload,
} from "./components/EventsHostingStudio";
import type { LucideIcon } from "lucide-react";

// Types for data models directly reflecting shared Firebase Firestore schemas
export interface UserRecord {
  id: string; // Firebase Auth UID
  uid: string;
  name: string;
  username?: string;
  email: string;
  mobile?: string | null;
  photoURL?: string | null;
  provider?: string;
  bio?: string;
  isPrivate?: boolean;
  discoverable?: boolean;
  status: "active" | "suspended" | string;
  activity: string; // engagement summary or latest action
  joined: string; // formatted date (e.g. "Nov 24, 2026")
  createdAt?: any;
  updatedAt?: any;
  lastLogin?: string; // formatted date or time
  lastLoginAt?: any;
  runsCount?: number;
  postsCount?: number;
  followersCount?: number;
  followingCount?: number;
  city?: string;
  role?: string;
  emailVerified?: boolean;
  bmi?: number;
  bmiCategory?: string;
  dailyCalorieTarget?: number;
  profileSuggestions?: Array<{
    id?: string;
    field?: string;
    suggestedValue?: string;
    currentValue?: string;
    note?: string;
    status?: "pending" | "approved" | "rejected";
    createdAt?: any;
  }> | any;
  accent?: string;
  sheetSynced?: boolean;
}

export interface EventRecord {
  id?: string;
  name: string;
  title?: string;
  description?: string;
  location?: string;
  type: string;
  date: string;
  eventDate?: string;
  endDate?: string;
  bookings: string;
  bookingsCount?: number;
  capacity?: number;
  status: HiveEventStatus | string;
  completed?: boolean;
  feeAmount?: number;
  termsAndConditions?: string;
  bookingUrl?: string;
  imageUrl?: string;
  revenue: string;
}

export interface OrderRecord {
  id: string;
  customer: string;
  item: string;
  amount: string;
  status: string;
  time: string;
}

export interface ActivityItem {
  id?: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  time: string;
  tone: string;
}

export interface ChartPoint {
  name: string;
  users?: number;
  sessions?: number;
  tickets?: number;
  market?: number;
}

const navGroups: { label: string; items: { label: string; path: string; icon: LucideIcon; badge?: string }[] }[] = [
  { label: "Overview", items: [{ label: "Dashboard", path: "/", icon: LayoutDashboard }] },
  {
    label: "People & Community",
    items: [
      { label: "Users", path: "/users", icon: Users },
      { label: "Communities", path: "/communities", icon: MessageSquareWarning },
    ],
  },
  {
    label: "Activities",
    items: [
      { label: "Events", path: "/events", icon: CalendarDays },
      { label: "Events Hosting Studio", path: "/event-hosting", icon: ClipboardList },
      { label: "Ticketing & Bookings", path: "/bookings", icon: Ticket },
      { label: "Hive Calendar", path: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Health & Content",
    items: [
      { label: "Nutrition Studio", path: "/nutrition", icon: Compass },
      { label: "Recipes & Meal Plans", path: "/recipes", icon: ClipboardList },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Marketplace", path: "/marketplace", icon: ShoppingBag },
      { label: "Products", path: "/products", icon: Package },
      { label: "Sponsors", path: "/sponsors", icon: Trophy },
    ],
  },
  { label: "Entertainment", items: [{ label: "HIVE PLAY", path: "/hive-play", icon: Gamepad2 }] },
  {
    label: "Marketing",
    items: [
      { label: "Campaign Studio", path: "/campaigns", icon: Send },
      { label: "Notifications", path: "/notifications", icon: Bell },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Support Centre", path: "/support", icon: LifeBuoy },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Admin Users & Roles", path: "/admins", icon: LockKeyhole },
      { label: "Settings", path: "/settings", icon: Settings2 },
    ],
  },
];

const REMOVED_ADMIN_PATHS = new Set([
  "/running-analytics",
  "/moderation",
  "/orders",
  "/revenue",
  "/media",
  "/insights",
  "/audit-logs",
]);

const pageMeta: Record<string, { eyebrow: string; title: string; description: string }> = {
  "/users": { eyebrow: "People / directory", title: "Users", description: "Understand who is moving through the Hive City ecosystem." },
  "/communities": { eyebrow: "People / belonging", title: "Communities", description: "Track the groups giving the city its pulse." },
  "/events": { eyebrow: "Activities / showcase", title: "Events", description: "Showcase of all hosted Hive City events, bookings, and lifecycle controls." },
  "/event-hosting": { eyebrow: "Activities / studio", title: "Events Hosting Studio", description: "Central creation studio for Events and Nutrient Recipes & Meal Plans." },
  "/bookings": { eyebrow: "Activities / attendance", title: "Ticketing & bookings", description: "Keep every ticket, booking and check-in accounted for." },
  "/calendar": { eyebrow: "Activities / planning", title: "Hive calendar", description: "One operational timeline for events, campaigns and content." },
  "/nutrition": { eyebrow: "Health / showcase", title: "Nutrition studio", description: "Showcase of all Admin-hosted recipes & nutrition items." },
  "/recipes": { eyebrow: "Health / showcase", title: "Recipes & meal plans", description: "Showcase of all User-created recipes & meal plans." },
  "/marketplace": { eyebrow: "Commerce / showcase", title: "Marketplace", description: "Showcase of all shop products published for Hive City users." },
  "/products": { eyebrow: "Commerce / showcase", title: "Products", description: "Showcase of all shop products published for Hive City users." },
  "/sponsors": { eyebrow: "Commerce / partners", title: "Sponsors", description: "See who is helping make every city run possible." },
  "/hive-play": { eyebrow: "Entertainment / live operations", title: "HIVE PLAY", description: "Monitor the city adventure network in real time." },
  "/campaigns": { eyebrow: "Marketing / orchestration", title: "Campaign studio", description: "Coordinate the message without losing the signal." },
  "/notifications": { eyebrow: "Marketing / delivery", title: "Notifications", description: "Review announcements, sends and delivery health." },
  "/support": { eyebrow: "Operations / care", title: "Support centre", description: "Keep member questions moving to the right person." },
  "/admins": { eyebrow: "Administration / access", title: "Admin users & roles", description: "Keep sensitive operations permissioned and accountable." },
  "/settings": { eyebrow: "Administration / control", title: "Settings", description: "Tune the operating environment for your team." },
};

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <AdminAuthProvider>
          <TooltipProvider>
            <Toaster position="bottom-right" richColors />
            <Portal />
          </TooltipProvider>
        </AdminAuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function Portal() {
  const { admin, loading, logout, hasPermission, getRoleLabel } = useAdminAuth();
  const [location, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [sponsorModalOpen, setSponsorModalOpen] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [sponsorsList, setSponsorsList] = useState<SponsorRecord[]>([]);
  const [sponsorsLoading, setSponsorsLoading] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>("event");
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [eventBookings, setEventBookings] = useState<EventBookingRecord[]>([]);
  const [nutrientsList, setNutrientsList] = useState<UnifiedNutrientRecipe[]>([]);
  const [marketplaceProducts, setMarketplaceProducts] = useState<UnifiedMarketplaceProduct[]>([]);
  const [adminHiddenIds, setAdminHiddenIds] = useState<{
    events: string[];
    nutrients: string[];
    marketplace: string[];
    users: string[];
    bookings: string[];
  }>(() => {
    try {
      const raw = localStorage.getItem("hivecity_admin_deleted_ids");
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        events: Array.isArray(parsed?.events) ? parsed.events.map(String) : [],
        nutrients: Array.isArray(parsed?.nutrients) ? parsed.nutrients.map(String) : [],
        marketplace: Array.isArray(parsed?.marketplace) ? parsed.marketplace.map(String) : [],
        users: Array.isArray(parsed?.users) ? parsed.users.map(String) : [],
        bookings: Array.isArray(parsed?.bookings) ? parsed.bookings.map(String) : [],
      };
    } catch {
      return { events: [], nutrients: [], marketplace: [], users: [], bookings: [] };
    }
  });

  const markHiddenInAdminOnly = useCallback(
    (category: "events" | "nutrients" | "marketplace" | "users" | "bookings", id: string) => {
      const cleanId = String(id || "").trim();
      if (!cleanId) return;
      setAdminHiddenIds((prev) => {
        if (prev[category].includes(cleanId)) return prev;
        const next = { ...prev, [category]: [cleanId, ...prev[category]] };
        try {
          localStorage.setItem("hivecity_admin_deleted_ids", JSON.stringify(next));
        } catch { }
        return next;
      });
    },
    []
  );

  const unmarkHiddenInAdminOnly = useCallback(
    (category: "events" | "nutrients" | "marketplace" | "users" | "bookings", id: string) => {
      const cleanId = String(id || "").trim();
      if (!cleanId) return;
      setAdminHiddenIds((prev) => {
        if (!prev[category].includes(cleanId)) return prev;
        const next = { ...prev, [category]: prev[category].filter((x) => x !== cleanId) };
        try {
          localStorage.setItem("hivecity_admin_deleted_ids", JSON.stringify(next));
        } catch { }
        return next;
      });
    },
    []
  );
  const [userDrawer, setUserDrawer] = useState<UserRecord | null>(null);

  // Real-time Firestore users & operational records
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // Google Sheets & Unified Server Users synchronization
  const [sheetUsers, setSheetUsers] = useState<UserRecord[]>([]);
  const [sheetSyncStatus, setSheetSyncStatus] = useState<{
    configured: boolean;
    connected: boolean;
    needsScriptProperty: boolean;
    scriptUrl: string;
    lastSynced: string | null;
    loading: boolean;
    error: string | null;
  }>({
    configured: false,
    connected: false,
    needsScriptProperty: false,
    scriptUrl: "",
    lastSynced: null,
    loading: false,
    error: null,
  });
  const [sheetConfigModalOpen, setSheetConfigModalOpen] = useState(false);
  const [firestoreSyncing, setFirestoreSyncing] = useState(false);
  const [firestoreSyncResult, setFirestoreSyncResult] = useState<{
    scanned: number;
    synced: number;
    failed: number;
    skipped: number;
  } | null>(null);

  // Fetch unified users from GET /api/admin/users (Google Sheets + Firestore Admin + local fallback)
  const fetchSheetUsers = useCallback(async (silent = false) => {
    if (!silent) setSheetSyncStatus((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("/api/admin/users", { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const rawList: any[] = Array.isArray(data.users) ? data.users : [];
      const mapped: UserRecord[] = rawList.map((row: any, idx: number) => {
        const uid = row.uid || row.UID || row.userId || `sheet-${idx}`;
        const email = (row.email || row.Email || "").trim().toLowerCase();
        const name = row.displayName || row["Display Name"] || row.name || (email ? email.split("@")[0] : "Athlete");
        const regDate = row.registrationDate || row["Registration Date"] || row.createdAt || "";
        const lastLog = row.lastLogin || row["Last Login"] || row.lastLoginAt || row.lastActive || "";
        const statusRaw = String(row.status || row.Status || "active").trim();
        const statusLower = statusRaw.toLowerCase();
        const normalizedStatus =
          statusLower === "suspended"
            ? "suspended"
            : statusLower.includes("pending")
              ? "Pending Verification"
              : "active";
        const provider = row.provider || row.Provider || "password";
        const mobile = row.mobile || row.Mobile || null;

        let joinedFormatted = "Recently";
        if (regDate) {
          try {
            const d = new Date(regDate);
            if (!isNaN(d.getTime())) {
              joinedFormatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            }
          } catch { }
        }

        let lastLoginFormatted = "Active recently";
        if (lastLog) {
          try {
            const d = new Date(lastLog);
            if (!isNaN(d.getTime())) {
              lastLoginFormatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
            }
          } catch { }
        }

        return {
          id: uid,
          uid,
          name,
          username: row.username || (email ? email.split("@")[0] : "athlete"),
          email,
          mobile,
          city: row.city || "",
          role: row.role || "USER",
          emailVerified: row.emailVerified !== undefined ? Boolean(row.emailVerified) : !statusLower.includes("pending"),
          bmi: typeof row.bmi === "number" ? row.bmi : undefined,
          bmiCategory: row.bmiCategory || undefined,
          dailyCalorieTarget: typeof row.dailyCalorieTarget === "number" ? row.dailyCalorieTarget : undefined,
          photoURL: row.photoURL || null,
          provider,
          bio: row.bio || "",
          isPrivate: Boolean(row.isPrivate),
          discoverable: row.discoverable !== false,
          status: normalizedStatus,
          activity: mobile ? `Mobile registered · ${provider}` : row.sheetSynced ? "Account registered · Google Sheet Synced" : "Account registered",
          joined: joinedFormatted,
          createdAt: regDate,
          updatedAt: row.updatedAt || lastLog || regDate,
          lastLogin: lastLoginFormatted,
          lastLoginAt: lastLog,
          runsCount: Number(row.runsCount || 0),
          postsCount: Number(row.postsCount || 0),
          followersCount: Number(row.followersCount || 0),
          followingCount: Number(row.followingCount || 0),
          profileSuggestions: Array.isArray(row.profileSuggestions) ? row.profileSuggestions : [],
          accent: ["cyan", "amber", "purple", "rose"][Math.abs(idx) % 4],
          sheetSynced: Boolean(row.sheetSynced),
        };
      });

      setSheetUsers(mapped);
      setUsersLoading(false);

      const st = data.sheetStatus || {};
      setSheetSyncStatus({
        configured: Boolean(st.configured),
        connected: Boolean(st.connected),
        needsScriptProperty: Boolean(st.needsScriptProperty),
        scriptUrl: st.scriptUrl || "",
        lastSynced: st.connected
          ? new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
          : null,
        loading: false,
        error: st.error || null,
      });
    } catch (err: any) {
      console.warn("Could not fetch unified admin users:", err);
      setUsersLoading(false);
      setSheetSyncStatus((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Failed to fetch admin users",
      }));
    }
  }, []);

  // Manually backfill all existing real users (Firebase Auth + Firestore + local store) into Google Sheets.
  // The backend enforces the admin session & whitelist and performs authenticated Apps Script upserts.
  const handleFirestoreToSheetSync = useCallback(async () => {
    if (firestoreSyncing) return;
    setFirestoreSyncing(true);
    setFirestoreSyncResult(null);

    const totals = { scanned: 0, synced: 0, failed: 0, skipped: 0 };

    try {
      const response: globalThis.Response = await fetch("/api/admin/sheets/backfill", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const result: any = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          result.message || `Google Sheets backfill failed (HTTP ${response.status}).`
        );
      }

      totals.scanned = Number(result.scanned || 0);
      totals.synced = Number(result.synced || 0);
      totals.failed = Number(result.failed || 0);
      totals.skipped = Number(result.skipped || 0);

      setFirestoreSyncResult(totals);

      if (totals.failed === 0) {
        toast.success(
          `Synced ${totals.synced} real user${totals.synced === 1 ? "" : "s"} to Google Sheets${result.sheetName ? ` (${result.sheetName})` : ""}.`
        );
      } else {
        toast.warning(
          `Sheet sync finished with issues: ${totals.synced} synced, ${totals.skipped} skipped, ${totals.failed} failed.`
        );
      }

      await fetchSheetUsers(true);
    } catch (error: any) {
      setFirestoreSyncResult(totals);
      const message = error?.message || "Could not sync users to Google Sheets.";
      toast.error(message);
    } finally {
      setFirestoreSyncing(false);
    }
  }, [firestoreSyncing, fetchSheetUsers]);

  // Fetch unified Admin users on initial mount & keep Users panel refreshed live
  useEffect(() => {
    fetchSheetUsers(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchSheetUsers(true);
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [fetchSheetUsers]);

  // Seamlessly merge Firestore live collection with Unified Server / Google Sheets user records
  // Uses Firebase UID as the strict primary key to prevent duplicate user records
  const combinedUsers = useMemo<UserRecord[]>(() => {
    const userMap: Record<string, UserRecord> = {};

    // 1. Add Firestore live users strictly by Firebase UID
    for (const u of usersList) {
      const uidKey = (u.uid || "").trim();
      if (uidKey) {
        userMap[uidKey] = { ...u };
      }
    }

    // 2. Merge unified /api/admin/users (Google Sheets + Firebase Admin + local fallback) by UID
    for (const su of sheetUsers) {
      const uidKey = (su.uid || "").trim();
      if (!uidKey) continue;

      const existing = userMap[uidKey];
      if (existing) {
        if (!existing.mobile && su.mobile) existing.mobile = su.mobile;
        if (!existing.city && su.city) existing.city = su.city;
        if (existing.bmi === undefined && su.bmi !== undefined) existing.bmi = su.bmi;
        if (!existing.bmiCategory && su.bmiCategory) existing.bmiCategory = su.bmiCategory;
        if ((!existing.name || existing.name === "Hive Athlete") && su.name) existing.name = su.name;
        if (existing.joined === "Recently" && su.joined !== "Recently") existing.joined = su.joined;
        if (existing.lastLogin === "Active recently" && su.lastLogin !== "Active recently") existing.lastLogin = su.lastLogin;
        if (su.sheetSynced) existing.sheetSynced = true;
      } else {
        userMap[uidKey] = su;
      }
    }

    return Object.values(userMap);
  }, [usersList, sheetUsers]);
  const [eventsList, setEventsList] = useState<EventRecord[]>([]);
  const [ordersList, setOrdersList] = useState<OrderRecord[]>([]);
  const [activityList, setActivityList] = useState<ActivityItem[]>([]);
  const [platformPulse, setPlatformPulse] = useState<ChartPoint[]>([]);
  const [revenuePulse, setRevenuePulse] = useState<ChartPoint[]>([]);
  const [heatmapData, setHeatmapData] = useState<number[]>([]);

  // 1. Subscribe to Firestore "users" collection in real-time
  useEffect(() => {
    try {
      const usersCol = collection(db, "users");
      const unsubscribe = onSnapshot(
        usersCol,
        (snapshot) => {
          const records: UserRecord[] = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            const uid = docSnap.id;

            // Formatted joined date from Firestore timestamp or date string
            let joinedStr = "Recently";
            if (data.createdAt) {
              try {
                const d = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                if (!isNaN(d.getTime())) {
                  joinedStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                }
              } catch { }
            }

            // Formatted last login / last active
            let lastLoginStr = "Active recently";
            const ts = data.lastLoginAt || data.updatedAt || data.lastActive || data.lastLogin;
            if (ts) {
              try {
                const d = ts.toDate ? ts.toDate() : new Date(ts);
                if (!isNaN(d.getTime())) {
                  lastLoginStr = d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                }
              } catch { }
            }

            const runs = Number(data.runsCount || 0);
            const posts = Number(data.postsCount || 0);
            const followers = Number(data.followersCount || 0);
            const following = Number(data.followingCount || 0);

            let activityDesc = `${runs} runs · ${posts} posts`;
            if (runs === 0 && posts === 0) {
              activityDesc = data.mobile ? `Mobile registered · ${data.provider || "password"}` : "Account registered";
            }

            // Normalize profile suggestions submitted by user
            let suggestions: any[] = [];
            if (Array.isArray(data.profileSuggestions)) {
              suggestions = data.profileSuggestions;
            } else if (Array.isArray(data.suggestions)) {
              suggestions = data.suggestions;
            } else if (data.profileSuggestions && typeof data.profileSuggestions === "object") {
              suggestions = [data.profileSuggestions];
            } else if (data.pendingProfileSuggestion) {
              suggestions = [data.pendingProfileSuggestion];
            }

            return {
              id: uid,
              uid,
              name: data.name || data.displayName || data.username || "Hive Athlete",
              username: data.username || (data.email ? data.email.split("@")[0] : "athlete"),
              email: data.email || "",
              mobile: data.mobile || null,
              photoURL: data.photoURL || null,
              provider: data.provider || "password",
              bio: data.bio || "",
              isPrivate: Boolean(data.isPrivate),
              discoverable: data.discoverable !== false,
              status: data.status === "suspended" ? "suspended" : "active",
              activity: activityDesc,
              joined: joinedStr,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              lastLogin: lastLoginStr,
              lastLoginAt: data.lastLoginAt,
              runsCount: runs,
              postsCount: posts,
              followersCount: followers,
              followingCount: following,
              profileSuggestions: suggestions,
              accent: ["cyan", "amber", "purple", "rose"][
                Math.abs(uid.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 4
              ],
            };
          });

          setUsersList(records);
          setUsersLoading(false);
        },
        (err) => {
          console.warn("Firestore users subscription warning:", err);
          setUsersLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.warn("Firestore subscription error:", err);
      setUsersLoading(false);
    }
  }, []);

  // 2. Subscribe to Firestore "events" & "event_bookings" collections (with localStorage mirror)
  useEffect(() => {
    const readLocalBookings = (): EventBookingRecord[] => {
      try {
        const raw = localStorage.getItem(SHARED_BOOKINGS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    setEventBookings(readLocalBookings());

    let unsubBookings: (() => void) | null = null;
    try {
      const bookingsCol = collection(db, "event_bookings");
      unsubBookings = onSnapshot(
        bookingsCol,
        (snapshot) => {
          const remote: EventBookingRecord[] = snapshot.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              userId: String(d.userId || ""),
              userName: d.userName || "",
              userEmail: d.userEmail || "",
              eventId: String(d.eventId || ""),
              eventTitle: d.eventTitle || "",
              bookedAt: d.bookedAt || new Date().toISOString(),
              feeAmount: d.feeAmount ?? 0,
              agreedToTerms: Boolean(d.agreedToTerms),
              bookingUrl: d.bookingUrl || "",
            };
          });
          const local = readLocalBookings();
          const map: Record<string, EventBookingRecord> = {};
          for (const b of [...local, ...remote]) {
            const key = b.id || `${b.eventId}_${b.userId}_${b.bookedAt}`;
            map[key] = b;
          }
          setEventBookings(Object.values(map));
        },
        () => { }
      );
    } catch { }

    const onStorageSync = (ev: StorageEvent) => {
      if (ev.key === SHARED_BOOKINGS_STORAGE_KEY) {
        setEventBookings(readLocalBookings());
      }
    };
    window.addEventListener("storage", onStorageSync);

    return () => {
      if (unsubBookings) unsubBookings();
      window.removeEventListener("storage", onStorageSync);
    };
  }, []);

  useEffect(() => {
    const mapRawEvent = (id: string, data: any): EventRecord => normalizeUnifiedEvent(id, data);

    // 1. Hydrate from shared store (/api/events + localStorage) and auto-sync any local-only events up to Firestore via firebase-admin
    const loadUnified = async () => {
      try {
        const synced = admin ? await syncLocalEventsToServer() : await getAllEvents();
        if (synced.length > 0) {
          setEventsList(synced);
        }
        const serverBookings = await fetchAllBookingsFromServer();
        if (serverBookings.length > 0) {
          setEventBookings((prev) => {
            const map: Record<string, EventBookingRecord> = {};
            for (const b of [...prev, ...serverBookings]) {
              const k = b.id || `${b.eventId}_${b.userId}_${b.bookedAt}`;
              map[k] = b;
            }
            return Object.values(map);
          });
        }
      } catch { }
    };

    void loadUnified();

    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        void loadUnified();
      }
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    window.addEventListener(EVENTS_UPDATED_EVENT, onFocusOrVisible);
    const bookingsPoll = window.setInterval(onFocusOrVisible, 10000);

    // 2. Also subscribe to live Firestore "events" collection (merging with server/local)
    let unsubscribe: (() => void) | null = null;
    try {
      const eventsCol = collection(db, "events");
      unsubscribe = onSnapshot(
        eventsCol,
        (snapshot) => {
          if (snapshot.empty) return;
          const evts: EventRecord[] = snapshot.docs.map((docSnap) =>
            mapRawEvent(docSnap.id, docSnap.data())
          );
          setEventsList((prev) => {
            const map: Record<string, EventRecord> = {};
            for (const p of prev) {
              if (p.id) map[p.id] = p;
            }
            for (const e of evts) {
              if (e.id) map[e.id] = e;
            }
            const merged = Object.values(map);
            mirrorEventsToLocalStorage(merged);
            return merged;
          });
        },
        () => { }
      );
    } catch { }

    return () => {
      window.clearInterval(bookingsPoll);
      if (unsubscribe) unsubscribe();
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      window.removeEventListener(EVENTS_UPDATED_EVENT, onFocusOrVisible);
    };
  }, [admin]);

  // 3. Subscribe & sync Nutrients (Admin-hosted + User-created), Marketplace Products, and Orders
  useEffect(() => {
    const loadContent = async () => {
      try {
        const [recipes, products, orders] = await Promise.all([
          getAllNutrients(),
          getAllMarketplaceProducts(),
          getAllMarketplaceOrders(),
        ]);
        setNutrientsList(recipes);
        setMarketplaceProducts(products);
        setOrdersList(orders);
      } catch { }
    };

    void loadContent();

    const onRefresh = () => {
      if (document.visibilityState === "visible") {
        void loadContent();
      }
    };
    const onStorage = (ev: StorageEvent) => {
      if (
        ev.key === SHARED_NUTRIENTS_STORAGE_KEY ||
        ev.key === SHARED_MARKETPLACE_STORAGE_KEY
      ) {
        void loadContent();
      }
    };
    window.addEventListener("focus", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener(NUTRIENTS_UPDATED_EVENT, onRefresh);
    window.addEventListener(MARKETPLACE_UPDATED_EVENT, onRefresh);

    // Live Firestore listeners so User-created recipes, purchases & Admin changes stream immediately
    let unsubRecipes: (() => void) | null = null;
    let unsubSharedNut: (() => void) | null = null;
    let unsubProducts: (() => void) | null = null;
    let unsubOrders: (() => void) | null = null;
    try {
      unsubRecipes = onSnapshot(collection(db, "recipes"), () => {
        void loadContent();
      }, () => { });
      unsubSharedNut = onSnapshot(collection(db, "shared_nutrition"), () => {
        void loadContent();
      }, () => { });
      unsubProducts = onSnapshot(collection(db, "marketplace_products"), () => {
        void loadContent();
      }, () => { });
      unsubOrders = onSnapshot(collection(db, "marketplace_orders"), () => {
        void loadContent();
      }, () => { });
    } catch { }

    const pollInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadContent();
      }
    }, 10000);

    return () => {
      window.clearInterval(pollInterval);
      if (unsubRecipes) unsubRecipes();
      if (unsubSharedNut) unsubSharedNut();
      if (unsubProducts) unsubProducts();
      if (unsubOrders) unsubOrders();
      window.removeEventListener("focus", onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(NUTRIENTS_UPDATED_EVENT, onRefresh);
      window.removeEventListener(MARKETPLACE_UPDATED_EVENT, onRefresh);
    };
  }, [admin]);

  // Account status control: Active ↔ Suspended toggle in Firestore
  async function handleToggleUserStatus(user: UserRecord) {
    const nextStatus = user.status === "suspended" ? "active" : "suspended";
    try {
      const ref = doc(db, "users", user.uid);
      await updateDoc(ref, {
        status: nextStatus,
        statusUpdatedAt: serverTimestamp(),
      });
      toast.success(
        nextStatus === "suspended"
          ? `User "${user.name}" has been suspended.`
          : `User "${user.name}" is now active.`
      );
      if (userDrawer && userDrawer.uid === user.uid) {
        setUserDrawer((prev) => (prev ? { ...prev, status: nextStatus } : null));
      }
    } catch (err: any) {
      console.error("Failed to update status:", err);
      toast.error(`Could not update status: ${err?.message || "Unknown error"}`);
    }
  }

  // Profile suggestions: Approve and apply changes directly to user profile in Firestore
  async function handleApproveSuggestion(user: UserRecord, suggestionIndex: number, field: string, newValue: any) {
    try {
      const ref = doc(db, "users", user.uid);
      const updatedSuggestions = [...(user.profileSuggestions || [])];
      if (updatedSuggestions[suggestionIndex]) {
        updatedSuggestions[suggestionIndex] = {
          ...updatedSuggestions[suggestionIndex],
          status: "approved",
          resolvedAt: new Date().toISOString(),
        };
      }
      const updateData: Record<string, any> = {
        profileSuggestions: updatedSuggestions,
        updatedAt: serverTimestamp(),
      };
      if (field && newValue !== undefined) {
        updateData[field] = newValue;
      }
      await updateDoc(ref, updateData);
      toast.success(`Profile suggestion for ${field || "profile"} approved and applied!`);
      if (userDrawer && userDrawer.uid === user.uid) {
        setUserDrawer((prev) =>
          prev
            ? {
              ...prev,
              ...(field ? { [field]: newValue } : {}),
              profileSuggestions: updatedSuggestions,
            }
            : null
        );
      }
    } catch (err: any) {
      console.error("Approve suggestion error:", err);
      toast.error(`Failed to approve suggestion: ${err?.message}`);
    }
  }

  // Profile suggestions: Dismiss suggestion
  async function handleDismissSuggestion(user: UserRecord, suggestionIndex: number) {
    try {
      const ref = doc(db, "users", user.uid);
      const updatedSuggestions = [...(user.profileSuggestions || [])];
      if (updatedSuggestions[suggestionIndex]) {
        updatedSuggestions[suggestionIndex] = {
          ...updatedSuggestions[suggestionIndex],
          status: "rejected",
          resolvedAt: new Date().toISOString(),
        };
      }
      await updateDoc(ref, {
        profileSuggestions: updatedSuggestions,
        updatedAt: serverTimestamp(),
      });
      toast.info(`Suggestion dismissed.`);
      if (userDrawer && userDrawer.uid === user.uid) {
        setUserDrawer((prev) =>
          prev ? { ...prev, profileSuggestions: updatedSuggestions } : null
        );
      }
    } catch (err: any) {
      console.error("Dismiss suggestion error:", err);
      toast.error(`Failed to dismiss: ${err?.message}`);
    }
  }

  const { theme, toggleTheme } = useTheme();

  const rawPath = location === "/" ? "/" : location;
  const isRemovedPath = REMOVED_ADMIN_PATHS.has(rawPath);
  const activePath = isRemovedPath ? "/" : rawPath;
  const meta = pageMeta[activePath];
  const activeLabel = activePath === "/" ? "Dashboard" : meta?.title || "Dashboard";
  const isDashboard = activePath === "/" || activePath === "/dashboard";

  useEffect(() => {
    if (isRemovedPath) {
      navigate("/", { replace: true });
    }
  }, [isRemovedPath, navigate]);

  const filteredUsers = useMemo(
    () =>
      combinedUsers.filter((user) =>
        `${user.name} ${user.email} ${user.activity}`.toLowerCase().includes(search.toLowerCase())
      ),
    [combinedUsers, search]
  );

  function go(path: string) {
    navigate(path);
    setMobileNav(false);
    setSearch("");
  }

  const enrichedEventsList = useMemo<EventRecord[]>(() => {
    return eventsList.map((evt) => {
      const resolvedStatus = resolveEventStatus({
        status: evt.status,
        completed: evt.completed,
        eventDate: evt.eventDate,
        date: evt.date,
      });
      const bookedForEvent = eventBookings.filter((b) => b.eventId && b.eventId === evt.id).length;
      const count = Math.max(Number(evt.bookingsCount || 0), bookedForEvent);
      const capacity = Number(evt.capacity || 100);
      return {
        ...evt,
        status: resolvedStatus,
        completed: resolvedStatus === "completed",
        bookingsCount: count,
        bookings: `${count} / ${capacity}`,
      };
    });
  }, [eventsList, eventBookings]);

  function mirrorEventsToLocalStorage(nextEvents: EventRecord[]) {
    try {
      const serializable = nextEvents.map((e) => ({
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
    } catch { }
  }

  async function handleSaveEvent(
    payload: {
      title: string;
      category: string;
      description: string;
      location: string;
      eventDate: string;
      endDate?: string;
      status: HiveEventStatus;
      feeAmount: number;
      termsAndConditions: string;
      bookingUrl: string;
      capacity: number;
      imageUrl?: string;
    },
    existingId?: string
  ) {
    const cleanTitle = payload.title.trim() || "New Community Event";
    const cleanBookingUrl = normalizeBookingUrl(payload.bookingUrl);
    const feeNum = parseFeeNumber(payload.feeAmount);
    const resolvedStatus = resolveEventStatus({
      status: payload.status,
      completed: payload.status === "completed",
      eventDate: payload.eventDate,
    });

    const apiPayload: Record<string, any> = {
      title: cleanTitle,
      name: cleanTitle,
      description: payload.description.trim(),
      location: payload.location.trim(),
      eventDate: payload.eventDate,
      date: payload.eventDate,
      endDate: payload.endDate?.trim() || "",
      status: resolvedStatus,
      completed: resolvedStatus === "completed",
      feeAmount: feeNum,
      termsAndConditions: payload.termsAndConditions.trim(),
      bookingUrl: cleanBookingUrl,
      imageUrl: payload.imageUrl || "",
      type: payload.category.toUpperCase(),
      category: payload.category,
      capacity: payload.capacity || 100,
    };

    try {
      // Primary write via backend /api/events (uses firebase-admin -> Firestore directly with zero client rule issues)
      const saved = await saveEventToServer(apiPayload, existingId);
      if (saved) {
        setEventsList((prev) => {
          const exists = prev.some((e) => e.id === saved.id);
          const next = exists
            ? prev.map((e) => (e.id === saved.id ? saved : e))
            : [saved, ...prev];
          mirrorEventsToLocalStorage(next);
          return next;
        });
        toast.success(
          existingId
            ? `Event "${cleanTitle}" updated and synced live.`
            : `Event "${cleanTitle}" published (${saved.status.toUpperCase()}) & synced to User Events!`
        );
        return;
      }
    } catch (apiErr: any) {
      console.warn("Backend /api/events save fallback:", apiErr);
    }

    // Secondary fallback: direct client Firestore write + localStorage
    const firestorePayload: Record<string, any> = {
      ...apiPayload,
      updatedAt: serverTimestamp(),
    };

    try {
      if (existingId) {
        await updateDoc(doc(db, "events", existingId), firestorePayload);
      } else {
        firestorePayload.bookingsCount = 0;
        firestorePayload.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, "events"), firestorePayload);
        existingId = docRef.id;
      }
      const record = normalizeUnifiedEvent(existingId, apiPayload);
      setEventsList((prev) => {
        const exists = prev.some((e) => e.id === record.id);
        const next = exists ? prev.map((e) => (e.id === record.id ? record : e)) : [record, ...prev];
        mirrorEventsToLocalStorage(next);
        return next;
      });
      toast.success(`Event "${cleanTitle}" synced to Firestore.`);
    } catch (err: any) {
      console.error("Event save fallback error:", err);
      const fallbackId = existingId || `evt-${Date.now()}`;
      const localRecord = normalizeUnifiedEvent(fallbackId, apiPayload);
      setEventsList((prev) => {
        const exists = prev.some((e) => e.id === fallbackId);
        const next = exists ? prev.map((e) => (e.id === fallbackId ? localRecord : e)) : [localRecord, ...prev];
        mirrorEventsToLocalStorage(next);
        return next;
      });
      toast.warning(`Event saved locally (${err?.message || "check backend connection"}).`);
    }
  }

  async function purgeFirestoreTicketsForEvent(eventId: string) {
    if (!eventId) return;
    try {
      const q = query(collection(db, "event_bookings"), where("eventId", "==", eventId));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    } catch (err) {
      console.warn("Firestore ticket purge note:", err);
    }
    setEventBookings((prev) => {
      const next = prev.filter((b) => String(b.eventId || "") !== String(eventId));
      try {
        localStorage.setItem(SHARED_BOOKINGS_STORAGE_KEY, JSON.stringify(next));
      } catch { }
      return next;
    });
  }

  async function handleMarkEventCompleted(evt: EventRecord) {
    if (!evt.id) return;
    try {
      await markEventCompletedOnServer(evt.id);
    } catch (apiErr) {
      console.warn("Backend mark completed fallback:", apiErr);
      try {
        await updateDoc(doc(db, "events", evt.id), {
          status: "completed",
          completed: true,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err: any) {
        console.warn("Firestore mark completed note:", err);
      }
    }
    await purgeFirestoreTicketsForEvent(evt.id);
    setEventsList((prev) => {
      const next = prev.map((e) =>
        e.id === evt.id ? { ...e, status: "completed", completed: true, bookingsCount: 0 } : e
      );
      mirrorEventsToLocalStorage(next);
      return next;
    });
    toast.success(`"${evt.name}" marked as Completed and all associated tickets permanently removed.`);
  }

  async function handleDeleteEvent(evt: EventRecord) {
    if (!evt.id) return;
    if (!window.confirm(`Remove "${evt.name}" from the Admin Panel? Associated tickets will be permanently deleted.`)) {
      return;
    }
    try {
      await deleteEventOnServer(evt.id);
    } catch (apiErr) {
      console.warn("Backend admin-hide event fallback:", apiErr);
    }
    await purgeFirestoreTicketsForEvent(evt.id);
    markHiddenInAdminOnly("events", evt.id);
    setEventsList((prev) => prev.filter((e) => e.id !== evt.id));
    toast.success(`Event "${evt.name}" removed and associated tickets deleted.`);
  }

  async function handleDeleteEventBookings(eventId: string, eventTitle: string) {
    if (!eventId) return;
    if (
      !window.confirm(
        `Delete all booking records for "${eventTitle}" from Ticketing & bookings? (Other events and User pages will remain untouched.)`
      )
    ) {
      return;
    }
    try {
      await deleteEventBookingsInAdminOnServer(eventId);
    } catch (apiErr) {
      console.warn("Backend admin-hide event bookings fallback:", apiErr);
    }
    markHiddenInAdminOnly("bookings", eventId);
    setEventBookings((prev) => prev.filter((b) => b.eventId !== eventId));
    toast.success(`Booking records for "${eventTitle}" removed from Ticketing & bookings.`);
  }

  const fetchSponsors = useCallback(async () => {
    setSponsorsLoading(true);
    try {
      const res = await fetch("/api/admin/sponsors", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.sponsors)) {
        setSponsorsList(data.sponsors);
      }
    } catch (err) {
      console.warn("Could not load sponsors:", err);
    } finally {
      setSponsorsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!admin) return;
    void fetchSponsors();
  }, [admin, fetchSponsors]);

  useEffect(() => {
    if (admin && location === "/sponsors") {
      void fetchSponsors();
    }
  }, [admin, location, fetchSponsors]);

  async function handleCreateSponsor(payload: SponsorFormPayload) {
    const res = await fetch("/api/admin/sponsors", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.sponsor) {
      throw new Error(data.error || "Failed to save sponsor.");
    }
    setSponsorsList((prev) => [
      data.sponsor,
      ...prev.filter((s) => s.id !== data.sponsor.id),
    ]);
    if (data.sheetSynced) {
      toast.success(`Sponsor "${data.sponsor.sponsorName}" saved & synced to Google Sheets.`);
    } else {
      console.warn("[Admin Sponsors] Google Sheets sync warning:", data.sheetError);
      toast.warning(
        `Sponsor "${data.sponsor.sponsorName}" saved locally, but Google Sheets sync failed: ${data.sheetError || "Check Apps Script secret & deployment version."
        }`
      );
    }
  }

  async function handleDeleteSponsor(sponsor: SponsorRecord) {
    if (!sponsor.id) return;
    if (!window.confirm(`Delete sponsor "${sponsor.sponsorName}" from Sponsors?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/sponsors/${encodeURIComponent(sponsor.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Delete failed");
      }
      setSponsorsList((prev) => prev.filter((s) => s.id !== sponsor.id));
      toast.success(`Sponsor "${sponsor.sponsorName}" deleted.`);
    } catch (err: any) {
      toast.error(err?.message || "Could not delete sponsor.");
    }
  }

  async function handleCreateNutrient(payload: CreateNutrientFormPayload) {
    const cover = String(payload.imageUrl || "").trim();
    const enrichedPayload = {
      ...payload,
      image: cover,
      imageUrl: cover,
      coverImage: cover,
      images: cover ? [cover] : [],
      imageUrls: cover ? [cover] : [],
      creatorRole: "Admin" as const,
      createdBy: "admin",
      isFeatured: true,
      isAdminSpecial: true,
      creatorName: admin?.name || "Hivecity Admin",
    };
    try {
      const saved = await createNutrientOnServer(enrichedPayload);
      if (saved) {
        unmarkHiddenInAdminOnly("nutrients", saved.id);
        setNutrientsList((prev) => {
          const next = [saved, ...prev.filter((r) => r.id !== saved.id)];
          writeCachedLocalNutrients(next);
          return next;
        });
        window.dispatchEvent(new Event("hivecity:nutrients-updated"));
        toast.success(`Recipe "${saved.title}" published & synced to User Nutrients!`);
        return;
      }
    } catch (err: any) {
      console.warn("Backend /api/nutrients create fallback:", err);
      const fallback = normalizeUnifiedNutrient(`nut-${Date.now()}`, enrichedPayload);
      setNutrientsList((prev) => {
        const next = [fallback, ...prev];
        writeCachedLocalNutrients(next);
        return next;
      });
      window.dispatchEvent(new Event("hivecity:nutrients-updated"));
      toast.warning(`Recipe saved locally (${err?.message || "check backend connection"}).`);
    }
  }

  async function handleDeleteNutrient(recipe: UnifiedNutrientRecipe) {
    if (!recipe.id) return;
    if (!window.confirm(`Remove "${recipe.title}" from the Admin Panel? (It will remain visible on User pages.)`)) {
      return;
    }
    try {
      await deleteNutrientOnServer(recipe.id, recipe.sharedDocId);
    } catch (err) {
      console.warn("Backend admin-hide nutrient fallback:", err);
    }
    markHiddenInAdminOnly("nutrients", recipe.id);
    setNutrientsList((prev) => prev.filter((r) => r.id !== recipe.id));
    toast.success(`Recipe "${recipe.title}" removed from Admin view.`);
  }

  async function handleCreateProduct(payload: CreateProductFormPayload) {
    try {
      const saved = await createMarketplaceProductOnServer({
        ...payload,
        creatorRole: "Admin",
        creatorName: admin?.name || "Hivecity Admin",
      });
      if (saved) {
        unmarkHiddenInAdminOnly("marketplace", saved.id);
        setMarketplaceProducts((prev) => {
          const next = [saved, ...prev.filter((p) => p.id !== saved.id)];
          writeCachedLocalMarketplaceProducts(next);
          return next;
        });
        toast.success(`Product "${saved.name}" published & synced to User Marketplace!`);
        return;
      }
    } catch (err: any) {
      console.warn("Backend /api/marketplace create fallback:", err);
      const fallback = normalizeUnifiedProduct(`prod-${Date.now()}`, {
        ...payload,
        creatorRole: "Admin",
        creatorName: admin?.name || "Hivecity Admin",
      });
      setMarketplaceProducts((prev) => {
        const next = [fallback, ...prev];
        writeCachedLocalMarketplaceProducts(next);
        return next;
      });
      toast.warning(`Product saved locally (${err?.message || "check backend connection"}).`);
    }
  }

  async function handleDeleteProduct(product: UnifiedMarketplaceProduct) {
    if (!product.id) return;
    if (!window.confirm(`Permanently delete "${product.name}" from both Admin Marketplace and the User Shop?`)) {
      return;
    }
    try {
      await deleteMarketplaceProductOnServer(product.id);
    } catch (err) {
      console.warn("Backend permanent delete product fallback:", err);
    }
    try {
      const deletedKey = "hivecity_deleted_shop_product_ids";
      const existingDeleted: string[] = JSON.parse(localStorage.getItem(deletedKey) || "[]");
      if (!existingDeleted.includes(product.id)) {
        localStorage.setItem(deletedKey, JSON.stringify([...existingDeleted, product.id]));
      }
      for (const cacheKey of ["hivecity_marketplace_products", "hivecity_shared_marketplace"]) {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            localStorage.setItem(
              cacheKey,
              JSON.stringify(parsed.filter((item: any) => String(item?.id || "") !== String(product.id)))
            );
          }
        }
      }
    } catch {}
    setMarketplaceProducts((prev) => {
      const next = prev.filter((p) => p.id !== product.id);
      writeCachedLocalMarketplaceProducts(next);
      return next;
    });
    window.dispatchEvent(new Event("hivecity:products-updated"));
    toast.success(`Product "${product.name}" permanently deleted from Admin & User Shop.`);
  }

  function openStudioTab(tab: StudioTab) {
    setStudioTab(tab);
    go("/event-hosting");
  }

  function handleCreateRecord(title: string, category: string) {
    if (category === "Running" || category === "HIVE PLAY" || category === "Community") {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      void handleSaveEvent({
        title: title || "New Untitled Event",
        category,
        description: "",
        location: "Hive City",
        eventDate: tomorrow,
        status: "upcoming",
        feeAmount: 0,
        termsAndConditions: "",
        bookingUrl: "",
        capacity: 100,
      });
    }
  }

  // Route Guard 1: Loading verified server session
  if (loading) {
    return (
      <div className="admin-loading-screen">
        <Hexagon size={36} className="animate-spin" style={{ color: "var(--ac)" }} />
        <span>Verifying administrative authorization...</span>
      </div>
    );
  }

  // Route Guard 2: Unauthenticated — render dedicated Admin Login
  // Ordinary users cannot bypass this by editing localStorage or URL
  if (!admin) {
    return <AdminLogin />;
  }

  // Route Guard 3: Role-based authorization check
  const isPermitted = hasPermission(activePath);

  const adminInitials = admin.name
    ? admin.name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
    : "AD";

  const adminVisibleUsers = filteredUsers.filter(
    (u) => !(u as any).hiddenInAdmin && !adminHiddenIds.users.includes(u.uid)
  );
  const adminVisibleCombinedUsers = combinedUsers.filter(
    (u) => !(u as any).hiddenInAdmin && !adminHiddenIds.users.includes(u.uid)
  );
  const adminVisibleEvents = enrichedEventsList.filter(
    (e) => !(e as any).hiddenInAdmin && !adminHiddenIds.events.includes(String(e.id || ""))
  );
  const adminVisibleNutrients = nutrientsList.filter(
    (r) => !r.hiddenInAdmin && !adminHiddenIds.nutrients.includes(r.id)
  );
  const adminVisibleProducts = marketplaceProducts.filter(
    (p) => !p.hiddenInAdmin && !adminHiddenIds.marketplace.includes(p.id)
  );
  const adminVisibleBookings = eventBookings.filter(
    (b) => !b.hiddenInAdmin && !adminHiddenIds.bookings.includes(String(b.eventId || ""))
  );

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {mobileNav && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileNav(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileNav}
        activePath={activePath}
        onNavigate={go}
        onCollapse={() => setCollapsed((value) => !value)}
        hasPermission={hasPermission}
      />
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={18} />
            </button>
            <div className="breadcrumbs">
              <span>HIVE // OPS</span>
              <ChevronRight size={13} />
              <strong>{activeLabel}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search users, events, sponsors…"
                aria-label="Global search"
              />
              <kbd>⌘ K</kbd>
            </label>

            <button
              className="icon-button"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <div className="topbar-divider" />

            <div className="relative-wrap">
              <button
                className={`icon-button ${notificationsOpen ? "active" : ""}`}
                aria-label="Notifications"
                onClick={() => setNotificationsOpen((value) => !value)}
              >
                <Bell size={17} />
              </button>
              {notificationsOpen && <NotificationPopover onClose={() => setNotificationsOpen(false)} />}
            </div>

            <div className="relative-wrap">
              <button className="profile-chip" onClick={() => setProfileOpen((value) => !value)}>
                <span className="avatar avatar-cyan">{adminInitials}</span>
                <span className="profile-copy">
                  <strong>{admin.name}</strong>
                  <small>{getRoleLabel(admin.role)}</small>
                </span>
                <ChevronDown size={14} />
              </button>
              {profileOpen && (
                <ProfilePopover
                  admin={admin}
                  roleLabel={getRoleLabel(admin.role)}
                  onClose={() => setProfileOpen(false)}
                  onLogout={async () => {
                    setProfileOpen(false);
                    await logout();
                    toast.success("Signed out securely.");
                  }}
                />
              )}
            </div>
          </div>
        </header>

        <main className="content-area">
          {!isPermitted ? (
            <AccessRestricted
              path={activePath}
              role={admin.role}
              roleLabel={getRoleLabel(admin.role)}
              onBack={() => go("/")}
            />
          ) : isDashboard ? (
            <Dashboard
              onQuickAction={() => openStudioTab("event")}
              onOpenStudioTab={openStudioTab}
              onNavigate={go}
              users={adminVisibleCombinedUsers}
              events={adminVisibleEvents}
              orders={ordersList}
              activityFeed={activityList}
              platformPulse={platformPulse}
              revenuePulse={revenuePulse}
              heatmap={heatmapData}
            />
          ) : (
            <OperationalPage
              path={activePath}
              meta={meta || pageMeta["/users"]}
              search={search}
              users={adminVisibleUsers}
              usersLoading={usersLoading}
              events={adminVisibleEvents}
              allEvents={enrichedEventsList}
              eventBookings={adminVisibleBookings}
              nutrients={adminVisibleNutrients}
              products={adminVisibleProducts}
              orders={ordersList}
              studioTab={studioTab}
              sheetSyncStatus={sheetSyncStatus}
              onSyncSheet={() => fetchSheetUsers(false)}
              firestoreSyncing={firestoreSyncing}
              firestoreSyncResult={firestoreSyncResult}
              onSyncFirestoreToSheet={handleFirestoreToSheetSync}
              onOpenSheetConfig={() => setSheetConfigModalOpen(true)}
              onUser={setUserDrawer}
              onToggleStatus={handleToggleUserStatus}
              onApproveSuggestion={handleApproveSuggestion}
              onDismissSuggestion={handleDismissSuggestion}
              onCreateEvent={async (payload: CreateEventFormPayload) => {
                await handleSaveEvent(payload);
              }}
              onCreateNutrient={handleCreateNutrient}
              onCreateProduct={handleCreateProduct}
              onMarkEventCompleted={handleMarkEventCompleted}
              onDeleteEvent={handleDeleteEvent}
              onDeleteEventBookings={handleDeleteEventBookings}
              onDeleteNutrient={handleDeleteNutrient}
              onDeleteProduct={handleDeleteProduct}
              sponsors={sponsorsList}
              sponsorsLoading={sponsorsLoading}
              onDeleteSponsor={handleDeleteSponsor}
              sessionModalOpen={sessionModalOpen}
              onCloseSessionModal={() => setSessionModalOpen(false)}
              campaignModalOpen={campaignModalOpen}
              onOpenCampaignModal={() => setCampaignModalOpen(true)}
              onCloseCampaignModal={() => setCampaignModalOpen(false)}
              onQuickAction={() => {
                if (activePath === "/sponsors") {
                  setSponsorModalOpen(true);
                  return;
                }
                if (activePath === "/communities") {
                  setSessionModalOpen(true);
                  return;
                }
                if (activePath === "/campaigns") {
                  setCampaignModalOpen(true);
                  return;
                }
                setEditingEvent(null);
                setQuickActionOpen(true);
              }}
            />
          )}
        </main>
      </div>

      {sponsorModalOpen && (
        <SponsorCreateModal
          onClose={() => setSponsorModalOpen(false)}
          onSave={async (payload) => {
            await handleCreateSponsor(payload);
            setSponsorModalOpen(false);
          }}
        />
      )}

      {quickActionOpen && (
        <QuickActionModal
          editingEvent={editingEvent}
          onClose={() => {
            setQuickActionOpen(false);
            setEditingEvent(null);
          }}
          onSaveEvent={async (payload, existingId) => {
            setQuickActionOpen(false);
            setEditingEvent(null);
            await handleSaveEvent(payload, existingId);
          }}
          onDone={(name, category) => {
            setQuickActionOpen(false);
            setEditingEvent(null);
            handleCreateRecord(name, category);
            toast.success(name ? `Draft created for "${name}".` : "Draft record created.");
          }}
        />
      )}

      {sheetConfigModalOpen && (
        <GoogleSheetConfigModal
          currentUrl={sheetSyncStatus.scriptUrl}
          status={sheetSyncStatus}
          onClose={() => setSheetConfigModalOpen(false)}
          onSaved={() => {
            fetchSheetUsers(false);
          }}
        />
      )}

      {userDrawer && (
        <UserDrawer
          user={userDrawer}
          onClose={() => setUserDrawer(null)}
          onToggleStatus={handleToggleUserStatus}
          onApproveSuggestion={handleApproveSuggestion}
          onDismissSuggestion={handleDismissSuggestion}
        />
      )}
    </div>
  );
}

function AccessRestricted({
  path,
  role,
  roleLabel,
  onBack,
}: {
  path: string;
  role: AdminRole;
  roleLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="access-restricted-card">
      <div className="restricted-icon-wrap">
        <ShieldAlert size={28} />
      </div>
      <h2>Authorization Restricted</h2>
      <p>
        Your current administrative clearance (<strong>{roleLabel}</strong>) does not have permission to access{" "}
        <code>{path}</code>. Sensitive configuration and financial operations are restricted to higher tiers.
      </p>
      <button className="primary-button" onClick={onBack}>
        Return to Command Centre
      </button>
    </div>
  );
}

function Sidebar({
  collapsed,
  mobileOpen,
  activePath,
  onNavigate,
  onCollapse,
  hasPermission,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  activePath: string;
  onNavigate: (path: string) => void;
  onCollapse: () => void;
  hasPermission: (path: string) => boolean;
}) {
  // Role-filtered navigation: only show items the current admin is authorized to access
  const filteredGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(item.path)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-brand">
        {collapsed ? (
          <img
            src="/hivecity-logo-round.png"
            alt="HIVE CITY"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              objectFit: "contain",
              background: "#000000",
              flexShrink: 0,
            }}
          />
        ) : (
          <img
            src="/hivecity-full-logo.png"
            alt="HIVE CITY"
            style={{
              height: 54,
              width: "100%",
              maxWidth: 184,
              borderRadius: 12,
              objectFit: "contain",
              background: "#000000",
              padding: "4px 8px",
              display: "block",
            }}
          />
        )}
        <button
          className="icon-button sidebar-close-mobile"
          aria-label="Close navigation"
          onClick={() => onNavigate(activePath)}
        >
          <X size={17} />
        </button>
      </div>

      <div className="status-strip">
        <span className="status-pulse" />
        {!collapsed && (
          <>
            <span>All systems nominal</span>
            <small>v3.2</small>
          </>
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {filteredGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            {!collapsed && <div className="nav-label">{group.label}</div>}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activePath === item.path || (activePath === "/dashboard" && item.path === "/");
              return (
                <button
                  key={item.path}
                  className={`nav-item ${active ? "active" : ""}`}
                  onClick={() => onNavigate(item.path)}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={17} strokeWidth={active ? 2.3 : 1.8} />
                  <span className="nav-item-text">{item.label}</span>
                  {item.badge && !collapsed && (
                    <span className="nav-badge">{item.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="privacy-note">
            <LockKeyhole size={14} />
            <span>
              Hardware token auth
              <br />
              <strong>Role verified</strong>
            </span>
          </div>
        )}
        <button className="collapse-button" onClick={onCollapse}>
          <span>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</span>
          {!collapsed && "Collapse rail"}
        </button>
      </div>
    </aside>
  );
}

function Dashboard({
  onQuickAction,
  onOpenStudioTab,
  onNavigate,
  users,
  events,
  orders,
  activityFeed,
  platformPulse,
  revenuePulse,
  heatmap,
}: {
  onQuickAction: () => void;
  onOpenStudioTab?: (tab: StudioTab) => void;
  onNavigate: (path: string) => void;
  users: UserRecord[];
  events: EventRecord[];
  orders: OrderRecord[];
  activityFeed: ActivityItem[];
  platformPulse: ChartPoint[];
  revenuePulse: ChartPoint[];
  heatmap: number[];
}) {
  const registeredCount = users.length;
  const eventsCount = events.length;

  return (
    <div className="page-enter">
      <section className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow">
            <Radio size={13} /> Live overview <span className="eyebrow-separator" /> Connected
          </div>
          <h1>Command centre</h1>
          <p>The operating picture across Hive City. All telemetry initializes cleanly from live data.</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button">
            <CalendarDays size={15} /> Last 7 days <ChevronDown size={14} />
          </button>
          <button className="primary-button" onClick={onQuickAction}>
            <Plus size={16} /> Quick action
          </button>
        </div>
      </section>

      <div className="preview-banner">
        <Database size={15} />
        <span>
          <strong>Live Telemetry Ready</strong> — counters, tables, and feeds initialize empty until real user activity is recorded.
        </span>
        <button onClick={() => toast.info("Live data connectors active and awaiting real signals.")}>Status</button>
      </div>

      {/* Main Feature Banner & Secondary Metrics */}
      <section className="command-feature-grid">
        <article className="feature-performance">
          <div className="feature-top">
            <span className="feature-kicker">PLATFORM PERFORMANCE</span>
            <span className="feature-badge">
              <i /> Live collection window
            </span>
          </div>
          <div className="feature-main">
            <div>
              <p className="feature-label">Registered community</p>
              <h2>{registeredCount}</h2>
              <p className="feature-copy">People currently moving through the Hive City ecosystem.</p>
              <div className="feature-statline">
                <strong>{registeredCount > 0 ? `+${registeredCount}` : "0%"}</strong>
                <span>growth vs. prior window</span>
              </div>
            </div>
            <div className="feature-visual" aria-hidden="true">
              <div className="feature-visual-label">USER ACTIVITY / 7D</div>
              <div className="feature-bars">
                {platformPulse.length > 0 ? (
                  platformPulse.map((point, index) => (
                    <i key={index} style={{ height: `${Math.min(100, Math.max(8, (point.users || 0) / 10))}%` }} />
                  ))
                ) : (
                  [0, 0, 0, 0, 0, 0, 0].map((_, index) => (
                    <i key={index} style={{ height: "4px", opacity: 0.35 }} />
                  ))
                )}
              </div>
              <div className="feature-visual-foot">
                <span>Mon</span>
                <span>Sun</span>
              </div>
            </div>
          </div>
          <div className="feature-footer">
            <span>
              <Users size={14} /> {registeredCount} active members today
            </span>
            <span>
              <Activity size={14} /> 0 km logged this month
            </span>
          </div>
        </article>

        <aside className="secondary-metrics">
          <div className="metric-intro">
            <span className="panel-eyebrow">SECONDARY METRICS</span>
            <h2>Small signals, clear decisions.</h2>
          </div>
          <div className="metric-item">
            <span className="metric-item-icon">
              <Users size={15} />
            </span>
            <div>
              <strong>{registeredCount}</strong>
              <span>New users</span>
            </div>
            <em>0%</em>
          </div>
          <div className="metric-item">
            <span className="metric-item-icon">
              <Ticket size={15} />
            </span>
            <div>
              <strong>{eventsCount > 0 ? "100%" : "—"}</strong>
              <span>Event attendance</span>
            </div>
            <em>0%</em>
          </div>
          <div className="metric-item">
            <span className="metric-item-icon">
              <CreditCard size={15} />
            </span>
            <div>
              <strong>₹0</strong>
              <span>Revenue this month</span>
            </div>
            <em>0%</em>
          </div>
          <div className="metric-item">
            <span className="metric-item-icon">
              <CalendarDays size={15} />
            </span>
            <div>
              <strong>{eventsCount}</strong>
              <span>Active events</span>
            </div>
            <em>0</em>
          </div>
        </aside>
      </section>

      {/* Charts Row */}
      <section className="dashboard-grid main-chart-row">
        <div className="surface chart-panel pulse-panel">
          <PanelHeader
            eyebrow="PLATFORM PULSE"
            title="Growth over time"
          />
          <div className="chart-legend">
            <span>
              <i className="legend-dot cyan-dot" /> Active users
            </span>
            <span>
              <i className="legend-dot violet-dot" /> Running sessions
            </span>
            <span className="chart-period">
              <button className="period-active">7D</button>
              <button>30D</button>
              <button>90D</button>
            </span>
          </div>
          <div className="chart-wrap chart-wrap-large">
            {platformPulse.length > 0 ? (
              <div>{/* Render chart when live telemetry array is populated */}</div>
            ) : (
              <div className="empty-state-chart">
                <BarChart3 size={28} />
                <span>No telemetry recorded yet</span>
                <small>Active user growth and running sessions will chart here in real-time as users participate.</small>
              </div>
            )}
          </div>
          <div className="chart-footnote">
            <span>
              <strong>0%</strong> growth comparison
            </span>
            <span>
              Peak: <strong>{registeredCount}</strong> active users
            </span>
          </div>
        </div>

        <div className="surface chart-panel revenue-panel">
          <PanelHeader
            eyebrow="REVENUE PERFORMANCE"
            title="Two engines, one city"
          />
          <div className="revenue-total">
            <strong>₹0</strong>
            <span className="status-pill">0%</span>
          </div>
          <div className="chart-wrap short">
            {revenuePulse.length > 0 ? (
              <div>{/* Render when revenue records arrive */}</div>
            ) : (
              <div className="empty-state-chart">
                <CreditCard size={24} />
                <span>No transactions recorded</span>
                <small>Ticket bookings and marketplace sales will chart here.</small>
              </div>
            )}
          </div>
          <div className="revenue-keys">
            <span>
              <i className="legend-dot cyan-dot" /> Tickets <strong>₹0</strong>
            </span>
            <span>
              <i className="legend-dot amber-dot" /> Marketplace <strong>₹0</strong>
            </span>
          </div>
        </div>
      </section>

      {/* Feeds Grid: Events, Users, Orders */}
      <section className="editorial-grid">
        <div className="surface editorial-panel">
          <PanelHeader
            eyebrow="UPCOMING EVENTS"
            title="What’s next in the city"
            action={
              <button className="text-button" onClick={() => onNavigate("/events")}>
                View all
              </button>
            }
          />
          <div className="event-list">
            {events.length > 0 ? (
              events.slice(0, 3).map((event) => (
                <div className="event-row" key={event.name}>
                  <div className="event-date">
                    <strong>{event.date.split(" ")[0]}</strong>
                    <span>{event.date.split(" ")[2] || "REC"}</span>
                  </div>
                  <div>
                    <strong>{event.name}</strong>
                    <span>
                      {event.type} · {event.bookings}
                    </span>
                  </div>
                  <span className={`status-pill ${event.status.toLowerCase()}`}>{event.status}</span>
                </div>
              ))
            ) : (
              <div className="empty-state-mini">
                <CalendarDays size={22} />
                <span>No upcoming events scheduled</span>
              </div>
            )}
          </div>
        </div>

        <div className="surface editorial-panel">
          <PanelHeader
            eyebrow="RECENT REGISTRATIONS"
            title="New energy"
            action={
              <button className="text-button" onClick={() => onNavigate("/users")}>
                View directory
              </button>
            }
          />
          <div className="registration-list">
            {users.length > 0 ? (
              users.slice(0, 4).map((user) => (
                <div
                  className="registration-row"
                  key={user.uid || user.email}
                  onClick={() => onNavigate("/users")}
                  style={{ cursor: "pointer" }}
                >
                  <span className={`avatar avatar-${user.accent || "cyan"}`}>
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.name} />
                    ) : (
                      (user.name || "U")
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                    )}
                  </span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <strong>{user.name}</strong>
                      {user.status === "suspended" && (
                        <span className="status-pill suspended" style={{ fontSize: "9px", padding: "1px 6px" }}>
                          SUSP
                        </span>
                      )}
                    </div>
                    <span>{user.activity}</span>
                  </div>
                  <small className="num">{user.joined}</small>
                </div>
              ))
            ) : (
              <div className="empty-state-mini">
                <Users size={22} />
                <span>No registered athletes in Firestore yet</span>
              </div>
            )}
          </div>
        </div>

        <div className="surface editorial-panel">
          <PanelHeader
            eyebrow="RECENT ORDERS"
            title="Commerce in motion"
          />
          <div className="order-list">
            {orders.length > 0 ? (
              orders.slice(0, 3).map((order) => (
                <div className="order-row" key={order.id}>
                  <div>
                    <strong>{order.item}</strong>
                    <span>
                      {order.id} · {order.customer}
                    </span>
                  </div>
                  <div>
                    <strong>{order.amount}</strong>
                    <span className={`status-pill ${order.status.toLowerCase()}`}>{order.status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state-mini">
                <Package size={22} />
                <span>No orders placed yet</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tactical Map & Activity Stream */}
      <section className="dashboard-grid lower-grid">
        <div className="surface tactical-panel">
          <PanelHeader
            eyebrow="HIVE PLAY / LIVE OPS"
            title="Arenas & tactical geo-engine"
            action={
              <button className="text-button" onClick={() => onNavigate("/hive-play")}>
                Open operations
              </button>
            }
          />
          <div className="tactical-map">
            <div className="map-grid-lines" />
            <div className="map-label">
              METROPOLIS SECTOR 07 <span>GPS SYNCED</span>
            </div>
            <div className="map-safe-zone">
              <span className="safe-label">ACTIVE SAFE ZONE</span>
            </div>
          </div>
          <div className="arena-status-row">
            <div>
              <span className="status-label">Active lobbies</span>
              <strong>0</strong>
            </div>
            <div>
              <span className="status-label">Agents in play</span>
              <strong>0</strong>
            </div>
            <div>
              <span className="status-label">Safe zone coverage</span>
              <strong>—</strong>
            </div>
          </div>
        </div>

        <div className="surface activity-panel">
          <PanelHeader
            eyebrow="ACTIVITY STREAM"
            title="Real-time pulse"
            action={
              <button
                className="secondary-button small-button"
                onClick={() => toast.info("Activity stream is listening for incoming signals.")}
              >
                <RefreshCw size={14} /> Refresh
              </button>
            }
          />
          <div className="activity-list">
            {activityFeed.length > 0 ? (
              activityFeed.map((item) => {
                const Icon = item.icon;
                return (
                  <div className="activity-item" key={item.title}>
                    <div className={`activity-icon ${item.tone}`}>
                      <Icon size={15} />
                    </div>
                    <div className="activity-copy">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <time>{item.time}</time>
                  </div>
                );
              })
            ) : (
              <div className="empty-state-mini">
                <Activity size={22} />
                <span>No live activity stream recorded</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Bottom Grid: Heatmap & Quick Actions */}
      <section className="dashboard-grid bottom-grid">
        <div className="surface heat-panel">
          <PanelHeader
            eyebrow="MOVEMENT / REGIONS"
            title="Privacy-safe regional activity"
          />
          <div className="heatmap-wrap">
            {heatmap.length > 0 ? (
              <>
                <div className="heatmap-ylabels">
                  <span>AM</span>
                  <span>NOON</span>
                  <span>PM</span>
                  <span>NIGHT</span>
                </div>
                <div className="heatmap">
                  <div className="heatmap-week-labels">
                    {Array.from({ length: 12 }, (_, i) => (
                      <span key={i}>W{i + 1}</span>
                    ))}
                  </div>
                  <div className="heatmap-grid">
                    {heatmap.map((level, index) => (
                      <span key={index} className={`heat-cell level-${level}`} />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state-chart" style={{ width: "100%" }}>
                <Map size={26} />
                <span>No regional movement heatmap data</span>
                <small>Heatmaps aggregate automatically once participants log running and movement sessions.</small>
              </div>
            )}
          </div>
          <div className="heatmap-caption">
            <span>
              <i className="legend-dot cyan-dot" /> Movement volume
            </span>
            <span>Aggregated by city region · privacy-safe</span>
          </div>
        </div>

        <div className="surface quick-panel">
          <PanelHeader eyebrow="DISPATCH" title="Quick actions" />
          <div className="quick-actions">
            <QuickAction
              icon={CalendarDays}
              label="Create event"
              tone="cyan"
              onClick={() => (onOpenStudioTab ? onOpenStudioTab("event") : onQuickAction())}
            />
            <QuickAction
              icon={Package}
              label="Marketplace"
              tone="amber"
              onClick={() => onNavigate("/marketplace")}
            />
            <QuickAction
              icon={ClipboardList}
              label="Publish recipe"
              tone="violet"
              onClick={() => (onOpenStudioTab ? onOpenStudioTab("nutrient") : onNavigate("/event-hosting"))}
            />
            <QuickAction
              icon={Send}
              label="Send notification"
              tone="rose"
              onClick={() => toast("Notification composer opened.")}
            />
          </div>
          <div className="dispatch-note">
            <Zap size={15} />
            <span>
              <strong>Dispatch queue:</strong> All operational modules are online and ready for data entry.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function OperationalPage({
  path,
  meta,
  search,
  users,
  usersLoading,
  events,
  allEvents,
  eventBookings,
  nutrients,
  products,
  orders,
  studioTab,
  sheetSyncStatus,
  onSyncSheet,
  firestoreSyncing,
  firestoreSyncResult,
  onSyncFirestoreToSheet,
  onOpenSheetConfig,
  onUser,
  onToggleStatus,
  onApproveSuggestion,
  onDismissSuggestion,
  onCreateEvent,
  onCreateNutrient,
  onCreateProduct,
  onMarkEventCompleted,
  onDeleteEvent,
  onDeleteEventBookings,
  onDeleteNutrient,
  onDeleteProduct,
  sponsors,
  sponsorsLoading,
  onDeleteSponsor,
  sessionModalOpen,
  onCloseSessionModal,
  campaignModalOpen,
  onOpenCampaignModal,
  onCloseCampaignModal,
  onQuickAction,
}: {
  path: string;
  meta: { eyebrow: string; title: string; description: string };
  search: string;
  users: UserRecord[];
  usersLoading: boolean;
  events: EventRecord[];
  allEvents?: EventRecord[];
  eventBookings?: EventBookingRecord[];
  nutrients: UnifiedNutrientRecipe[];
  products: UnifiedMarketplaceProduct[];
  orders: OrderRecord[];
  studioTab?: StudioTab;
  sheetSyncStatus?: {
    configured: boolean;
    connected?: boolean;
    needsScriptProperty?: boolean;
    scriptUrl: string;
    lastSynced: string | null;
    loading: boolean;
    error: string | null;
  };
  onSyncSheet?: () => void;
  firestoreSyncing?: boolean;
  firestoreSyncResult?: { scanned: number; synced: number; failed: number; skipped: number } | null;
  onSyncFirestoreToSheet?: () => void;
  onOpenSheetConfig?: () => void;
  onUser: (user: UserRecord) => void;
  onToggleStatus: (user: UserRecord) => void;
  onApproveSuggestion: (user: UserRecord, index: number, field: string, val: any) => void;
  onDismissSuggestion: (user: UserRecord, index: number) => void;
  onCreateEvent?: (payload: CreateEventFormPayload) => Promise<void>;
  onCreateNutrient?: (payload: CreateNutrientFormPayload) => Promise<void>;
  onCreateProduct?: (payload: CreateProductFormPayload) => Promise<void>;
  onMarkEventCompleted?: (event: EventRecord) => void;
  onDeleteEvent?: (event: EventRecord) => void;
  onDeleteEventBookings?: (eventId: string, eventTitle: string) => void;
  onDeleteNutrient?: (recipe: UnifiedNutrientRecipe) => void;
  onDeleteProduct?: (product: UnifiedMarketplaceProduct) => void;
  sponsors?: SponsorRecord[];
  sponsorsLoading?: boolean;
  onDeleteSponsor?: (sponsor: SponsorRecord) => void;
  sessionModalOpen?: boolean;
  onCloseSessionModal?: () => void;
  campaignModalOpen?: boolean;
  onOpenCampaignModal?: () => void;
  onCloseCampaignModal?: () => void;
  onQuickAction: () => void;
}) {
  const [filter, setFilter] = useState("All");
  useEffect(() => {
    setFilter("All");
  }, [path]);

  const isStudio = path === "/event-hosting";
  const isBookings = path === "/bookings";
  const isSponsors = path === "/sponsors";
  const isCommunities = path === "/communities";
  const isCampaigns = path === "/campaigns";
  const isNotifications = path === "/notifications";
  const isSupport = path === "/support";
  const isAdmins = path === "/admins";
  const isSettings = path === "/settings";
  const isPlay = path === "/hive-play";
  const isShowcasePage = [
    "/events",
    "/nutrition",
    "/recipes",
    "/marketplace",
    "/products",
  ].includes(path);
  const isTable = [
    "/users",
    "/events",
    "/nutrition",
    "/recipes",
    "/marketplace",
    "/products",
  ].includes(path);

  // Strictly enforce: ONLY Events Hosting Studio contains creation forms; showcase, bookings, notifications, support, admins & settings pages have ZERO creation buttons
  const showHeaderCreateButton = !isStudio && !isShowcasePage && !isBookings && !isNotifications && !isSupport && !isAdmins && !isSettings && path !== "/users";

  if (isPlay) {
    return (
      <div className="page-enter relative">
        <div
          className="pointer-events-none select-none"
          style={{ filter: "blur(3px)", opacity: 0.7 }}
          aria-hidden="true"
        >
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <Command size={13} /> {meta.eyebrow}
              </div>
              <h1>{meta.title}</h1>
              <p>{meta.description}</p>
            </div>
            <div className="heading-actions">
              <button className="secondary-button" tabIndex={-1}>
                <CalendarDays size={15} /> Today <ChevronDown size={14} />
              </button>
              <button className="primary-button" tabIndex={-1}>
                <Plus size={16} /> Create new
              </button>
            </div>
          </section>
          <PlayPage />
        </div>

        <div
          className="absolute inset-0 z-20 flex items-start justify-center px-6 pt-28 sm:pt-36 pointer-events-none"
        >
          <div
            className="pointer-events-auto bg-white rounded-3xl border border-neutral-200/80 shadow-lg px-8 py-10 max-w-xl w-full text-center"
            style={{ backgroundColor: "#FFFFFF", color: "#111827" }}
          >
            <div className="w-14 h-14 rounded-full bg-[#F2FBE0] flex items-center justify-center mx-auto mb-5">
              <Wrench size={24} stroke="#181A18" strokeWidth={2} />
            </div>
            <h2
              className="text-2xl font-bold text-neutral-900 tracking-tight mb-3"
              style={{ color: "#111827" }}
            >
              Backend Work Is Going On
            </h2>
            <p
              className="text-sm sm:text-base text-neutral-500 leading-relaxed max-w-md mx-auto mb-6"
              style={{ color: "#6B7280" }}
            >
              We are currently optimizing backend services for this section. All community content remains visible below and full sync will resume shortly.
            </p>
            <span
              className="inline-flex items-center gap-2 rounded-full bg-[#F4FCE3] border border-[#E2F5BE] px-4 py-1.5 text-xs sm:text-sm font-semibold text-neutral-800"
              style={{ color: "#1F2937" }}
            >
              <span
                className="w-2 h-2 rounded-full bg-[#A3E635]"
                style={{ boxShadow: "0 0 8px rgba(163, 230, 53, 0.85)" }}
              />
              Platform Maintenance in Progress
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <Command size={13} /> {meta.eyebrow}
          </div>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button">
            <CalendarDays size={15} /> Today <ChevronDown size={14} />
          </button>
          {showHeaderCreateButton && (
            <button className="primary-button" onClick={onQuickAction}>
              <Plus size={16} /> Create new
            </button>
          )}
        </div>
      </section>

      {isStudio && onCreateEvent && onCreateNutrient && onCreateProduct ? (
        <EventsHostingStudio
          initialTab={studioTab || "event"}
          onCreateEvent={onCreateEvent}
          onCreateNutrient={onCreateNutrient}
          onCreateProduct={onCreateProduct}
        />
      ) : isBookings ? (
        <TicketingBookingsView
          bookings={eventBookings || []}
          events={allEvents || events}
          search={search}
          filter={filter}
          setFilter={setFilter}
          onDeleteEventBookings={onDeleteEventBookings}
        />
      ) : isSponsors ? (
        <SponsorsView
          sponsors={sponsors || []}
          loading={Boolean(sponsorsLoading)}
          search={search}
          onDeleteSponsor={onDeleteSponsor}
        />
      ) : isCommunities ? (
        <CommunitySessionsAdmin
          search={search}
          createModalOpen={Boolean(sessionModalOpen)}
          onCloseCreateModal={() => onCloseSessionModal && onCloseSessionModal()}
        />
      ) : isCampaigns ? (
        <CampaignStudioAdmin
          search={search}
          createModalOpen={Boolean(campaignModalOpen)}
          onOpenCreateModal={() => onOpenCampaignModal && onOpenCampaignModal()}
          onCloseCreateModal={() => onCloseCampaignModal && onCloseCampaignModal()}
        />
      ) : isNotifications ? (
        <NotificationsDeliveryAdmin search={search} />
      ) : isSupport ? (
        <SupportCentreAdmin search={search} />
      ) : isAdmins ? (
        <AdminUsersRolesView
          users={users}
          loading={usersLoading}
          search={search}
          onRefreshUsers={() => onSyncSheet && onSyncSheet()}
        />
      ) : isSettings ? (
        <SettingsAdminView />
      ) : isPlay ? (
        <PlayPage />
      ) : isTable ? (
        <TablePage
          path={path}
          filter={filter}
          setFilter={setFilter}
          users={users}
          usersLoading={usersLoading}
          events={events}
          nutrients={nutrients}
          products={products}
          orders={orders}
          search={search}
          sheetSyncStatus={sheetSyncStatus}
          onSyncSheet={onSyncSheet}
          firestoreSyncing={firestoreSyncing}
          firestoreSyncResult={firestoreSyncResult}
          onSyncFirestoreToSheet={onSyncFirestoreToSheet}
          onOpenSheetConfig={onOpenSheetConfig}
          onUser={onUser}
          onToggleStatus={onToggleStatus}
          onApproveSuggestion={onApproveSuggestion}
          onDismissSuggestion={onDismissSuggestion}
          onMarkEventCompleted={onMarkEventCompleted}
          onDeleteEvent={onDeleteEvent}
          onDeleteNutrient={onDeleteNutrient}
          onDeleteProduct={onDeleteProduct}
          onQuickAction={onQuickAction}
        />
      ) : (
        <ContentPage path={path} onQuickAction={onQuickAction} />
      )}
    </div>
  );
}

function TicketingBookingsView({
  bookings,
  events,
  search,
  filter,
  setFilter,
  onDeleteEventBookings,
}: {
  bookings: EventBookingRecord[];
  events: EventRecord[];
  search: string;
  filter: string;
  setFilter: (value: string) => void;
  onDeleteEventBookings?: (eventId: string, eventTitle: string) => void;
}) {
  const [expandedEventIds, setExpandedEventIds] = useState<Record<string, boolean>>({});

  const toggleParticipants = (eventId: string) => {
    setExpandedEventIds((prev) => ({ ...prev, [eventId]: !prev[eventId] }));
  };

  const eventLookup = useMemo(() => {
    const map: Record<string, EventRecord> = {};
    for (const evt of events) {
      if (evt.id) map[String(evt.id)] = evt;
    }
    return map;
  }, [events]);

  const groupedEvents = useMemo(() => {
    type GroupedBookedEvent = {
      eventId: string;
      eventTitle: string;
      eventImage: string;
      eventDate: string;
      location: string;
      feeAmount: number;
      feeLabel: string;
      status: string;
      participants: EventBookingRecord[];
    };
    const groupMap: Record<string, GroupedBookedEvent> = {};

    for (const b of bookings) {
      const eid = String(b.eventId || "").trim();
      if (!eid) continue;
      const evt = eventLookup[eid];
      const feeNum = parseFeeNumber(b.feeAmount ?? evt?.feeAmount ?? 0);
      const existing = groupMap[eid];

      if (!existing) {
        const rawDate = b.eventDate || evt?.eventDate || evt?.date || "";
        groupMap[eid] = {
          eventId: eid,
          eventTitle: b.eventTitle || evt?.name || evt?.title || "Hivecity Event",
          eventImage: b.eventImage || evt?.imageUrl || "",
          eventDate: rawDate ? formatEventSchedule(rawDate) : "Date TBD",
          location: b.location || evt?.location || "Hive City",
          feeAmount: feeNum,
          feeLabel: formatEventFee(feeNum),
          status: evt?.status || "upcoming",
          participants: [b],
        };
      } else {
        // Deduplicate by booking id / userId+bookedAt
        const key = b.id || `${b.userId}_${b.bookedAt}`;
        const alreadyIn = existing.participants.some(
          (p) => (p.id || `${p.userId}_${p.bookedAt}`) === key
        );
        if (!alreadyIn) existing.participants.push(b);
      }
    }

    return Object.values(groupMap)
      .map((g) => ({
        ...g,
        participants: [...g.participants].sort((a, b) =>
          String(b.bookedAt || "").localeCompare(String(a.bookedAt || ""))
        ),
      }))
      .sort((a, b) => {
        const latestA = a.participants[0]?.bookedAt || "";
        const latestB = b.participants[0]?.bookedAt || "";
        return latestB.localeCompare(latestA);
      });
  }, [bookings, eventLookup]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupedEvents
      .filter((g) => {
        if (filter === "Free") return g.feeAmount <= 0;
        if (filter === "Paid") return g.feeAmount > 0;
        return true;
      })
      .filter((g) => {
        if (!q) return true;
        const participantText = g.participants
          .map((p) => `${p.userName || ""} ${p.userId || ""} ${p.userEmail || ""}`)
          .join(" ");
        return `${g.eventTitle} ${g.location} ${g.eventDate} ${g.feeLabel} ${participantText}`
          .toLowerCase()
          .includes(q);
      });
  }, [groupedEvents, filter, search]);

  const totalParticipants = filteredGroups.reduce((sum, g) => sum + g.participants.length, 0);

  const formatBookingDateTime = (raw?: string) => {
    if (!raw) return "Just now";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="surface table-surface">
      <div className="table-toolbar">
        <div className="toolbar-copy" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span className="result-count">
            {filteredGroups.length} booked event{filteredGroups.length === 1 ? "" : "s"} · {totalParticipants} participant{totalParticipants === 1 ? "" : "s"}
          </span>
          <span className="live-sync-indicator" title="Synced automatically with User Event bookings">
            <i className="status-pulse" /> Live Attendance Synced
          </span>
        </div>
        <div className="toolbar-actions">
          <div className="select-wrap">
            <Filter size={14} />
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              {["All", "Free", "Paid"].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>
        </div>
      </div>

      {filteredGroups.length > 0 ? (
        <div style={{ padding: "18px", display: "grid", gap: "16px" }}>
          {filteredGroups.map((group) => {
            const isExpanded = Boolean(expandedEventIds[group.eventId]);
            return (
              <div
                key={group.eventId}
                className="surface"
                style={{
                  border: "1px solid var(--bd)",
                  borderRadius: "14px",
                  overflow: "hidden",
                  background: "var(--surface)",
                }}
              >
                {/* BookMyShow-style Event Panel */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "18px",
                    padding: "16px 18px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: "1 1 360px", minWidth: 0 }}>
                    {group.eventImage ? (
                      <img
                        src={group.eventImage}
                        alt={group.eventTitle}
                        onError={(e) => {
                          const el = e.currentTarget;
                          el.onerror = null;
                          el.style.display = "none";
                        }}
                        style={{
                          width: 132,
                          height: 92,
                          objectFit: "cover",
                          borderRadius: 12,
                          border: "1px solid var(--bd)",
                          flexShrink: 0,
                          display: "block",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 132,
                          height: 92,
                          borderRadius: 12,
                          border: "1px solid var(--bd)",
                          background: "var(--surface-soft)",
                          display: "grid",
                          placeItems: "center",
                          color: "var(--mu)",
                          flexShrink: 0,
                        }}
                      >
                        <Ticket size={24} />
                      </div>
                    )}

                    <div style={{ minWidth: 0, display: "grid", gap: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--tx)" }}>
                          {group.eventTitle}
                        </h3>
                        <span className="status-pill active" style={{ fontSize: "11px" }}>
                          {group.feeLabel}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "14px",
                          flexWrap: "wrap",
                          fontSize: "12px",
                          color: "var(--mu)",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                          <CalendarDays size={13} /> {group.eventDate}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                          <MapPin size={13} /> {group.location}
                        </span>
                        <span
                          className="num"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            color: "var(--tx)",
                            fontWeight: 600,
                          }}
                        >
                          <Users size={13} /> {group.participants.length} Booked Participant
                          {group.participants.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Separate Delete Option Per Event */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    {onDeleteEventBookings && (
                      <button
                        type="button"
                        className="secondary-button small-button"
                        onClick={() => onDeleteEventBookings(group.eventId, group.eventTitle)}
                        title={`Delete booking data for ${group.eventTitle} from this Admin page`}
                        style={{
                          minHeight: "32px",
                          padding: "5px 12px",
                          fontSize: "12px",
                          color: "#ef4444",
                          borderColor: "rgba(239, 68, 68, 0.35)",
                        }}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* View Participants Action Bar Directly Below Event Panel */}
                <div
                  style={{
                    borderTop: "1px solid var(--bd)",
                    background: "var(--surface-soft)",
                    padding: "10px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className={isExpanded ? "secondary-button small-button" : "primary-button small-button"}
                    onClick={() => toggleParticipants(group.eventId)}
                    style={{ minHeight: "30px", padding: "5px 12px", fontSize: "12px" }}
                  >
                    <Users size={13} />
                    {isExpanded ? "Hide Participants" : "View Participants"}
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <span className="table-muted" style={{ fontSize: "12px" }}>
                    {group.participants.length} confirmed ticket{group.participants.length === 1 ? "" : "s"}
                  </span>
                </div>

                {/* Expandable Participants Table Using Site's Default Table Styling */}
                {isExpanded && (
                  <div className="table-wrap" style={{ borderTop: "1px solid var(--bd)" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Participant Name</th>
                          <th>User ID</th>
                          <th>Booking Date / Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.participants.map((p, idx) => (
                          <tr key={p.id || `${group.eventId}_${p.userId}_${idx}`}>
                            <td>
                              <div className="table-primary">
                                <strong>{p.userName || "Hive Athlete"}</strong>
                                {p.userEmail && (
                                  <span style={{ color: "var(--mu)", fontSize: "11px" }}>{p.userEmail}</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <code style={{ fontSize: "12px", color: "var(--tx)" }}>
                                {p.userId || "guest-athlete"}
                              </code>
                            </td>
                            <td>
                              <span className="table-muted num">{formatBookingDateTime(p.bookedAt)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Ticket size={22} />
          <h4>No event bookings yet</h4>
          <p>
            {search
              ? `No bookings matching "${search}".`
              : "No event bookings yet. User event bookings will appear here automatically."}
          </p>
        </div>
      )}

      <div className="table-footer">
        <span>
          Showing {filteredGroups.length} booked event{filteredGroups.length === 1 ? "" : "s"} ({totalParticipants} participant{totalParticipants === 1 ? "" : "s"})
        </span>
      </div>
    </div>
  );
}

function PanelHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="panel-header">
      <div>
        <span className="panel-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span className={`quick-icon ${tone}`}>
        <Icon size={16} />
      </span>
      <span>{label}</span>
      <ChevronRight size={14} />
    </button>
  );
}

function NotificationPopover({ onClose }: { onClose: () => void }) {
  return (
    <div className="popover notification-popover">
      <div className="popover-head">
        <strong>Notifications</strong>
        <button className="icon-button small" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="empty-state-mini" style={{ border: 0 }}>
        <Bell size={20} />
        <span>No unread notifications</span>
      </div>
      <button className="popover-link" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function ProfilePopover({
  admin,
  roleLabel,
  onClose,
  onLogout,
}: {
  admin: AdminUser;
  roleLabel: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  const adminInitials = admin.name
    ? admin.name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
    : "AD";

  return (
    <div className="popover profile-popover">
      <div className="profile-popover-head">
        <span className="avatar avatar-cyan">{adminInitials}</span>
        <div>
          <strong>{admin.name}</strong>
          <span>{roleLabel}</span>
        </div>
      </div>
      <div style={{ padding: "8px 6px", fontSize: "11px", color: "var(--mu)" }}>
        <span>Signed in as:</span>
        <strong style={{ display: "block", color: "var(--tx)", marginTop: "2px" }}>
          {admin.email}
        </strong>
      </div>
      <button
        onClick={() => {
          onClose();
          toast.info("Security clearance verified.");
        }}
      >
        <ShieldCheck size={15} /> Security status
      </button>
      <div className="popover-divider" />
      <button className="danger-link" onClick={onLogout}>
        <LogOut size={15} /> Sign out
      </button>
    </div>
  );
}

function QuickActionModal({
  editingEvent,
  onClose,
  onSaveEvent,
  onDone,
}: {
  editingEvent?: EventRecord | null;
  onClose: () => void;
  onSaveEvent?: (
    payload: {
      title: string;
      category: string;
      description: string;
      location: string;
      eventDate: string;
      endDate?: string;
      status: HiveEventStatus;
      feeAmount: number;
      termsAndConditions: string;
      bookingUrl: string;
      capacity: number;
    },
    existingId?: string
  ) => void | Promise<void>;
  onDone: (title: string, category: string) => void;
}) {
  const defaultTomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [name, setName] = useState(editingEvent?.title || editingEvent?.name || "");
  const [category, setCategory] = useState(
    editingEvent ? (editingEvent.type || "Running") : "Running"
  );
  const [description, setDescription] = useState(editingEvent?.description || "");
  const [location, setLocation] = useState(editingEvent?.location || "");
  const [eventDate, setEventDate] = useState(editingEvent?.eventDate || defaultTomorrow);
  const [endDate, setEndDate] = useState(editingEvent?.endDate || "");
  const [status, setStatus] = useState<HiveEventStatus>(
    editingEvent
      ? resolveEventStatus({
        status: editingEvent.status,
        completed: editingEvent.completed,
        eventDate: editingEvent.eventDate,
        date: editingEvent.date,
      })
      : "upcoming"
  );
  const [feeAmount, setFeeAmount] = useState(
    editingEvent?.feeAmount !== undefined ? String(editingEvent.feeAmount) : "0"
  );
  const [termsAndConditions, setTermsAndConditions] = useState(
    editingEvent?.termsAndConditions || ""
  );
  const [bookingUrl, setBookingUrl] = useState(editingEvent?.bookingUrl || "");
  const [capacity, setCapacity] = useState(
    editingEvent?.capacity !== undefined ? String(editingEvent.capacity) : "100"
  );

  const isEventTab =
    Boolean(editingEvent) ||
    ["Running", "HIVE PLAY", "Community", "RUNNING", "COMMUNITY"].includes(category);

  const handleSubmit = () => {
    if (isEventTab && onSaveEvent) {
      if (!name.trim()) {
        toast.error("Please enter an event title.");
        return;
      }
      if (!eventDate.trim()) {
        toast.error("Please select an event date.");
        return;
      }
      void onSaveEvent(
        {
          title: name.trim(),
          category,
          description,
          location,
          eventDate,
          endDate,
          status,
          feeAmount: parseFeeNumber(feeAmount),
          termsAndConditions,
          bookingUrl,
          capacity: Math.max(1, Number(capacity) || 100),
        },
        editingEvent?.id
      );
      return;
    }
    onDone(name || "New Record", category);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: isEventTab ? 620 : undefined, maxHeight: "90vh", overflowY: "auto" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="panel-eyebrow">
              {editingEvent ? "EVENTS / EDIT EVENT" : "DISPATCH / NEW RECORD"}
            </span>
            <h2>{editingEvent ? `Edit "${editingEvent.name}"` : "Create new record"}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        {!editingEvent && (
          <div className="modal-tabs">
            <button className={`modal-tab ${isEventTab ? "active" : ""}`} onClick={() => setCategory("Running")}>
              Event
            </button>
            <button className={`modal-tab ${category === "Product" ? "active" : ""}`} onClick={() => setCategory("Product")}>
              Product
            </button>
            <button className={`modal-tab ${category === "Recipe" ? "active" : ""}`} onClick={() => setCategory("Recipe")}>
              Recipe
            </button>
            <button className={`modal-tab ${category === "Notification" ? "active" : ""}`} onClick={() => setCategory("Notification")}>
              Notification
            </button>
          </div>
        )}
        <label className="field-label">
          {isEventTab ? "Event Title" : "Record Title / Name"}
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Sunset City 5K Run"
          />
        </label>
        <div className="form-grid">
          <label className="field-label">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="Running">Running</option>
              <option value="HIVE PLAY">HIVE PLAY</option>
              <option value="Nutrition">Nutrition</option>
              <option value="Community">Community</option>
            </select>
          </label>
          {isEventTab ? (
            <label className="field-label">
              Lifecycle Status
              <select value={status} onChange={(e) => setStatus(e.target.value as HiveEventStatus)}>
                <option value="upcoming">Upcoming</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          ) : (
            <label className="field-label">
              Visibility
              <select defaultValue="Draft">
                <option>Draft</option>
                <option>Internal review</option>
                <option>Published</option>
              </select>
            </label>
          )}
        </div>
        {isEventTab && (
          <>
            <div className="form-grid">
              <label className="field-label">
                Event Date
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </label>
              <label className="field-label">
                End Date (optional)
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>
            <div className="form-grid">
              <label className="field-label">
                Location
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Marina Beach Promenade, Chennai"
                />
              </label>
              <label className="field-label">
                Entry Fee (₹ — 0 for Free)
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  placeholder="e.g. 500"
                />
              </label>
            </div>
            <div className="form-grid">
              <label className="field-label">
                External Booking URL (optional)
                <input
                  type="url"
                  value={bookingUrl}
                  onChange={(e) => setBookingUrl(e.target.value)}
                  placeholder="https://... (blank uses in-app confirmation)"
                />
              </label>
              <label className="field-label">
                Capacity
                <input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="100"
                />
              </label>
            </div>
            <label className="field-label">
              Event Description
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe route distance, timing, check-in details…"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--bd)", background: "var(--surface)", color: "var(--tx)", font: "inherit", resize: "vertical" }}
              />
            </label>
            <label className="field-label">
              Terms &amp; Conditions
              <textarea
                rows={3}
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                placeholder="Enter full Terms & Conditions users must read & agree to before booking…"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--bd)", background: "var(--surface)", color: "var(--tx)", font: "inherit", resize: "vertical" }}
              />
            </label>
          </>
        )}
        <div className="modal-note">
          <ClipboardList size={15} />
          <span>
            {isEventTab
              ? "Real-time sync: Published events immediately appear on the User Events page and automatically move from Upcoming → Ongoing on event day."
              : "Real-time persistence: This record will appear immediately in your active operational view."}
          </span>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={handleSubmit}>
            <Check size={16} /> {editingEvent ? "Save event changes" : isEventTab ? "Publish event" : "Save record"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserDrawer({
  user,
  onClose,
  onToggleStatus,
  onApproveSuggestion,
  onDismissSuggestion,
}: {
  user: UserRecord;
  onClose: () => void;
  onToggleStatus: (user: UserRecord) => void;
  onApproveSuggestion: (user: UserRecord, index: number, field: string, val: any) => void;
  onDismissSuggestion: (user: UserRecord, index: number) => void;
}) {
  const isSuspended = user.status === "suspended";

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="user-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="panel-eyebrow">USER 360° / FIRESTORE REAL-TIME</span>
            <h2>Athlete Profile</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close drawer">
            <X size={17} />
          </button>
        </div>

        <div className="drawer-profile">
          <span className={`avatar avatar-${user.accent || "cyan"}`}>
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.name} />
            ) : (
              (user.name || "U")
                .split(" ")
                .map((part) => part[0])
                .join("")
            )}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{user.name}</h3>
            <p>@{user.username || (user.email ? user.email.split("@")[0] : "athlete")}</p>
            <span className={`status-pill ${user.status.toLowerCase()}`}>
              <i className="status-pulse" /> {user.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Quick Status Control Bar */}
        <div className="drawer-status-bar">
          <div>
            <span style={{ fontSize: "10px", color: "var(--mu)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
              Account Access
            </span>
            <strong style={{ display: "block", fontSize: "12px", color: isSuspended ? "var(--rose)" : "var(--ac)" }}>
              {isSuspended ? "Account is Suspended" : "Account is Active"}
            </strong>
          </div>
          <button
            className={`status-toggle-switch ${isSuspended ? "activate" : "suspend"}`}
            onClick={() => onToggleStatus(user)}
          >
            {isSuspended ? (
              <>
                <UserCheck size={14} /> Re-activate
              </>
            ) : (
              <>
                <UserX size={14} /> Suspend
              </>
            )}
          </button>
        </div>

        {/* Engagement & Telemetry Strip */}
        <div className="drawer-stats">
          <div>
            <strong>{user.runsCount || 0}</strong>
            <span>Runs Logged</span>
          </div>
          <div>
            <strong>{user.postsCount || 0}</strong>
            <span>Community Posts</span>
          </div>
          <div>
            <strong>{user.followersCount || 0}</strong>
            <span>Followers</span>
          </div>
        </div>

        {/* Account & Details Grid */}
        <div className="user-drawer-meta-grid">
          <div className="drawer-meta-item">
            <span>Email Address</span>
            <strong>{user.email || "—"}</strong>
          </div>
          <div className="drawer-meta-item">
            <span>Mobile Phone</span>
            <strong>{user.mobile || "Not specified"}</strong>
          </div>
          <div className="drawer-meta-item">
            <span>Registered On</span>
            <strong>{user.joined}</strong>
          </div>
          <div className="drawer-meta-item">
            <span>Last Signal / Login</span>
            <strong>{user.lastLogin}</strong>
          </div>
          <div className="drawer-meta-item">
            <span>Auth Provider</span>
            <strong>{user.provider || "password"}</strong>
          </div>
          <div className="drawer-meta-item">
            <span>Privacy & Visibility</span>
            <strong>
              {user.isPrivate ? "Private" : "Public"} · {user.discoverable ? "Discoverable" : "Unlisted"}
            </strong>
          </div>
        </div>

        {/* Athlete Bio */}
        <div className="drawer-section">
          <span className="panel-eyebrow">ATHLETE BIO</span>
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              color: "var(--tx)",
              lineHeight: 1.6,
              background: "var(--surface-soft)",
              padding: "10px 12px",
              borderRadius: "10px",
              border: "1px solid var(--bd)",
            }}
          >
            {user.bio || "No athlete bio submitted yet."}
          </p>
        </div>

        {/* Profile Suggestions & Edit Requests */}
        <div className="drawer-section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="panel-eyebrow">
              PROFILE SUGGESTIONS ({user.profileSuggestions?.length || 0})
            </span>
            {user.profileSuggestions && user.profileSuggestions.length > 0 && (
              <span className="suggestion-pill">
                <Sparkles size={11} /> Review Required
              </span>
            )}
          </div>

          {user.profileSuggestions && user.profileSuggestions.length > 0 ? (
            user.profileSuggestions.map((sug: any, idx: number) => {
              const field = sug.field || sug.fieldName || "Profile change";
              const currentVal =
                sug.currentValue || (user as any)[field] || "Current profile value";
              const suggestedVal =
                sug.suggestedValue ||
                sug.suggestedBio ||
                sug.suggestedName ||
                sug.value ||
                JSON.stringify(sug);
              const isPending = sug.status !== "approved" && sug.status !== "rejected";

              return (
                <div className="user-drawer-suggestion-card" key={idx}>
                  <div className="suggestion-card-header">
                    <span className="suggestion-field-tag">{field}</span>
                    <span className={`status-pill ${String(sug.status || "pending").toLowerCase()}`}>
                      {String(sug.status || "PENDING").toUpperCase()}
                    </span>
                  </div>
                  <div className="suggestion-diff-box">
                    <div>
                      <span>Current</span>
                      <strong>{String(currentVal)}</strong>
                    </div>
                    <div>
                      <span>Suggested</span>
                      <strong className="suggested">{String(suggestedVal)}</strong>
                    </div>
                  </div>
                  {sug.note && (
                    <small style={{ color: "var(--mu)", fontSize: "11px" }}>
                      Note: {sug.note}
                    </small>
                  )}
                  {isPending && (
                    <div className="suggestion-actions">
                      <button
                        className="suggestion-approve-btn"
                        onClick={() => onApproveSuggestion(user, idx, field, suggestedVal)}
                      >
                        <Check size={13} /> Approve & Apply
                      </button>
                      <button
                        className="suggestion-dismiss-btn"
                        onClick={() => onDismissSuggestion(user, idx)}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div
              style={{
                padding: "14px",
                borderRadius: "10px",
                background: "var(--surface-soft)",
                border: "1px dashed var(--bd)",
                fontSize: "12px",
                color: "var(--mu)",
                textAlign: "center",
              }}
            >
              No profile suggestions submitted by this athlete.
            </div>
          )}
        </div>

        {/* Administrative Quick Actions */}
        <div className="drawer-section">
          <span className="panel-eyebrow">ADMINISTRATIVE ACTIONS</span>
          <button
            className="drawer-action"
            onClick={() => {
              navigator.clipboard.writeText(user.uid);
              toast.success("User UID copied to clipboard.");
            }}
          >
            <Copy size={15} /> Copy Firebase UID{" "}
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "10px",
                color: "var(--mu)",
              }}
            >
              {user.uid.slice(0, 10)}…
            </span>
          </button>
          {user.email && (
            <a className="drawer-action" href={`mailto:${user.email}`}>
              <Mail size={15} /> Send direct email <ChevronRight size={14} />
            </a>
          )}
          <button
            className={`drawer-action ${isSuspended ? "" : "danger"}`}
            onClick={() => onToggleStatus(user)}
          >
            {isSuspended ? (
              <>
                <UserCheck size={15} /> Restore athlete active status <ChevronRight size={14} />
              </>
            ) : (
              <>
                <Archive size={15} /> Suspend user account <ChevronRight size={14} />
              </>
            )}
          </button>
        </div>

        <div className="drawer-footer">
          <LockKeyhole size={14} /> Direct Firestore sync enabled. Modifying status writes to production record.
        </div>
      </aside>
    </div>
  );
}

function GoogleSheetConfigModal({
  currentUrl,
  status,
  onClose,
  onSaved,
}: {
  currentUrl: string;
  status: {
    configured: boolean;
    scriptUrl: string;
    lastSynced: string | null;
    loading: boolean;
    error: string | null;
  };
  onClose: () => void;
  onSaved: (url: string) => void;
}) {
  const [url, setUrl] = useState(currentUrl || status.scriptUrl || "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const handleSaveAndTest = async () => {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      toast.error("Please enter a valid Google Apps Script Web App URL.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // 1. Save URL on server with admin credentials
      await fetch("/api/admin/google-script-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scriptUrl: cleanUrl }),
      });

      // 2. Also save in localStorage for client access
      try {
        localStorage.setItem("hiveGoogleScriptUrl", cleanUrl);
        localStorage.setItem("GOOGLE_SCRIPT_URL", cleanUrl);
      } catch { }

      // 3. Test connection by fetching sheet users with admin credentials
      const testRes = await fetch(`/api/admin/google-sheet-users?url=${encodeURIComponent(cleanUrl)}`, {
        credentials: "include",
      });
      const testData = await testRes.json();

      if (testData.error) {
        setTestResult({
          success: false,
          message: `Connection issue: ${testData.error}`,
        });
        toast.error("Could not fetch user records from Google Apps Script. Check deployment settings.");
      } else {
        const count = testData.count || 0;
        setTestResult({
          success: true,
          message: `Connection verified! Successfully loaded ${count} user record${count === 1 ? "" : "s"} from Google Sheet.`,
        });
        toast.success(`Google Sheet Connected! (${count} users loaded)`);
        onSaved(cleanUrl);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Network error: ${err.message}`,
      });
      toast.error("Failed to connect to Google Apps Script URL.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" style={{ maxWidth: 540 }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="panel-eyebrow">INTEGRATIONS // GOOGLE SHEETS</span>
            <h2>Google Apps Script User Tracking</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--mu)", lineHeight: 1.6 }}>
          Connect your deployed Google Apps Script Web App (<code>Code.gs</code>) to enable Google Sheets tracking. Firestore users appear live here; use “Sync Firestore → Sheets” to manually import the current batch into the sheet.
        </p>

        <label className="field-label">
          Google Apps Script Web App URL (ends with <code>/exec</code>)
          <input
            type="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/AKfycb.../exec"
            style={{ width: "100%", marginTop: 6 }}
          />
        </label>

        {testResult && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              marginTop: "12px",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: testResult.success ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
              border: `1px solid ${testResult.success ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              color: testResult.success ? "#10b981" : "#ef4444",
            }}
          >
            {testResult.success ? <Check size={15} /> : <ShieldAlert size={15} />}
            <span>{testResult.message}</span>
          </div>
        )}

        <div style={{ background: "var(--sf)", padding: "12px 14px", borderRadius: "8px", marginTop: "14px", border: "1px solid var(--bd)" }}>
          <strong style={{ display: "block", fontSize: "12px", color: "var(--tx)", marginBottom: "4px" }}>
            Deployment Quick Checklist (from project root Code.gs):
          </strong>
          <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "11px", color: "var(--mu)", lineHeight: 1.6 }}>
            <li>Spreadsheet has a tab named <strong>"Users"</strong> (or let the script auto-create it).</li>
            <li>In Apps Script: <strong>Deploy &gt; New deployment &gt; Web app</strong>.</li>
            <li>Set <strong>Execute as:</strong> <code>Me</code> and <strong>Who has access:</strong> <code>Anyone</code>.</li>
            <li>Copy the <code>/exec</code> Web App URL and paste it above.</li>
          </ol>
        </div>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={testing || !url.trim()}
            onClick={handleSaveAndTest}
          >
            {testing ? (
              <>
                <Hexagon size={14} className="animate-spin" /> Verifying Connection…
              </>
            ) : (
              <>
                <FileSpreadsheet size={14} /> Connect &amp; Sync Sheet
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function TablePage({
  path,
  filter,
  setFilter,
  users,
  usersLoading,
  events,
  nutrients,
  products,
  orders,
  search,
  sheetSyncStatus,
  onSyncSheet,
  firestoreSyncing,
  firestoreSyncResult,
  onSyncFirestoreToSheet,
  onOpenSheetConfig,
  onUser,
  onToggleStatus,
  onApproveSuggestion,
  onDismissSuggestion,
  onMarkEventCompleted,
  onDeleteEvent,
  onDeleteNutrient,
  onDeleteProduct,
  onQuickAction,
}: {
  path: string;
  filter: string;
  setFilter: (value: string) => void;
  users: UserRecord[];
  usersLoading: boolean;
  events: EventRecord[];
  nutrients: UnifiedNutrientRecipe[];
  products: UnifiedMarketplaceProduct[];
  orders: OrderRecord[];
  search: string;
  sheetSyncStatus?: {
    configured: boolean;
    connected?: boolean;
    needsScriptProperty?: boolean;
    scriptUrl: string;
    lastSynced: string | null;
    loading: boolean;
    error: string | null;
  };
  onSyncSheet?: () => void;
  firestoreSyncing?: boolean;
  firestoreSyncResult?: { scanned: number; synced: number; failed: number; skipped: number } | null;
  onSyncFirestoreToSheet?: () => void;
  onOpenSheetConfig?: () => void;
  onUser: (user: UserRecord) => void;
  onToggleStatus: (user: UserRecord) => void;
  onApproveSuggestion?: (user: UserRecord, index: number, field: string, val: any) => void;
  onDismissSuggestion?: (user: UserRecord, index: number) => void;
  onMarkEventCompleted?: (event: EventRecord) => void;
  onDeleteEvent?: (event: EventRecord) => void;
  onDeleteNutrient?: (recipe: UnifiedNutrientRecipe) => void;
  onDeleteProduct?: (product: UnifiedMarketplaceProduct) => void;
  onQuickAction: () => void;
}) {
  const userMode = path === "/users";
  const eventMode = path === "/events";
  const recipesShowcaseMode = path === "/recipes";
  const nutritionStudioMode = path === "/nutrition";
  const nutrientMode = recipesShowcaseMode || nutritionStudioMode;
  const marketplaceMode = path === "/marketplace" || path === "/products";
  const orderMode = path === "/orders";
  const isPureShowcase = eventMode || nutrientMode || marketplaceMode;

  const isUserCreatedRecipe = (row: UnifiedNutrientRecipe) =>
    String(row.creatorRole || "Admin").toLowerCase() === "user";

  const scopedNutrients = recipesShowcaseMode
    ? nutrients.filter((r) => isUserCreatedRecipe(r))
    : nutritionStudioMode
      ? nutrients.filter((r) => !isUserCreatedRecipe(r))
      : nutrients;

  // Rows are derived purely from real Firestore / API data — no mock arrays
  const rows: any[] = userMode
    ? users
    : eventMode
      ? events
      : nutrientMode
        ? scopedNutrients
        : marketplaceMode
          ? products
          : orderMode
            ? orders
            : [];

  const filtered = rows
    .filter((row: any) =>
      `${row.name || ""} ${row.title || ""} ${row.location || ""} ${row.category || ""} ${row.mealType || ""} ${row.creatorRole || ""} ${row.creatorName || ""} ${row.authorName || ""} ${row.authorEmail || ""} ${row.email || ""} ${row.username || ""} ${row.status || ""} ${row.item || ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
    .filter((row: any) => {
      if (filter === "All") return true;
      if (nutrientMode) {
        return (
          String(row.mealType || "").toLowerCase() === filter.toLowerCase() ||
          String(row.category || "").toLowerCase() === filter.toLowerCase()
        );
      }
      return String(row.status || "").toLowerCase() === filter.toLowerCase();
    });

  const filterOptions = userMode
    ? ["All", "Active", "Suspended"]
    : eventMode
      ? ["All", "Upcoming", "Ongoing", "Completed"]
      : nutrientMode
        ? ["All", "Breakfast", "Lunch", "Dinner", "Snack", "Post-Workout"]
        : marketplaceMode
          ? ["All", "In Stock", "Out of Stock"]
          : ["All", "Active", "Draft", "Review", "Published"];

  const countLabel = userMode
    ? `${filtered.length} registered members`
    : eventMode
      ? `${filtered.length} hosted events`
      : recipesShowcaseMode
        ? `${filtered.length} user recipes & meal plans`
        : nutritionStudioMode
          ? `${filtered.length} admin nutrition items`
          : marketplaceMode
            ? `${filtered.length} marketplace products`
            : `${filtered.length} records`;

  return (
    <div className="surface table-surface">
      <div className="table-toolbar">
        <div className="toolbar-copy" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span className="result-count">{countLabel}</span>
          {userMode && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span className="live-sync-indicator" title="Connected to Firebase Firestore 'users' collection">
                <i className="status-pulse" /> Live Firestore Synced
              </span>
              {sheetSyncStatus?.configured && sheetSyncStatus?.connected !== false && !sheetSyncStatus?.error ? (
                <span
                  title={`Automatic real-time Google Sheet sync active. Last synced: ${sheetSyncStatus.lastSynced || "Just now"}.`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.35)",
                    color: "#10b981",
                    padding: "3px 10px",
                    borderRadius: "99px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  <FileSpreadsheet size={13} />
                  <span>Google Sheet Synced</span>
                  {sheetSyncStatus.lastSynced && <small style={{ opacity: 0.85 }}>({sheetSyncStatus.lastSynced})</small>}
                </span>
              ) : sheetSyncStatus?.configured && sheetSyncStatus?.error ? (
                <span
                  title={`${sheetSyncStatus.error}${sheetSyncStatus.needsScriptProperty ? " — Set APPS_SCRIPT_SHARED_SECRET / APPS_SCRIPT_SECRET in Apps Script Project Settings > Script Properties." : ""}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "rgba(234, 179, 8, 0.12)",
                    border: "1px solid rgba(234, 179, 8, 0.35)",
                    color: "#eab308",
                    padding: "3px 10px",
                    borderRadius: "99px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  <FileSpreadsheet size={13} />
                  <span>
                    {sheetSyncStatus.needsScriptProperty
                      ? "Sheet Secret Setup Needed"
                      : "Sheet Sync Check Needed"}
                  </span>
                </span>
              ) : null}
              {onSyncSheet && (
                <button
                  type="button"
                  className="icon-button small-button"
                  onClick={onSyncSheet}
                  title="Refresh live users from Google Sheet & Firestore"
                  style={{ width: "26px", height: "26px", padding: 0 }}
                >
                  <RefreshCw size={12} className={sheetSyncStatus?.loading ? "animate-spin" : ""} />
                </button>
              )}
            </div>
          )}
          {isPureShowcase && (
            <span
              className="live-sync-indicator"
              title={
                marketplaceMode
                  ? "Managed via Affiliate Catalog and synced live with User Shop"
                  : "Managed from Events Hosting Studio and synced live with User pages"
              }
            >
              <i className="status-pulse" />{" "}
              {marketplaceMode
                ? "Live Showcase · Managed via Affiliate Catalog"
                : "Live Showcase · Create in Events Hosting Studio"}
            </span>
          )}
          {!userMode && !isPureShowcase && <span className="toolbar-muted">Awaiting incoming entries</span>}
        </div>
        <div className="toolbar-actions">
          <div className="select-wrap">
            <Filter size={14} />
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              {filterOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>
          {!userMode && !isPureShowcase && (
            <>
              <button className="secondary-button small-button">
                <ListFilter size={14} /> More filters
              </button>
              <button className="primary-button small-button" onClick={onQuickAction}>
                <Plus size={14} /> Add record
              </button>
            </>
          )}
        </div>
      </div>

      <div className="table-wrap">
        {userMode && usersLoading ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--mu)" }}>
            <Hexagon size={28} className="animate-spin" style={{ color: "var(--ac)", margin: "0 auto 12px" }} />
            <strong style={{ display: "block", color: "var(--tx)", fontSize: "14px", marginBottom: "4px" }}>
              Connecting to Firestore "users" collection…
            </strong>
            <span style={{ fontSize: "12px" }}>Loading registered athletes and telemetry signals.</span>
          </div>
        ) : filtered.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>
                  {userMode
                    ? "Athlete Member"
                    : eventMode
                      ? "Event"
                      : nutrientMode
                        ? "Recipe / Meal Plan"
                        : marketplaceMode
                          ? "Product"
                          : orderMode
                            ? "Record"
                            : "Item"}
                </th>
                <th>
                  {userMode
                    ? "Account Status"
                    : eventMode
                      ? "Schedule"
                      : nutrientMode
                        ? "Creator"
                        : marketplaceMode
                          ? "Category"
                          : orderMode
                            ? "Customer"
                            : "Detail"}
                </th>
                <th>
                  {userMode
                    ? "Activities & Engagement"
                    : eventMode
                      ? "Bookings"
                      : nutrientMode
                        ? "Macros (kcal · P/C/F/Fiber)"
                        : marketplaceMode
                          ? "Price"
                          : orderMode
                            ? "Amount"
                            : "Status"}
                </th>
                <th>
                  {userMode
                    ? "Registered"
                    : eventMode
                      ? "Status"
                      : nutrientMode
                        ? "BMI Suitability"
                        : marketplaceMode
                          ? "Stock Status"
                          : orderMode
                            ? "Status"
                            : "Timestamp"}
                </th>
                <th>
                  {userMode
                    ? "Last Active"
                    : eventMode
                      ? "Fee"
                      : nutrientMode
                        ? "GI · Prep"
                        : marketplaceMode
                          ? "Creator"
                          : "Details"}
                </th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row: any, index) => {
                if (userMode) {
                  const isSusp = row.status === "suspended";
                  return (
                    <tr key={row.uid || index} onClick={() => onUser(row)} style={{ cursor: "pointer" }}>
                      <td>
                        <div className="table-primary">
                          <span className={`avatar avatar-${row.accent || "cyan"}`}>
                            {row.photoURL ? (
                              <img src={row.photoURL} alt={row.name} />
                            ) : (
                              (row.name || "U")
                                .split(" ")
                                .map((part: string) => part[0])
                                .join("")
                            )}
                          </span>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <strong>{row.name}</strong>
                              {row.sheetSynced && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "3px",
                                    fontSize: "10px",
                                    padding: "1px 6px",
                                    borderRadius: "99px",
                                    background: "rgba(16, 185, 129, 0.1)",
                                    border: "1px solid rgba(16, 185, 129, 0.25)",
                                    color: "#10b981",
                                    fontWeight: 500,
                                  }}
                                  title="User login/registration record tracked in Google Sheet"
                                >
                                  <FileSpreadsheet size={10} /> Sheet Tracked
                                </span>
                              )}
                              {row.profileSuggestions && row.profileSuggestions.length > 0 && (
                                <span className="suggestion-pill" title="Has pending profile suggestions">
                                  <Sparkles size={10} /> {row.profileSuggestions.length} Suggestion
                                </span>
                              )}
                            </div>
                            <span style={{ color: "var(--mu)", fontSize: "11px" }}>
                              @{row.username || (row.email ? row.email.split("@")[0] : "athlete")} · {row.email}
                            </span>
                            {row.mobile && (
                              <span style={{ color: "var(--mu)", fontSize: "10px", display: "block" }}>
                                📞 {row.mobile}
                                {row.city ? ` · ${row.city}` : ""}
                                {typeof row.bmi === "number" ? ` · BMI ${row.bmi.toFixed(1)}${row.bmiCategory ? ` (${row.bmiCategory})` : ""}` : ""}
                              </span>
                            )}
                            {!row.mobile && (row.city || typeof row.bmi === "number") && (
                              <span style={{ color: "var(--mu)", fontSize: "10px", display: "block" }}>
                                {[row.city, typeof row.bmi === "number" ? `BMI ${row.bmi.toFixed(1)}${row.bmiCategory ? ` (${row.bmiCategory})` : ""}` : ""].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <button
                          className={`status-pill ${String(row.status || "active").toLowerCase().includes("pending") ? "review" : String(row.status || "active").toLowerCase()}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleStatus(row);
                          }}
                          title="Click to toggle Active / Suspended in Firestore"
                          style={{ cursor: "pointer" }}
                        >
                          <i className="status-pulse" /> {String(row.status || "active").toUpperCase()}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "12px" }}>
                          <strong>
                            {row.runsCount || 0} runs · {row.postsCount || 0} posts
                          </strong>
                          <span style={{ fontSize: "11px", color: "var(--mu)" }}>
                            {row.followersCount || 0} followers · {row.followingCount || 0} following
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="num" style={{ fontSize: "12px", color: "var(--tx)" }}>
                          {row.joined}
                        </span>
                      </td>
                      <td>
                        <span className="num" style={{ fontSize: "11px", color: "var(--mu)" }}>
                          {row.lastLogin}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                          <button
                            className="secondary-button small-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUser(row);
                            }}
                            style={{ fontSize: "11px", padding: "4px 10px", minHeight: "28px" }}
                          >
                            View 360°
                          </button>
                          <button
                            className={`icon-button small ${isSusp ? "active" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleStatus(row);
                            }}
                            title={isSusp ? "Re-activate account" : "Suspend account"}
                          >
                            {isSusp ? <UserCheck size={14} /> : <UserX size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (eventMode) {
                  const statusStr = String(row.status || "upcoming").toLowerCase();
                  const isCompleted = statusStr === "completed";
                  return (
                    <tr key={row.id || index}>
                      <td>
                        <div className="table-primary">
                          {row.imageUrl ? (
                            <img
                              src={row.imageUrl}
                              alt={row.name}
                              style={{
                                width: 44,
                                height: 36,
                                objectFit: "cover",
                                borderRadius: 8,
                                border: "1px solid var(--bd)",
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                width: 44,
                                height: 36,
                                borderRadius: 8,
                                border: "1px solid var(--bd)",
                                background: "var(--surface-soft)",
                                display: "grid",
                                placeItems: "center",
                                color: "var(--mu)",
                                flexShrink: 0,
                              }}
                            >
                              <CalendarDays size={15} />
                            </span>
                          )}
                          <div>
                            <strong>{row.name}</strong>
                            <span style={{ color: "var(--mu)", fontSize: "11px" }}>
                              {row.location ? `${row.location} · ` : ""}
                              {row.type}
                              {row.termsAndConditions ? " · T&C" : ""}
                              {row.bookingUrl ? " · External link" : ""}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="table-muted">{row.date}</span>
                      </td>
                      <td>{row.bookings}</td>
                      <td>
                        <span className={`status-pill ${statusStr === "completed" ? "active" : statusStr === "ongoing" ? "published" : "review"}`}>
                          {statusStr.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className="table-muted">{formatEventFee(row.feeAmount)}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                          {!isCompleted && onMarkEventCompleted && (
                            <button
                              type="button"
                              className="primary-button small-button"
                              onClick={() => onMarkEventCompleted(row)}
                              style={{ fontSize: "11px", padding: "4px 10px", minHeight: "28px" }}
                            >
                              <Check size={12} /> Mark Completed
                            </button>
                          )}
                          {onDeleteEvent && (
                            <button
                              type="button"
                              className="secondary-button small-button"
                              onClick={() => onDeleteEvent(row)}
                              title="Delete event"
                              style={{
                                fontSize: "11px",
                                padding: "4px 10px",
                                minHeight: "28px",
                                color: "#ef4444",
                                borderColor: "rgba(239, 68, 68, 0.35)",
                              }}
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (nutrientMode) {
                  const isAdminCreated = String(row.creatorRole || "Admin") === "Admin";
                  const cats: string[] = Array.isArray(row.suitableCategories) ? row.suitableCategories : ["Normal"];
                  const photoList: string[] =
                    Array.isArray(row.images) && row.images.length > 0
                      ? row.images
                      : Array.isArray(row.imageUrls) && row.imageUrls.length > 0
                        ? row.imageUrls
                        : row.coverImage || row.imageUrl
                          ? [row.coverImage || row.imageUrl]
                          : [];
                  const coverSrc = row.coverImage || row.imageUrl || photoList[0] || "";
                  return (
                    <tr key={row.id || index}>
                      <td>
                        <div className="table-primary">
                          {coverSrc ? (
                            <div style={{ position: "relative", flexShrink: 0 }}>
                              <img
                                src={coverSrc}
                                alt={row.title}
                                onError={(e) => {
                                  const el = e.currentTarget;
                                  el.onerror = null;
                                  el.style.display = "none";
                                }}
                                style={{
                                  width: 44,
                                  height: 36,
                                  objectFit: "cover",
                                  borderRadius: 8,
                                  border: "1px solid var(--bd)",
                                  display: "block",
                                }}
                              />
                              {photoList.length > 1 && (
                                <span
                                  style={{
                                    position: "absolute",
                                    right: -4,
                                    bottom: -4,
                                    fontSize: "9px",
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    padding: "2px 4px",
                                    borderRadius: 6,
                                    background: "#18372d",
                                    color: "#ffffff",
                                    border: "1px solid rgba(255,255,255,0.65)",
                                  }}
                                >
                                  1/{photoList.length}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span
                              style={{
                                width: 44,
                                height: 36,
                                borderRadius: 8,
                                border: "1px solid var(--bd)",
                                background: "var(--surface-soft)",
                                display: "grid",
                                placeItems: "center",
                                color: "var(--mu)",
                                flexShrink: 0,
                              }}
                            >
                              <Sparkles size={15} />
                            </span>
                          )}
                          <div>
                            <strong>{row.title}</strong>
                            <span style={{ color: "var(--mu)", fontSize: "11px" }}>
                              {row.mealType || row.category}
                              {photoList.length > 1 ? ` · 1/${photoList.length} photos` : ""}
                              {Array.isArray(row.ingredients) && row.ingredients.length > 0
                                ? ` · ${row.ingredients.length} ingredients`
                                : ""}
                              {row.description ? ` · ${String(row.description).slice(0, 44)}${String(row.description).length > 44 ? "…" : ""}` : ""}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "grid", gap: 3 }}>
                          <span className={`status-pill ${isAdminCreated ? "published" : "review"}`}>
                            {isAdminCreated ? "Admin" : "User"}
                          </span>
                          <span style={{ color: "var(--mu)", fontSize: "10px" }}>
                            {row.creatorName || row.authorName}
                            {row.authorEmail ? ` · ${row.authorEmail}` : ""}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="num" style={{ fontSize: "12px" }}>
                          <strong>{row.calories} kcal</strong>
                          <span style={{ color: "var(--mu)", display: "block", fontSize: "11px" }}>
                            P {row.proteinGrams}g · C {row.carbsGrams}g · F {row.fatsGrams}g · Fib {row.fiberGrams}g
                          </span>
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 200 }}>
                          {cats.map((cat) => (
                            <span key={cat} className="status-pill active" style={{ fontSize: "10px", padding: "2px 7px" }}>
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="table-muted">
                          {row.glycemicIndex || "Low"} GI · {row.prepTimeMins || 20}m
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {onDeleteNutrient && (
                          <button
                            type="button"
                            className="secondary-button small-button"
                            onClick={() => onDeleteNutrient(row)}
                            title="Delete recipe"
                            style={{
                              fontSize: "11px",
                              padding: "4px 10px",
                              minHeight: "28px",
                              color: "#ef4444",
                              borderColor: "rgba(239, 68, 68, 0.35)",
                            }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }

                if (marketplaceMode) {
                  const inStock = Number(row.stock || 0) > 0;
                  return (
                    <tr key={row.id || index}>
                      <td>
                        <div className="table-primary">
                          {row.imageUrl ? (
                            <img
                              src={row.imageUrl}
                              alt={row.name}
                              style={{
                                width: 44,
                                height: 36,
                                objectFit: "cover",
                                borderRadius: 8,
                                border: "1px solid var(--bd)",
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                width: 44,
                                height: 36,
                                borderRadius: 8,
                                border: "1px solid var(--bd)",
                                background: "var(--surface-soft)",
                                display: "grid",
                                placeItems: "center",
                                color: "var(--mu)",
                                flexShrink: 0,
                              }}
                            >
                              <ShoppingBag size={15} />
                            </span>
                          )}
                          <div>
                            <strong>{row.name}</strong>
                            <span style={{ color: "var(--mu)", fontSize: "11px" }}>
                              {row.description
                                ? `${String(row.description).slice(0, 52)}${String(row.description).length > 52 ? "…" : ""}`
                                : row.checkoutUrl
                                  ? "External checkout link"
                                  : "In-app cart checkout"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="table-muted">{row.category}</span>
                      </td>
                      <td>
                        <strong className="num">₹{Number(row.price || 0).toLocaleString("en-IN")}</strong>
                      </td>
                      <td>
                        <span className={`status-pill ${inStock ? "active" : "suspended"}`}>
                          {inStock ? `IN STOCK (${row.stock})` : "OUT OF STOCK"}
                        </span>
                      </td>
                      <td>
                        <span className="table-muted">
                          {row.creatorRole || "Admin"} · {row.creatorName || "Hivecity Admin"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {onDeleteProduct && (
                          <button
                            type="button"
                            className="secondary-button small-button"
                            onClick={() => onDeleteProduct(row)}
                            title="Delete product"
                            style={{
                              fontSize: "11px",
                              padding: "4px 10px",
                              minHeight: "28px",
                              color: "#ef4444",
                              borderColor: "rgba(239, 68, 68, 0.35)",
                            }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }

                // General rows for orders/products
                return (
                  <tr key={index} onClick={() => userMode && onUser(row)}>
                    <td>
                      <div className="table-primary">
                        <div>
                          <strong>{row.name || row.item}</strong>
                          {row.email && <span>{row.email}</span>}
                          {row.id && <span>{row.id}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {eventMode ? (
                        <span className="table-muted">{row.date}</span>
                      ) : (
                        <span className={`status-pill ${String(row.status || "").toLowerCase()}`}>{row.status}</span>
                      )}
                    </td>
                    <td>
                      {eventMode ? row.bookings : orderMode ? row.amount : row.activity || "—"}
                    </td>
                    <td>
                      <span className={`status-pill ${String(row.status || "").toLowerCase()}`}>{row.status}</span>
                    </td>
                    <td>
                      <span className="table-muted">{row.revenue || "—"}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="icon-button small">
                        <MoreHorizontal size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-state-block">
            <div className="empty-state-icon">
              {userMode ? <Users size={22} /> : <Inbox size={22} />}
            </div>
            <h4>
              {userMode
                ? sheetSyncStatus?.configured
                  ? "No matching user records"
                  : "No registered members found"
                : eventMode
                  ? "No hosted events yet"
                  : recipesShowcaseMode
                    ? "No user-created recipes yet"
                    : nutritionStudioMode
                      ? "No admin nutrition items yet"
                      : marketplaceMode
                        ? "No marketplace products yet"
                        : "No records found"}
            </h4>
            <p>
              {search
                ? `No records matching "${search}".`
                : userMode
                  ? sheetSyncStatus?.configured
                    ? `No users match this view. Firestore updates appear live; Google Sheets imports run only when you start a sync.`
                    : `The Firestore "users" collection is currently empty. Connect your Google Apps Script Web App before importing records into Google Sheets.`
                  : recipesShowcaseMode
                    ? `Recipes published by Hivecity community members will automatically showcase here.`
                    : isPureShowcase
                      ? `Publish new items from Events Hosting Studio in the sidebar — they will automatically showcase here and sync live to User pages.`
                      : `This queue is currently empty. As entries are created, records will automatically stream into this directory.`}
            </p>
            {userMode && !sheetSyncStatus?.configured && (
              <button
                className="secondary-button small-button"
                style={{ marginTop: 14 }}
                onClick={onOpenSheetConfig}
              >
                <FileSpreadsheet size={14} /> Connect Google Sheet
              </button>
            )}
            {!userMode && !isPureShowcase && (
              <button className="primary-button small-button" style={{ marginTop: 14 }} onClick={onQuickAction}>
                <Plus size={14} /> Create first entry
              </button>
            )}
          </div>
        )}
      </div>

      <div className="table-footer">
        <span>Showing {filtered.length} of {rows.length} records</span>
        <div className="pagination">
          <button className="icon-button small">
            <ChevronLeft size={15} />
          </button>
          <span>1</span>
          <button className="icon-button small">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPage({ path }: { path: string }) {
  const revenue = path === "/revenue";
  const insight = path === "/insights";
  const [range, setRange] = useState<"30d" | "today">("30d");
  const [finance, setFinance] = useState<{
    grossRevenue: number;
    grossDeltaPct: number;
    avgOrderValue: number;
    aovDeltaPct: number;
    refunds: number;
    refundsDeltaPct: number;
    netRevenue: number;
    verifiedCount: number;
    dailySeries: { date: string; label: string; amount: number }[];
    signals: { id: string; severity: "info" | "warning" | "positive"; title: string; detail: string }[];
  } | null>(null);

  const loadFinance = useCallback(async () => {
    if (!revenue) return;
    try {
      const r = await fetch(`/api/admin/finance?range=${range}`, { credentials: "include" });
      if (!r.ok) return;
      const data = await r.json();
      if (data?.success) setFinance(data);
    } catch { }
  }, [revenue, range]);

  useEffect(() => {
    if (!revenue) return;
    void loadFinance();
    const onRefresh = () => void loadFinance();
    window.addEventListener("hivecity:bookings-updated", onRefresh);
    window.addEventListener("hivecity:sessions-updated", onRefresh);
    window.addEventListener("hivecity:sponsors-updated", onRefresh);
    return () => {
      window.removeEventListener("hivecity:bookings-updated", onRefresh);
      window.removeEventListener("hivecity:sessions-updated", onRefresh);
      window.removeEventListener("hivecity:sponsors-updated", onRefresh);
    };
  }, [revenue, loadFinance]);

  const fmtInr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;
  const fmtDelta = (pct?: number) => {
    const v = Number(pct || 0);
    return `${v > 0 ? "+" : ""}${v}% vs prior`;
  };
  const maxDaily = Math.max(1, ...(finance?.dailySeries || []).map((d) => d.amount));

  return (
    <>
      <section className="metric-strip">
        <div className="surface mini-metric">
          <span>{revenue ? "Gross revenue" : insight ? "Monthly active" : "Distance logged"}</span>
          <strong>{revenue ? fmtInr(finance?.grossRevenue || 0) : insight ? "0" : "0 km"}</strong>
          <span className={(finance?.grossDeltaPct || 0) < 0 ? "negative" : "positive"}>
            {revenue ? fmtDelta(finance?.grossDeltaPct) : "0% vs prior"}
          </span>
        </div>
        <div className="surface mini-metric">
          <span>{revenue ? "Avg. order value" : insight ? "Retention" : "Sessions"}</span>
          <strong>{revenue ? fmtInr(finance?.avgOrderValue || 0) : insight ? "0%" : "0"}</strong>
          <span className={(finance?.aovDeltaPct || 0) < 0 ? "negative" : "positive"}>
            {revenue ? fmtDelta(finance?.aovDeltaPct) : "0% vs prior"}
          </span>
        </div>
        <div className="surface mini-metric">
          <span>{revenue ? "Refunds" : insight ? "Event conversion" : "Avg. pace"}</span>
          <strong>{revenue ? fmtInr(finance?.refunds || 0) : insight ? "0%" : "—"}</strong>
          <span className="negative">
            {revenue ? fmtDelta(finance?.refundsDeltaPct) : "0% vs prior"}
          </span>
        </div>
      </section>

      <div className="analytics-grid">
        <div className="surface chart-panel analytics-chart">
          <PanelHeader
            eyebrow={revenue ? (range === "today" ? "FINANCE / TODAY" : "FINANCE / 30 DAYS") : insight ? "BUSINESS / 30 DAYS" : "RUNNING / 30 DAYS"}
            title={revenue ? "Revenue performance" : insight ? "Platform momentum" : "Movement volume"}
            action={
              <button
                type="button"
                className="secondary-button small-button"
                onClick={() => revenue && setRange((prev) => (prev === "30d" ? "today" : "30d"))}
              >
                <CalendarDays size={14} /> {revenue && range === "today" ? "Today" : "30D"}
              </button>
            }
          />
          <div className="chart-wrap tall">
            {revenue && finance && finance.dailySeries.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 10,
                  height: "100%",
                  minHeight: 200,
                  padding: "20px 12px 8px",
                  width: "100%",
                }}
              >
                {finance.dailySeries.map((pt) => {
                  const pct = Math.max(8, Math.round((pt.amount / maxDaily) * 100));
                  return (
                    <div
                      key={pt.date}
                      title={`${pt.date}: ${fmtInr(pt.amount)}`}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        height: "100%",
                        gap: 6,
                        minWidth: 24,
                      }}
                    >
                      <small style={{ fontSize: 10, color: "var(--mu)", whiteSpace: "nowrap" }}>
                        {fmtInr(pt.amount)}
                      </small>
                      <div
                        style={{
                          width: "100%",
                          maxWidth: 34,
                          height: `${pct}%`,
                          borderRadius: "8px 8px 3px 3px",
                          background: "linear-gradient(180deg, #C6F432 0%, #1B4D3E 100%)",
                        }}
                      />
                      <small style={{ fontSize: 10, color: "var(--mu)" }}>{pt.label}</small>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state-chart">
                <BarChart3 size={28} />
                <span>No analytics telemetry available</span>
                <small>Live charts will automatically draw historical curves once user site traffic connects.</small>
              </div>
            )}
          </div>
        </div>

        <div className="surface insight-card">
          <PanelHeader eyebrow="SIGNALS / AI-READY" title="What deserves attention" />
          {revenue && finance && finance.signals.length > 0 ? (
            <div style={{ display: "grid", gap: 10, padding: "10px 0 14px" }}>
              {finance.signals.map((sig) => (
                <div
                  key={sig.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--bd)",
                    background: "var(--bg)",
                  }}
                >
                  <strong style={{ display: "block", fontSize: 13 }}>{sig.title}</strong>
                  <small style={{ color: "var(--mu)", lineHeight: 1.4 }}>{sig.detail}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state-mini" style={{ padding: "40px 10px" }}>
              <Zap size={24} />
              <span>Waiting for platform activity to generate actionable AI insights.</span>
            </div>
          )}
          <div className="ai-disclaimer">
            <CircleHelp size={14} /> Insights will appear automatically as community events and running sessions register.
          </div>
        </div>
      </div>

      <div className="surface region-table">
        <PanelHeader
          eyebrow="REGIONAL PULSE"
          title="Where activity is concentrating"
          action={
            <button className="text-button">
              Open map <Map size={14} />
            </button>
          }
        />
        <div className="empty-state-mini">
          <Map size={22} />
          <span>No regional concentration data recorded yet</span>
        </div>
      </div>
    </>
  );
}

function PlayPage() {
  return (
    <>
      <div className="play-overview">
        <div className="surface play-hero">
          <div className="play-hero-copy">
            <div className="eyebrow">
              <Radio size={13} /> Live GPS multiplayer platform
            </div>
            <h2>The city is your playground.</h2>
            <p>Monitor safe zones, active squads and match health from one tactical view.</p>
            <div className="play-actions">
              <button className="primary-button">
                <Plus size={16} /> Create arena
              </button>
              <button className="secondary-button">
                <Map size={15} /> Open live map
              </button>
            </div>
          </div>
          <div className="play-hero-stat">
            <span>ACTIVE AGENTS</span>
            <strong>0</strong>
            <small>
              <i className="status-pulse" /> 0 live arenas
            </small>
          </div>
        </div>
        <div className="surface play-kpi">
          <span>SAFE ZONE COVERAGE</span>
          <strong>—</strong>
          <p>Verified public areas only.</p>
          <div className="safe-progress">
            <i style={{ width: "0%" }} />
          </div>
        </div>
      </div>

      <div className="play-grid">
        <div className="surface tactical-panel large">
          <PanelHeader
            eyebrow="TACTICAL GEO-ENGINE"
            title="Live arena map"
            action={
              <div className="map-tabs">
                <button className="chip on">All layers</button>
              </div>
            }
          />
          <div className="tactical-map play-map">
            <div className="map-grid-lines" />
            <div className="map-label">
              CENTRAL METROPOLIS <span>GPS SYNCED</span>
            </div>
            <div className="map-safe-zone">
              <span className="safe-label">ACTIVE SAFE ZONE</span>
            </div>
          </div>
        </div>

        <div className="surface mode-panel">
          <PanelHeader eyebrow="GAME CATALOGUE" title="Play archetypes" />
          <div className="mode-list">
            <ModeRow number="01" name="Hide and Seek" meta="2–16 players · Stealth" active />
            <ModeRow number="02" name="Radar Hunt" meta="2–10 players · Popular" />
            <ModeRow number="03" name="Treasure Hunt" meta="1–20 players · Exploration" />
            <ModeRow number="04" name="Team Chase" meta="4–24 players · Competitive" />
            <ModeRow number="05" name="Hive Missions" meta="Daily rotation · Quest board" />
          </div>
        </div>
      </div>

      <div className="surface match-table">
        <PanelHeader
          eyebrow="WAR ROOM / ACTIVE LOBBIES"
          title="Squads in motion"
          action={
            <button className="secondary-button small-button">
              <RefreshCw size={14} /> Refresh
            </button>
          }
        />
        <div className="empty-state-mini">
          <Radio size={22} />
          <span>No live game lobbies currently running</span>
        </div>
      </div>
    </>
  );
}

function ModeRow({
  number,
  name,
  meta,
  active,
}: {
  number: string;
  name: string;
  meta: string;
  active?: boolean;
}) {
  return (
    <div className={`mode-row ${active ? "active" : ""}`}>
      <span className="mode-number">{number}</span>
      <div>
        <strong>{name}</strong>
        <span>{meta}</span>
      </div>
      {active && <span className="live-tag">ACTIVE</span>}
      <ChevronRight size={15} />
    </div>
  );
}

function ContentPage({ path, onQuickAction }: { path: string; onQuickAction: () => void }) {
  const contentDescriptions: Record<string, string> = {
    "/nutrition": "Editorial workspace for recipes, hydration guides and nutrition education.",
    "/recipes": "Library view for building nutritious meal plans and runner recipes.",
    "/campaigns": "Message planning and multi-channel campaign staging.",
    "/notifications": "Push announcements, automated triggers, and delivery receipts.",
    "/calendar": "Operational master schedule for runs, events, campaigns and releases.",
    "/sponsors": "Partner tracking, sponsorship tiers and brand integrations.",
    "/admins": "Role-based access control and system administrator permissions.",
    "/settings": "Platform parameters, environment flags, and operational configurations.",
    "/marketplace": "E-commerce product catalogue, stock levels, and merchandise sales.",
    "/event-hosting": "Multi-step studio workflow to publish city runs and community gatherings.",
  };

  const note = contentDescriptions[path] || "Operational workspace for the Hive City administration team.";

  return (
    <div className="content-page">
      <div className="surface module-intro">
        <div>
          <span className="panel-eyebrow">WORKSPACE</span>
          <h2>{note}</h2>
        </div>
        <button className="primary-button" onClick={onQuickAction}>
          <Plus size={16} /> New record
        </button>
      </div>

      <div className="empty-state-block">
        <div className="empty-state-icon">
          <Database size={22} />
        </div>
        <h4>No published items</h4>
        <p>This workspace is connected and ready. Records published here or synced from the user-site will appear in this grid.</p>
        <button className="primary-button small-button" style={{ marginTop: 14 }} onClick={onQuickAction}>
          <Plus size={14} /> Create first entry
        </button>
      </div>
    </div>
  );
}

interface SponsorRecord {
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

interface SponsorFormPayload {
  sponsorName: string;
  companyDetails: string;
  companyLink: string;
  linkedinProfile: string;
  companyLocation: string;
  sponsorshipAmount: number;
  packageType: "Monthly" | "Yearly";
}

function SponsorsView({
  sponsors,
  loading,
  search,
  onDeleteSponsor,
}: {
  sponsors: SponsorRecord[];
  loading: boolean;
  search: string;
  onDeleteSponsor?: (sponsor: SponsorRecord) => void;
}) {
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return sponsors;
    return sponsors.filter((s) =>
      `${s.sponsorName} ${s.companyDetails} ${s.companyLocation} ${s.packageType} ${s.companyLink} ${s.linkedinProfile}`
        .toLowerCase()
        .includes(q)
    );
  }, [sponsors, q]);

  const formatInr = (amount: number) =>
    `₹${Math.round(Number(amount || 0)).toLocaleString("en-IN")}`;

  if (loading && sponsors.length === 0) {
    return (
      <div className="content-page">
        <div className="empty-state-block">
          <div className="empty-state-icon">
            <Database size={22} />
          </div>
          <h4>Loading sponsors...</h4>
          <p>Syncing sponsor records from Google Sheets.</p>
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="content-page">
        <div className="empty-state-block">
          <div className="empty-state-icon">
            <Trophy size={22} />
          </div>
          <h4>No sponsors recorded yet</h4>
          <p>Use the + Create new button at the top right to record sponsor details and sync to Google Sheets.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-page">
      <section className="surface" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sponsor / Contact</th>
                <th>Company Details</th>
                <th>Location</th>
                <th>Amount</th>
                <th>Package</th>
                <th>Links</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="cell-primary">
                      <strong>{s.sponsorName}</strong>
                      <span>{s.id}</span>
                    </div>
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <span style={{ whiteSpace: "pre-wrap" }}>{s.companyDetails || "—"}</span>
                  </td>
                  <td>{s.companyLocation || "—"}</td>
                  <td>
                    <strong>{formatInr(s.sponsorshipAmount)}</strong>
                  </td>
                  <td>
                    <span className="status-pill verified">{s.packageType}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {s.companyLink ? (
                        <a
                          href={s.companyLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="secondary-button small-button"
                        >
                          Website
                        </a>
                      ) : null}
                      {s.linkedinProfile ? (
                        <a
                          href={s.linkedinProfile}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="secondary-button small-button"
                        >
                          LinkedIn
                        </a>
                      ) : null}
                      {!s.companyLink && !s.linkedinProfile ? "—" : null}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {onDeleteSponsor && (
                      <button
                        type="button"
                        className="secondary-button small-button"
                        onClick={() => onDeleteSponsor(s)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SponsorCreateModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (payload: SponsorFormPayload) => Promise<void>;
}) {
  const [sponsorName, setSponsorName] = useState("");
  const [companyDetails, setCompanyDetails] = useState("");
  const [companyLink, setCompanyLink] = useState("");
  const [linkedinProfile, setLinkedinProfile] = useState("");
  const [companyLocation, setCompanyLocation] = useState("");
  const [sponsorshipAmount, setSponsorshipAmount] = useState("");
  const [packageType, setPackageType] = useState<"Monthly" | "Yearly">("Monthly");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sponsorName.trim()) {
      toast.error("Please enter the Sponsor / Contact Name.");
      return;
    }
    setSubmitting(true);
    try {
      await onSave({
        sponsorName: sponsorName.trim(),
        companyDetails: companyDetails.trim(),
        companyLink: companyLink.trim(),
        linkedinProfile: linkedinProfile.trim(),
        companyLocation: companyLocation.trim(),
        sponsorshipAmount: Number(String(sponsorshipAmount || "0").replace(/[^0-9.]/g, "")) || 0,
        packageType,
      });
    } catch (err: any) {
      toast.error(err?.message || "Could not save sponsor.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 620, maxHeight: "90vh", overflowY: "auto" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="panel-eyebrow">COMMERCE / PARTNERS</span>
            <h2>Add sponsor details</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="field-label">
            Sponsor / Contact Name
            <input
              autoFocus
              required
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              placeholder="e.g. Rohan Mehta"
            />
          </label>

          <label className="field-label">
            Company Details
            <textarea
              rows={3}
              value={companyDetails}
              onChange={(e) => setCompanyDetails(e.target.value)}
              placeholder="Company name & description/notes"
            />
          </label>

          <div className="form-grid">
            <label className="field-label">
              Company Link
              <input
                type="url"
                value={companyLink}
                onChange={(e) => setCompanyLink(e.target.value)}
                placeholder="https://company.com"
              />
            </label>
            <label className="field-label">
              LinkedIn Profile
              <input
                type="url"
                value={linkedinProfile}
                onChange={(e) => setLinkedinProfile(e.target.value)}
                placeholder="https://linkedin.com/in/..."
              />
            </label>
          </div>

          <label className="field-label">
            Company Location
            <input
              value={companyLocation}
              onChange={(e) => setCompanyLocation(e.target.value)}
              placeholder="e.g. Bengaluru, India"
            />
          </label>

          <div className="form-grid">
            <label className="field-label">
              Sponsorship Amount (₹)
              <input
                type="number"
                min={0}
                step="any"
                value={sponsorshipAmount}
                onChange={(e) => setSponsorshipAmount(e.target.value)}
                placeholder="e.g. 50000"
              />
            </label>
            <label className="field-label">
              Sponsorship Package
              <select
                value={packageType}
                onChange={(e) => setPackageType(e.target.value === "Yearly" ? "Yearly" : "Monthly")}
              >
                <option value="Monthly">Monthly</option>
                <option value="Yearly">Yearly</option>
              </select>
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "Saving..." : "Save sponsor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
