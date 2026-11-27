import { useState, useMemo, useEffect, useCallback } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { CalendarDays, Users, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "../lib/firebase";

export interface AdminCommunitySession {
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
  sessionType: "free" | "paid";
  ticketPrice: number;
  currency: string;
  registrationDeadline: string;
  status: "draft" | "published" | "cancelled" | "completed";
  metrics: {
    totalRegistrations: number;
    confirmedParticipants: number;
    pendingRegistrations: number;
    cancelledRegistrations: number;
    availableSeats: number;
    paidParticipants: number;
    freeParticipants: number;
    verifiedRevenue: number;
  };
}

export interface AdminSessionParticipant {
  registrationId: string;
  sessionId: string;
  userId: string;
  userName: string;
  userEmail: string;
  sessionType: "free" | "paid";
  registrationStatus: "pending" | "confirmed" | "cancelled";
  paymentStatus: "free" | "pending" | "verified" | "failed" | "refunded";
  amountPaid: number;
  paymentId: string | null;
  updatedAt: string;
}

export interface AdminRevenueSummary {
  grossVerifiedRevenue: number;
  refundedAmount: number;
  netVerifiedRevenue: number;
  verifiedTransactionsCount: number;
  averageOrderValue: number;
  pendingCount: number;
  failedCount: number;
  transactions: {
    paymentId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    sessionId: string;
    sessionTitle?: string;
    userName?: string;
    userEmail?: string;
    amount: number;
    currency: string;
    paymentStatus: string;
    verifiedAt: string | null;
    createdAt: string;
  }[];
}

const formatInr = (n: number) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

export function CommunitySessionsAdmin({
  search,
  createModalOpen,
  onCloseCreateModal,
}: {
  search: string;
  createModalOpen: boolean;
  onCloseCreateModal: () => void;
}) {
  const [sessions, setSessions] = useState<AdminCommunitySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingSession, setEditingSession] = useState<AdminCommunitySession | null>(null);
  const [participantsSession, setParticipantsSession] = useState<AdminCommunitySession | null>(null);
  const [participants, setParticipants] = useState<AdminSessionParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/community-sessions", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.sessions)) setSessions(data.sessions);
    } catch (err) {
      console.warn("[Admin CommunitySessions] Load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
    const unsubs: (() => void)[] = [];
    try {
      unsubs.push(
        onSnapshot(collection(db, "community_sessions"), () => {
          void loadSessions();
        }, () => { })
      );
      unsubs.push(
        onSnapshot(collection(db, "community_session_registrations"), () => {
          void loadSessions();
        }, () => { })
      );
    } catch { }
    return () => {
      unsubs.forEach((u) => {
        try { u(); } catch { }
      });
    };
  }, [loadSessions]);

  const openParticipants = async (session: AdminCommunitySession) => {
    setParticipantsSession(session);
    setParticipants([]);
    setParticipantsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/community-sessions/${encodeURIComponent(session.sessionId)}/participants`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.participants)) setParticipants(data.participants);
      }
    } finally {
      setParticipantsLoading(false);
    }
  };

  const handleStatusChange = async (
    session: AdminCommunitySession,
    status: "draft" | "published" | "cancelled" | "completed"
  ) => {
    try {
      const res = await fetch(`/api/admin/community-sessions/${encodeURIComponent(session.sessionId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast.success(`Session "${session.title}" marked as ${status}.`);
      void loadSessions();
    } catch (err: any) {
      toast.error(err?.message || "Could not update session status.");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      `${s.title} ${s.category} ${s.organizer} ${s.locationOrMeetingDetails} ${s.status} ${s.sessionType}`
        .toLowerCase()
        .includes(q)
    );
  }, [sessions, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, s) => ({
        registrations: acc.registrations + (s.metrics?.totalRegistrations || 0),
        confirmed: acc.confirmed + (s.metrics?.confirmedParticipants || 0),
        availableSeats: acc.availableSeats + (s.metrics?.availableSeats || 0),
        verifiedRevenue: acc.verifiedRevenue + (s.metrics?.verifiedRevenue || 0),
      }),
      { registrations: 0, confirmed: 0, availableSeats: 0, verifiedRevenue: 0 }
    );
  }, [filtered]);

  const modalVisible = createModalOpen || Boolean(editingSession);

  return (
    <div className="content-page">
      <section className="metric-strip">
        <div className="surface mini-metric">
          <span>Total registrations</span>
          <strong>{totals.registrations}</strong>
          <span className="positive">{filtered.length} sessions</span>
        </div>
        <div className="surface mini-metric">
          <span>Confirmed participants</span>
          <strong>{totals.confirmed}</strong>
          <span className="positive">{totals.availableSeats} seats available</span>
        </div>
        <div className="surface mini-metric">
          <span>Verified revenue</span>
          <strong>{formatInr(totals.verifiedRevenue)}</strong>
          <span className="positive">Verified payments only</span>
        </div>
      </section>

      {loading && sessions.length === 0 ? (
        <div className="empty-state-block">
          <div className="empty-state-icon">
            <CalendarDays size={22} />
          </div>
          <h4>Loading community sessions...</h4>
          <p>Fetching live sessions, participant counts, and verified revenue.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state-block">
          <div className="empty-state-icon">
            <Users size={22} />
          </div>
          <h4>No community sessions yet</h4>
          <p>Use the + Create new button at the top right to publish free or paid community sessions.</p>
        </div>
      ) : (
        <section className="surface" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Schedule & Location</th>
                  <th>Fee</th>
                  <th>Participants</th>
                  <th>Verified Revenue</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.sessionId}>
                    <td>
                      <div className="cell-primary">
                        <strong>{s.title}</strong>
                        <span>
                          {s.category} · {s.organizer}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-primary">
                        <strong>
                          {s.date} {s.startTime ? `· ${s.startTime}` : ""}
                          {s.endTime ? `–${s.endTime}` : ""}
                        </strong>
                        <span>{s.locationOrMeetingDetails || "Location TBD"}</span>
                      </div>
                    </td>
                    <td>
                      <strong>{s.sessionType === "paid" ? formatInr(s.ticketPrice) : "FREE"}</strong>
                    </td>
                    <td>
                      <div className="cell-primary">
                        <strong>
                          {s.metrics.confirmedParticipants} / {s.maxCapacity} confirmed
                        </strong>
                        <span>
                          {s.metrics.pendingRegistrations} pending · {s.metrics.cancelledRegistrations} cancelled ·{" "}
                          {s.metrics.availableSeats} left
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong>{formatInr(s.metrics.verifiedRevenue)}</strong>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          s.status === "published"
                            ? "verified"
                            : s.status === "cancelled"
                              ? "suspended"
                              : "pending"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="secondary-button small-button"
                          onClick={() => openParticipants(s)}
                        >
                          Participants ({s.metrics.totalRegistrations})
                        </button>
                        <button
                          type="button"
                          className="secondary-button small-button"
                          onClick={() => setEditingSession(s)}
                        >
                          Edit
                        </button>
                        {s.status !== "published" && s.status !== "cancelled" && (
                          <button
                            type="button"
                            className="primary-button small-button"
                            onClick={() => handleStatusChange(s, "published")}
                          >
                            Publish
                          </button>
                        )}
                        {s.status === "published" && (
                          <button
                            type="button"
                            className="secondary-button small-button"
                            onClick={() => handleStatusChange(s, "draft")}
                          >
                            Unpublish
                          </button>
                        )}
                        {s.status !== "cancelled" && (
                          <button
                            type="button"
                            className="secondary-button small-button"
                            onClick={() => handleStatusChange(s, "cancelled")}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {modalVisible && (
        <SessionFormModal
          initial={editingSession}
          onClose={() => {
            setEditingSession(null);
            onCloseCreateModal();
          }}
          onSaved={() => {
            setEditingSession(null);
            onCloseCreateModal();
            void loadSessions();
          }}
        />
      )}

      {participantsSession && (
        <div className="modal-backdrop" onMouseDown={() => setParticipantsSession(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 760, maxHeight: "88vh", overflowY: "auto" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="panel-eyebrow">COMMUNITY SESSIONS / PARTICIPANTS</span>
                <h2>{participantsSession.title}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setParticipantsSession(null)}>
                <X size={17} />
              </button>
            </div>
            {participantsLoading ? (
              <p style={{ padding: "16px 0", color: "var(--mu)" }}>Loading participants…</p>
            ) : participants.length === 0 ? (
              <p style={{ padding: "16px 0", color: "var(--mu)" }}>No registrations yet for this session.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>Registration</th>
                      <th>Payment</th>
                      <th>Amount</th>
                      <th>Payment ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.registrationId}>
                        <td>
                          <div className="cell-primary">
                            <strong>{p.userName}</strong>
                            <span>{p.userEmail || p.userId}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status-pill ${
                              p.registrationStatus === "confirmed"
                                ? "verified"
                                : p.registrationStatus === "cancelled"
                                  ? "suspended"
                                  : "pending"
                            }`}
                          >
                            {p.registrationStatus}
                          </span>
                        </td>
                        <td>
                          <span className="status-pill verified">{p.paymentStatus}</span>
                        </td>
                        <td>{p.amountPaid > 0 ? formatInr(p.amountPaid) : "FREE"}</td>
                        <td style={{ fontSize: 12 }}>{p.paymentId || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminCommunitySession | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "Running");
  const [organizer, setOrganizer] = useState(initial?.organizer || "Hive City Team");
  const [coverImage, setCoverImage] = useState(initial?.coverImage || "");
  const [date, setDate] = useState(initial?.date || "");
  const [startTime, setStartTime] = useState(initial?.startTime || "06:30");
  const [endTime, setEndTime] = useState(initial?.endTime || "08:00");
  const [locationOrMeetingDetails, setLocationOrMeetingDetails] = useState(initial?.locationOrMeetingDetails || "");
  const [maxCapacity, setMaxCapacity] = useState(String(initial?.maxCapacity || 30));
  const [sessionType, setSessionType] = useState<"free" | "paid">(initial?.sessionType || "free");
  const [ticketPrice, setTicketPrice] = useState(String(initial?.ticketPrice || 0));
  const [registrationDeadline, setRegistrationDeadline] = useState(initial?.registrationDeadline || "");
  const [status, setStatus] = useState<"draft" | "published" | "cancelled" | "completed">(
    initial?.status || "published"
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date.trim()) {
      toast.error("Please fill Session Title and Date.");
      return;
    }
    const priceNum = sessionType === "paid" ? Number(ticketPrice || 0) : 0;
    if (sessionType === "paid" && (!Number.isFinite(priceNum) || priceNum <= 0)) {
      toast.error("Paid sessions require a Ticket Price greater than ₹0.");
      return;
    }
    setSubmitting(true);
    try {
      const url = initial
        ? `/api/admin/community-sessions/${encodeURIComponent(initial.sessionId)}`
        : "/api/admin/community-sessions";
      const res = await fetch(url, {
        method: initial ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category: category.trim(),
          organizer: organizer.trim(),
          coverImage: coverImage.trim(),
          date: date.trim(),
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          locationOrMeetingDetails: locationOrMeetingDetails.trim(),
          maxCapacity: Math.max(1, Number(maxCapacity) || 20),
          sessionType,
          ticketPrice: priceNum,
          currency: "INR",
          registrationDeadline: registrationDeadline.trim(),
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save session.");
      toast.success(initial ? "Community session updated." : "Community session saved.");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save session.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 660, maxHeight: "90vh", overflowY: "auto" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="panel-eyebrow">PEOPLE / COMMUNITY SESSIONS</span>
            <h2>{initial ? `Edit "${initial.title}"` : "Create community session"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="field-label">
            Session Title
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sunday Mobility & Breathwork" />
          </label>
          <label className="field-label">
            Description & Instructions
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What participants should expect or bring..." />
          </label>
          <div className="form-grid">
            <label className="field-label">
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="Running">Running</option>
                <option value="Strength">Strength</option>
                <option value="Mobility">Mobility</option>
                <option value="Nutrition">Nutrition</option>
                <option value="Wellness">Wellness</option>
                <option value="Community">Community</option>
              </select>
            </label>
            <label className="field-label">
              Organizer
              <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder="Coach / Organizer name" />
            </label>
          </div>
          <div className="form-grid">
            <label className="field-label">
              Date
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field-label">
              Registration Deadline
              <input type="datetime-local" value={registrationDeadline} onChange={(e) => setRegistrationDeadline(e.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label className="field-label">
              Start Time
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="field-label">
              End Time
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>
          <label className="field-label">
            Location / Meeting Details
            <input value={locationOrMeetingDetails} onChange={(e) => setLocationOrMeetingDetails(e.target.value)} placeholder="Venue address or online meeting details" />
          </label>
          <label className="field-label">
            Cover Image URL (optional)
            <input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://..." />
          </label>
          <div className="form-grid">
            <label className="field-label">
              Session Type
              <select
                value={sessionType}
                onChange={(e) => {
                  const next = e.target.value === "paid" ? "paid" : "free";
                  setSessionType(next);
                  if (next === "free") setTicketPrice("0");
                }}
              >
                <option value="free">Free</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="field-label">
              Ticket Price (₹)
              <input
                type="number"
                min={0}
                disabled={sessionType === "free"}
                value={sessionType === "free" ? "0" : ticketPrice}
                onChange={(e) => setTicketPrice(e.target.value)}
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="field-label">
              Max Capacity
              <input type="number" min={1} required value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} />
            </label>
            <label className="field-label">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "Saving..." : initial ? "Save changes" : "Create session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
