import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { Check, Database, Mail, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "../lib/firebase";

export interface SupportTicketItem {
  id: string;
  userId: string;
  userName: string;
  mobile: string;
  email: string;
  subject: string;
  concern: string;
  status: "Open" | "Verified & Resolved";
  createdAt: string;
  updatedAt: string;
}

export function SupportCentreAdmin({ search }: { search: string }) {
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SupportTicketItem | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/support/tickets", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tickets)) setTickets(data.tickets);
      }
    } catch (err) {
      console.warn("[SupportCentre] Load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    const onRefresh = () => void loadTickets();
    window.addEventListener("hivecity:support-updated", onRefresh);

    // Real-time Firestore onSnapshot listener so new Help requests appear instantaneously
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        collection(db, "support_tickets"),
        (snap) => {
          const live: SupportTicketItem[] = [];
          snap.forEach((docSnap) => {
            const d = docSnap.data() || {};
            const toIso = (v: any) =>
              v && typeof v.toDate === "function" ? v.toDate().toISOString() : String(v || "");
            live.push({
              id: docSnap.id,
              userId: String(d.userId || "guest"),
              userName: String(d.userName || "Hive Athlete"),
              mobile: String(d.mobile || ""),
              email: String(d.email || ""),
              subject: String(d.subject || "Other"),
              concern: String(d.concern || d.message || ""),
              status:
                String(d.status || "").toLowerCase().includes("resolved")
                  ? "Verified & Resolved"
                  : "Open",
              createdAt: toIso(d.createdAt) || new Date().toISOString(),
              updatedAt: toIso(d.updatedAt) || new Date().toISOString(),
            });
          });
          if (live.length > 0) {
            live.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
            setTickets(live);
          }
        },
        () => { }
      );
    } catch { }

    return () => {
      window.removeEventListener("hivecity:support-updated", onRefresh);
      if (unsub) unsub();
    };
  }, [loadTickets]);

  const handleToggleStatus = async (ticket: SupportTicketItem) => {
    const nextStatus: "Open" | "Verified & Resolved" =
      ticket.status === "Verified & Resolved" ? "Open" : "Verified & Resolved";
    setUpdatingId(ticket.id);
    // Optimistic UI update — zero perceived lag
    const optimisticTicket: SupportTicketItem = { ...ticket, status: nextStatus, updatedAt: new Date().toISOString() };
    setTickets((prev) => prev.map((t) => (t.id === ticket.id ? optimisticTicket : t)));
    setSelected(optimisticTicket);
    try {
      const res = await fetch(`/api/admin/support/tickets/${encodeURIComponent(ticket.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ticket) throw new Error(data.error || "Update failed");
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? data.ticket : t)));
      setSelected(data.ticket);
      toast.success(`Ticket #${ticket.id} marked as ${nextStatus}.`);
    } catch (err: any) {
      // Revert optimistic update on failure
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? ticket : t)));
      setSelected(ticket);
      toast.error(err?.message || "Could not update ticket status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) =>
      `${t.userName} ${t.subject} ${t.concern} ${t.mobile} ${t.email} ${t.status}`
        .toLowerCase()
        .includes(q)
    );
  }, [tickets, search]);

  return (
    <div className="content-page">
      <section className="surface" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-toolbar">
          <div className="toolbar-copy">
            <span className="result-count">
              {filtered.length} {filtered.length === 1 ? "concern" : "concerns"}
            </span>
            <span className="toolbar-muted">
              Click any user concern to view full details, call, or reply via email
            </span>
          </div>
        </div>

        {loading && tickets.length === 0 ? (
          <div className="empty-state-block" style={{ margin: 20 }}>
            <div className="empty-state-icon">
              <Database size={22} />
            </div>
            <h4>Loading support requests...</h4>
            <p>Syncing incoming help requests from users.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state-block" style={{ margin: 20 }}>
            <div className="empty-state-icon">
              <Database size={22} />
            </div>
            <h4>No support requests yet</h4>
            <p>
              Help requests submitted by users from the Help tab will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Subject &amp; Preview</th>
                  <th>Received</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const preview =
                    t.concern.length > 72 ? t.concern.slice(0, 72) + "…" : t.concern;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t)}
                      style={{ cursor: "pointer" }}
                      title="Click to enlarge and respond"
                    >
                      <td>
                        <div className="cell-primary">
                          <strong>{t.userName}</strong>
                          <span>{t.mobile || t.email || t.id}</span>
                        </div>
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <div className="cell-primary">
                          <strong>{t.subject}</strong>
                          <span
                            style={{
                              display: "block",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: 360,
                            }}
                          >
                            {preview}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--mu)", whiteSpace: "nowrap" }}>
                        {t.createdAt ? new Date(t.createdAt).toLocaleString("en-IN") : "Just now"}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${t.status === "Verified & Resolved" ? "verified" : "pending"
                            }`}
                        >
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 620, maxHeight: "90vh", overflowY: "auto" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="panel-eyebrow">SUPPORT CENTRE · #{selected.id}</span>
                <h2>{selected.subject}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelected(null)}>
                <X size={17} />
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <span
                className={`status-pill ${selected.status === "Verified & Resolved" ? "verified" : "pending"
                  }`}
              >
                {selected.status}
              </span>
              <strong style={{ fontSize: 14 }}>{selected.userName}</strong>
              <small style={{ color: "var(--mu)" }}>
                {selected.createdAt ? new Date(selected.createdAt).toLocaleString("en-IN") : "Just now"}
              </small>
            </div>

            <div
              className="surface"
              style={{
                padding: "14px 16px",
                marginBottom: 16,
                background: "var(--bg)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
                fontSize: 14,
              }}
            >
              {selected.concern}
            </div>

            <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
              {selected.mobile && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--bd)",
                  }}
                >
                  <div>
                    <small style={{ color: "var(--mu)", display: "block" }}>Mobile Number</small>
                    <strong>{selected.mobile}</strong>
                  </div>
                  <a
                    href={`tel:${selected.mobile.replace(/\s+/g, "")}`}
                    className="primary-button small-button"
                  >
                    <Phone size={14} /> Call
                  </a>
                </div>
              )}

              {selected.email && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--bd)",
                  }}
                >
                  <div>
                    <small style={{ color: "var(--mu)", display: "block" }}>Email ID</small>
                    <strong>{selected.email}</strong>
                  </div>
                  <a
                    href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject}`)}`}
                    className="primary-button small-button"
                  >
                    <Mail size={14} /> Reply via Email
                  </a>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setSelected(null)}>
                Close
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={updatingId === selected.id}
                onClick={() => handleToggleStatus(selected)}
              >
                <Check size={15} />
                {selected.status === "Verified & Resolved"
                  ? "Reopen Ticket"
                  : "Mark Verified & Resolved"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
