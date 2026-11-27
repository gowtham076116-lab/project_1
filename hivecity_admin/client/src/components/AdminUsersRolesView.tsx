import { useMemo, useState } from "react";
import { Database, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

export interface AdminAccessUser {
  id: string;
  name: string;
  email: string;
  status: string;
  photoURL?: string | null;
  mobile?: string | null;
}

export function AdminUsersRolesView({
  users,
  loading,
  search,
  onRefreshUsers,
}: {
  users: AdminAccessUser[];
  loading: boolean;
  search: string;
  onRefreshUsers: () => void;
}) {
  const [restrictTarget, setRestrictTarget] = useState<AdminAccessUser | null>(null);
  const [warningText, setWarningText] = useState("Don't do unwanted activity");
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [localStatusOverrides, setLocalStatusOverrides] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.id} ${u.name} ${u.email} ${localStatusOverrides[u.id] || u.status}`
        .toLowerCase()
        .includes(q)
    );
  }, [users, search, localStatusOverrides]);

  const getInitials = (name: string, email: string) => {
    const src = (name || email || "U").trim();
    return src
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase();
  };

  const handleConfirmRestrict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restrictTarget) return;
    const uid = restrictTarget.id;
    const message = warningText.trim() || "Don't do unwanted activity";
    setBusyUid(uid);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/restrict`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warningMessage: message,
          email: restrictTarget.email,
          displayName: restrictTarget.name,
          mobile: restrictTarget.mobile || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to restrict user.");
      setLocalStatusOverrides((prev) => ({ ...prev, [uid]: "Restricted" }));
      toast.success(`Warning sent to ${restrictTarget.name} and status updated to Restricted.`);
      setRestrictTarget(null);
      onRefreshUsers();
    } catch (err: any) {
      toast.error(err?.message || "Could not send warning.");
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleBlock = async (user: AdminAccessUser, currentlyBlocked: boolean) => {
    const nextBlocked = !currentlyBlocked;
    const confirmMsg = nextBlocked
      ? `Block "${user.name}" (${user.id})? They will be signed out immediately and prevented from logging in until unblocked.`
      : `Unblock "${user.name}" (${user.id}) and restore login access?`;
    if (!window.confirm(confirmMsg)) return;

    setBusyUid(user.id);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/block`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocked: nextBlocked,
          email: user.email,
          displayName: user.name,
          mobile: user.mobile || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update block status.");
      setLocalStatusOverrides((prev) => ({
        ...prev,
        [user.id]: nextBlocked ? "Blocked" : "Verified",
      }));
      toast.success(
        nextBlocked
          ? `${user.name} has been blocked and signed out.`
          : `${user.name} has been unblocked.`
      );
      onRefreshUsers();
    } catch (err: any) {
      toast.error(err?.message || "Could not update block status.");
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="content-page">
      <section className="surface" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-toolbar">
          <div className="toolbar-copy">
            <span className="result-count">
              {filtered.length} {filtered.length === 1 ? "user" : "users"}
            </span>
            <span className="toolbar-muted">
              Restrict with warning or Block/Unblock registered User IDs in real time
            </span>
          </div>
        </div>

        {loading && users.length === 0 ? (
          <div className="empty-state-block" style={{ margin: 20 }}>
            <div className="empty-state-icon">
              <Database size={22} />
            </div>
            <h4>Loading registered users...</h4>
            <p>Fetching live users from Firestore and Google Sheets.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state-block" style={{ margin: 20 }}>
            <div className="empty-state-icon">
              <Database size={22} />
            </div>
            <h4>No registered users found</h4>
            <p>Registered users from Firestore and Google Sheets will appear here automatically.</p>
          </div>
        ) : (
          <div style={{ display: "grid" }}>
            {filtered.map((user) => {
              const effectiveStatus = localStatusOverrides[user.id] || user.status || "Verified";
              const statusLower = effectiveStatus.toLowerCase();
              const isBlocked = statusLower === "blocked";
              const isRestricted = statusLower === "restricted";
              const pillClass = isBlocked
                ? "suspended"
                : isRestricted || statusLower.includes("pending")
                  ? "pending"
                  : "verified";
              const isBusy = busyUid === user.id;

              return (
                <div
                  key={user.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "14px 20px",
                    borderBottom: "1px solid var(--bd)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 260 }}>
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.name}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          objectFit: "cover",
                          border: "1px solid var(--bd)",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          background: "#1B4D3E",
                          color: "#FFFFFF",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 700,
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(user.name, user.email)}
                      </div>
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 14 }}>{user.name || "Hive Athlete"}</strong>
                        <span className={`status-pill ${pillClass}`}>{effectiveStatus}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--mu)", marginTop: 2, wordBreak: "break-all" }}>
                        <span>{user.email}</span>
                        {" · "}
                        <code style={{ fontSize: 11 }}>{user.id}</code>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      className="secondary-button small-button"
                      disabled={isBusy}
                      onClick={() => {
                        setRestrictTarget(user);
                        setWarningText("Don't do unwanted activity");
                      }}
                    >
                      <ShieldAlert size={13} /> Restrict
                    </button>
                    <button
                      type="button"
                      className={isBlocked ? "primary-button small-button" : "secondary-button small-button"}
                      style={
                        isBlocked
                          ? undefined
                          : { borderColor: "rgba(220, 38, 38, 0.35)", color: "#dc2626" }
                      }
                      disabled={isBusy}
                      onClick={() => handleToggleBlock(user, isBlocked)}
                    >
                      {isBusy ? "Updating..." : isBlocked ? "Unblock" : "Block"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {restrictTarget && (
        <div className="modal-backdrop" onMouseDown={() => setRestrictTarget(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 480 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="panel-eyebrow">ADMINISTRATION / RESTRICT USER</span>
                <h2>Send warning to {restrictTarget.name}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setRestrictTarget(null)}>
                <X size={17} />
              </button>
            </div>
            <form onSubmit={handleConfirmRestrict}>
              <p style={{ fontSize: 12, color: "var(--mu)", marginBottom: 12 }}>
                User ID: <code>{restrictTarget.id}</code> ({restrictTarget.email})
              </p>
              <label className="field-label">
                Warning Message
                <textarea
                  rows={3}
                  required
                  value={warningText}
                  onChange={(e) => setWarningText(e.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setRestrictTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={busyUid === restrictTarget.id}
                >
                  {busyUid === restrictTarget.id ? "Sending..." : "Send Warning & Restrict"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
