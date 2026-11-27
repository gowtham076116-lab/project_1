import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { db } from "../lib/firebase";

export type NotificationDeliveryStatus = "Delivered Successfully" | "Internet Issue" | "Not Sent";

export interface NotificationDeliveryRecord {
  id: string;
  category: "Run" | "Food & Beverages";
  title: string;
  imageUrl?: string;
  message: string;
  ctaUrl?: string;
  deliveryStatus: NotificationDeliveryStatus;
  deliveryMessage: string;
  resendCount: number;
  resentAt?: string;
  createdAt: string;
  isUnsentLocalDraft?: boolean;
}

export const OFFLINE_NOTIF_LOGS_KEY = "hivecity_notification_delivery_logs";

export function readOfflineNotificationLogs(): NotificationDeliveryRecord[] {
  try {
    const raw = localStorage.getItem(OFFLINE_NOTIF_LOGS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfflineNotificationLog(entry: NotificationDeliveryRecord): void {
  try {
    const next = [entry, ...readOfflineNotificationLogs().filter((x) => x.id !== entry.id)];
    localStorage.setItem(OFFLINE_NOTIF_LOGS_KEY, JSON.stringify(next));
  } catch { }
}

function removeOfflineNotificationLog(id: string): void {
  try {
    const next = readOfflineNotificationLogs().filter((x) => x.id !== id);
    localStorage.setItem(OFFLINE_NOTIF_LOGS_KEY, JSON.stringify(next));
  } catch { }
}

export function NotificationsDeliveryAdmin({ search }: { search: string }) {
  const [items, setItems] = useState<NotificationDeliveryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    const offlineDrafts = readOfflineNotificationLogs();
    try {
      const res = await fetch("/api/admin/notifications", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const serverList: NotificationDeliveryRecord[] = Array.isArray(data.notifications)
          ? data.notifications
          : [];
        const byId = new Map<string, NotificationDeliveryRecord>();
        for (const s of serverList) byId.set(s.id, s);
        for (const d of offlineDrafts) {
          if (!byId.has(d.id)) byId.set(d.id, d);
        }
        setItems(
          Array.from(byId.values()).sort((a, b) =>
            (b.resentAt || b.createdAt || "").localeCompare(a.resentAt || a.createdAt || "")
          )
        );
      } else {
        setItems(offlineDrafts);
      }
    } catch {
      setItems(offlineDrafts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const onUpdate = () => void loadNotifications();
    window.addEventListener("hivecity:campaigns-updated", onUpdate);

    // Real-time Firestore onSnapshot listener for instantaneous delivery updates (zero manual refresh)
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        collection(db, "community_campaigns"),
        (snap) => {
          const liveList: NotificationDeliveryRecord[] = [];
          snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            const toIso = (v: any) =>
              v && typeof v.toDate === "function" ? v.toDate().toISOString() : String(v || "");
            liveList.push({
              id: docSnap.id,
              category: String(d.category || "Run").toLowerCase().includes("food")
                ? "Food & Beverages"
                : "Run",
              title: String(d.title || "Hivecity Announcement"),
              imageUrl: String(d.imageUrl || ""),
              message: String(d.message || d.description || ""),
              ctaUrl: String(d.ctaUrl || ""),
              deliveryStatus:
                d.deliveryStatus === "Internet Issue" || d.deliveryStatus === "Not Sent"
                  ? d.deliveryStatus
                  : "Delivered Successfully",
              deliveryMessage: String(
                d.deliveryMessage || "Campaign notification delivered successfully to users."
              ),
              resendCount: Number(d.resendCount || 0),
              resentAt: d.resentAt ? toIso(d.resentAt) : undefined,
              createdAt: toIso(d.createdAt) || new Date().toISOString(),
            });
          });
          if (liveList.length > 0) {
            const offlineDrafts = readOfflineNotificationLogs();
            const byId = new Map<string, NotificationDeliveryRecord>();
            for (const s of liveList) byId.set(s.id, s);
            for (const d of offlineDrafts) {
              if (!byId.has(d.id)) byId.set(d.id, d);
            }
            setItems(
              Array.from(byId.values()).sort((a, b) =>
                (b.resentAt || b.createdAt || "").localeCompare(a.resentAt || a.createdAt || "")
              )
            );
          }
        },
        () => { }
      );
    } catch { }

    return () => {
      window.removeEventListener("hivecity:campaigns-updated", onUpdate);
      if (unsub) unsub();
    };
  }, [loadNotifications]);

  const handleResend = async (item: NotificationDeliveryRecord) => {
    setResendingId(item.id);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const offlineUpdated: NotificationDeliveryRecord = {
        ...item,
        deliveryStatus: "Internet Issue",
        deliveryMessage:
          "Not sent due to an internet connection issue. Please check your connection and resend.",
      };
      setItems((prev) => prev.map((x) => (x.id === item.id ? offlineUpdated : x)));
      saveOfflineNotificationLog(offlineUpdated);
      toast.error("Internet connection issue — please check your connection and resend.");
      setResendingId(null);
      return;
    }

    try {
      const endpoint = item.isUnsentLocalDraft
        ? "/api/admin/campaigns"
        : `/api/admin/campaigns/${encodeURIComponent(item.id)}/resend`;
      const payload = item.isUnsentLocalDraft
        ? {
            id: item.id,
            category: item.category,
            title: item.title,
            imageUrl: item.imageUrl || "",
            message: item.message,
            ctaUrl: item.ctaUrl || "",
          }
        : {};

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const failedUpdated: NotificationDeliveryRecord = {
          ...item,
          deliveryStatus: "Not Sent",
          deliveryMessage: data.error || "Campaign notification failed to deliver.",
        };
        setItems((prev) => prev.map((x) => (x.id === item.id ? failedUpdated : x)));
        toast.error(failedUpdated.deliveryMessage);
        return;
      }

      const delivered: NotificationDeliveryRecord = data.notification || data.campaign || {
        ...item,
        deliveryStatus: "Delivered Successfully",
        deliveryMessage: "Campaign notification delivered successfully to users.",
        resentAt: new Date().toISOString(),
        resendCount: (item.resendCount || 0) + 1,
      };
      removeOfflineNotificationLog(item.id);
      setItems((prev) => [delivered, ...prev.filter((x) => x.id !== item.id)]);
      window.dispatchEvent(new Event("hivecity:campaigns-updated"));
      toast.success(`"${delivered.title}" resent and delivered successfully.`);
    } catch {
      const netErr: NotificationDeliveryRecord = {
        ...item,
        deliveryStatus: "Internet Issue",
        deliveryMessage:
          "Not sent due to an internet connection issue. Please check your connection and resend.",
      };
      setItems((prev) => prev.map((x) => (x.id === item.id ? netErr : x)));
      saveOfflineNotificationLog(netErr);
      toast.error("Not sent due to an internet connection issue. Please check your connection and resend.");
    } finally {
      setResendingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      `${i.title} ${i.category} ${i.message} ${i.deliveryStatus}`.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="content-page">
      <div className="surface module-intro">
        <div>
          <span className="panel-eyebrow">WORKSPACE</span>
          <h2>Push announcements, automated triggers, and delivery receipts.</h2>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="empty-state-block">
          <div className="empty-state-icon">
            <Database size={22} />
          </div>
          <h4>Loading delivery receipts...</h4>
          <p>Checking campaign notification delivery status.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state-block">
          <div className="empty-state-icon">
            <Database size={22} />
          </div>
          <h4>No published items</h4>
          <p>
            No campaign notifications sent yet. Campaigns published in Campaign studio will appear here
            automatically.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filtered.map((item) => {
            const pillClass =
              item.deliveryStatus === "Delivered Successfully"
                ? "verified"
                : item.deliveryStatus === "Internet Issue"
                  ? "pending"
                  : "suspended";
            const ts = item.resentAt || item.createdAt;
            return (
              <div
                key={item.id}
                className="surface"
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 260 }}>
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      style={{
                        width: 60,
                        height: 60,
                        objectFit: "cover",
                        borderRadius: 12,
                        flexShrink: 0,
                      }}
                    />
                  ) : null}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span className={`status-pill ${pillClass}`}>{item.deliveryStatus}</span>
                      <span className="status-pill verified">{item.category}</span>
                      <small style={{ color: "var(--mu)", fontSize: 12 }}>
                        {ts ? new Date(ts).toLocaleString("en-IN") : "Just now"}
                        {item.resendCount > 0 ? ` · Resent ${item.resendCount}×` : ""}
                      </small>
                    </div>
                    <strong style={{ display: "block", fontSize: 15 }}>{item.title}</strong>
                    <p style={{ margin: "3px 0 4px", fontSize: 13, color: "var(--mu)" }}>
                      {item.message.length > 150 ? item.message.slice(0, 150) + "…" : item.message}
                    </p>
                    <small style={{ fontSize: 12, color: "var(--mu)" }}>{item.deliveryMessage}</small>
                  </div>
                </div>

                {!(
                  item.deliveryStatus === "Delivered Successfully" ||
                  String(item.deliveryStatus || "").toLowerCase() === "sent"
                ) && (
                  <button
                    type="button"
                    className="primary-button small-button"
                    disabled={resendingId === item.id}
                    onClick={() => handleResend(item)}
                  >
                    <RefreshCw size={13} className={resendingId === item.id ? "animate-spin" : ""} />
                    {resendingId === item.id ? "Retrying..." : "Retry / Resend"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
