import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Database, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "../lib/firebase";
import { saveOfflineNotificationLog } from "./NotificationsDeliveryAdmin";

export interface AdminCampaignRecord {
  id: string;
  category: "Run" | "Food & Beverages";
  title: string;
  imageUrl: string;
  message: string;
  ctaUrl: string;
  createdBy: string;
  createdAt: string;
}

const CAMPAIGNS_CACHE_KEY = "hivecity_campaigns";

function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image file."));
      img.onload = () => {
        const maxDim = 1080;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unavailable."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(e.target?.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export function CampaignStudioAdmin({
  search,
  createModalOpen,
  onOpenCreateModal,
  onCloseCreateModal,
}: {
  search: string;
  createModalOpen: boolean;
  onOpenCreateModal: () => void;
  onCloseCreateModal: () => void;
}) {
  const [campaigns, setCampaigns] = useState<AdminCampaignRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/campaigns", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.campaigns)) {
        setCampaigns(data.campaigns);
        try {
          localStorage.setItem(CAMPAIGNS_CACHE_KEY, JSON.stringify(data.campaigns));
        } catch { }
      }
    } catch (err) {
      console.warn("[CampaignStudio] Load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        collection(db, "community_campaigns"),
        (snap) => {
          const live: AdminCampaignRecord[] = [];
          snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            const toIso = (v: any) =>
              v && typeof v.toDate === "function" ? v.toDate().toISOString() : String(v || "");
            live.push({
              id: docSnap.id,
              category: String(d.category || "Run").toLowerCase().includes("food")
                ? "Food & Beverages"
                : "Run",
              title: String(d.title || "Hivecity Announcement"),
              imageUrl: String(d.imageUrl || ""),
              message: String(d.message || d.description || ""),
              ctaUrl: String(d.ctaUrl || ""),
              createdBy: String(d.createdBy || "admin"),
              createdAt: toIso(d.createdAt) || new Date().toISOString(),
            });
          });
          if (live.length > 0) {
            live.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
            setCampaigns(live);
            try {
              localStorage.setItem(CAMPAIGNS_CACHE_KEY, JSON.stringify(live));
            } catch { }
          }
        },
        () => { }
      );
    } catch { }
    return () => {
      if (unsub) unsub();
    };
  }, [loadCampaigns]);

  const handleDelete = async (c: AdminCampaignRecord) => {
    if (!window.confirm(`Remove campaign "${c.title}" from Campaign Studio?`)) return;
    try {
      const res = await fetch(`/api/admin/campaigns/${encodeURIComponent(c.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      const next = campaigns.filter((x) => x.id !== c.id);
      setCampaigns(next);
      try {
        localStorage.setItem(CAMPAIGNS_CACHE_KEY, JSON.stringify(next));
      } catch { }
      window.dispatchEvent(new Event("hivecity:campaigns-updated"));
      toast.success(`Campaign "${c.title}" removed from Campaign Studio.`);
    } catch (err: any) {
      toast.error(err?.message || "Could not delete campaign.");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) =>
      `${c.title} ${c.category} ${c.message}`.toLowerCase().includes(q)
    );
  }, [campaigns, search]);

  return (
    <div className="content-page">
      <div className="surface module-intro">
        <div>
          <span className="panel-eyebrow">WORKSPACE</span>
          <h2>Message planning and multi-channel campaign staging.</h2>
        </div>
      </div>

      {loading && campaigns.length === 0 ? (
        <div className="empty-state-block">
          <div className="empty-state-icon">
            <Database size={22} />
          </div>
          <h4>Loading campaigns...</h4>
          <p>Syncing Run and Food &amp; Beverages announcements.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state-block">
          <div className="empty-state-icon">
            <Database size={22} />
          </div>
          <h4>No published items</h4>
          <p>
            This workspace is connected and ready. Use + Create new at the top right to publish
            campaigns to User Notifications.
          </p>
        </div>
      ) : (
        <section className="surface" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Category</th>
                  <th>Message</th>
                  <th>Published</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {c.imageUrl ? (
                          <img
                            src={c.imageUrl}
                            alt={c.title}
                            style={{
                              width: 52,
                              height: 52,
                              objectFit: "cover",
                              borderRadius: 10,
                              flexShrink: 0,
                            }}
                          />
                        ) : null}
                        <div className="cell-primary">
                          <strong>{c.title}</strong>
                          <span>{c.id}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="status-pill verified">{c.category}</span>
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      <span style={{ display: "block", fontSize: 13 }}>
                        {c.message.length > 110 ? c.message.slice(0, 110) + "…" : c.message}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--mu)" }}>
                      {c.createdAt ? new Date(c.createdAt).toLocaleString("en-IN") : "Just now"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="secondary-button small-button"
                        onClick={() => handleDelete(c)}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {createModalOpen && (
        <CampaignCreateModal
          onClose={onCloseCreateModal}
          onCreated={(created) => {
            const next = [created, ...campaigns.filter((x) => x.id !== created.id)];
            setCampaigns(next);
            try {
              localStorage.setItem(CAMPAIGNS_CACHE_KEY, JSON.stringify(next));
            } catch { }
            window.dispatchEvent(new Event("hivecity:campaigns-updated"));
            onCloseCreateModal();
          }}
        />
      )}
    </div>
  );
}

function CampaignCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (campaign: AdminCampaignRecord) => void;
}) {
  const [category, setCategory] = useState<"Run" | "Food & Beverages">("Run");
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [message, setMessage] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressImageToDataUrl(file);
      setImageUrl(compressed);
      toast.success("Campaign image ready.");
    } catch (err: any) {
      toast.error(err?.message || "Could not process image.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a Campaign Title / Headline.");
      return;
    }
    if (!message.trim()) {
      toast.error("Please enter a Campaign Message / Description.");
      return;
    }
    setSubmitting(true);
    const offlineId = `CMP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      saveOfflineNotificationLog({
        id: offlineId,
        category,
        title: title.trim(),
        imageUrl: imageUrl.trim(),
        message: message.trim(),
        ctaUrl: ctaUrl.trim(),
        deliveryStatus: "Internet Issue",
        deliveryMessage:
          "Not sent due to an internet connection issue. Please check your connection and resend.",
        resendCount: 0,
        createdAt: new Date().toISOString(),
        isUnsentLocalDraft: true,
      });
      window.dispatchEvent(new Event("hivecity:campaigns-updated"));
      toast.error("Not sent due to an internet connection issue. Saved to Notifications to resend.");
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: offlineId,
          category,
          title: title.trim(),
          imageUrl: imageUrl.trim(),
          message: message.trim(),
          ctaUrl: ctaUrl.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.campaign) {
        saveOfflineNotificationLog({
          id: offlineId,
          category,
          title: title.trim(),
          imageUrl: imageUrl.trim(),
          message: message.trim(),
          ctaUrl: ctaUrl.trim(),
          deliveryStatus: "Not Sent",
          deliveryMessage: data.error || "Campaign notification failed to deliver.",
          resendCount: 0,
          createdAt: new Date().toISOString(),
          isUnsentLocalDraft: true,
        });
        window.dispatchEvent(new Event("hivecity:campaigns-updated"));
        throw new Error(data.error || "Failed to publish campaign.");
      }
      toast.success(`Campaign "${data.campaign.title}" published to User Notifications.`);
      onCreated(data.campaign);
    } catch (err: any) {
      if (err instanceof TypeError) {
        saveOfflineNotificationLog({
          id: offlineId,
          category,
          title: title.trim(),
          imageUrl: imageUrl.trim(),
          message: message.trim(),
          ctaUrl: ctaUrl.trim(),
          deliveryStatus: "Internet Issue",
          deliveryMessage:
            "Not sent due to an internet connection issue. Please check your connection and resend.",
          resendCount: 0,
          createdAt: new Date().toISOString(),
          isUnsentLocalDraft: true,
        });
        window.dispatchEvent(new Event("hivecity:campaigns-updated"));
      }
      toast.error(err?.message || "Could not publish campaign.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 620, maxHeight: "90vh", overflowY: "auto" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="panel-eyebrow">MARKETING / CAMPAIGN STUDIO</span>
            <h2>Create campaign announcement</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="field-label">
            Campaign Category
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value === "Food & Beverages" ? "Food & Beverages" : "Run")
              }
            >
              <option value="Run">Run</option>
              <option value="Food & Beverages">Food &amp; Beverages</option>
            </select>
          </label>

          <label className="field-label">
            Campaign Title / Headline
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sunday 5K City Run & Hydration Booth"
            />
          </label>

          <label className="field-label">
            Campaign Image Upload
            <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
          </label>

          <label className="field-label">
            Or Image URL (Optional)
            <input
              value={imageUrl.startsWith("data:") ? "" : imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>

          {imageUrl && (
            <div style={{ margin: "6px 0 12px" }}>
              <img
                src={imageUrl}
                alt="Campaign preview"
                style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12 }}
              />
            </div>
          )}

          <label className="field-label">
            Campaign Message / Description
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Full announcement details, timing, venue, or offer notes..."
            />
          </label>

          <label className="field-label">
            Action Link / CTA (Optional)
            <input
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="e.g. #events or https://..."
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={submitting || uploading}>
              {submitting ? "Publishing..." : "Publish campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
