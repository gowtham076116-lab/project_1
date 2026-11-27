import { useEffect, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { KeyRound, LogOut, Save, ShieldCheck, Sliders } from "lucide-react";
import { toast } from "sonner";
import { useAdminAuth } from "../contexts/AdminAuthContext";
import { auth, db } from "../lib/firebase";

export interface PlatformSettingsDoc {
  userRegistrationOpen: boolean;
  communityPostingEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceNotice: string;
  announcementEnabled: boolean;
  announcementText: string;
}

const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsDoc = {
  userRegistrationOpen: true,
  communityPostingEnabled: true,
  maintenanceMode: false,
  maintenanceNotice:
    "We are performing scheduled platform upgrades. Some features may be temporarily unavailable.",
  announcementEnabled: false,
  announcementText: "",
};

export function SettingsAdminView() {
  const { admin, firebaseUser, logout, updateAdminProfile } = useAdminAuth();

  // 1. Admin Profile & Security state
  const [displayName, setDisplayName] = useState(admin?.name || firebaseUser?.displayName || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // 2. Live Firestore settings/platform state
  const [settings, setSettings] = useState<PlatformSettingsDoc>(DEFAULT_PLATFORM_SETTINGS);
  const [savingControls, setSavingControls] = useState(false);

  useEffect(() => {
    setDisplayName(admin?.name || firebaseUser?.displayName || "");
  }, [admin?.name, firebaseUser?.displayName]);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        doc(db, "settings", "platform"),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data() || {};
            setSettings({
              userRegistrationOpen: d.userRegistrationOpen !== false,
              communityPostingEnabled: d.communityPostingEnabled !== false,
              maintenanceMode: Boolean(d.maintenanceMode),
              maintenanceNotice:
                typeof d.maintenanceNotice === "string"
                  ? d.maintenanceNotice
                  : DEFAULT_PLATFORM_SETTINGS.maintenanceNotice,
              announcementEnabled: Boolean(d.announcementEnabled),
              announcementText: typeof d.announcementText === "string" ? d.announcementText : "",
            });
          }
        },
        () => { }
      );
    } catch { }
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const persistPlatformSettings = async (next: PlatformSettingsDoc, successMsg?: string) => {
    setSettings(next);
    setSavingControls(true);
    try {
      await setDoc(
        doc(db, "settings", "platform"),
        {
          ...next,
          updatedBy: admin?.email || "admin",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast.success(successMsg || "Platform settings synced live to User Site.");
    } catch (err: any) {
      console.warn("[AdminSettings] Firestore write note:", err);
      toast.error(err?.message || "Could not sync settings to Firestore.");
    } finally {
      setSavingControls(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = displayName.trim();
    if (!clean) {
      toast.error("Display Name cannot be empty.");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await updateAdminProfile(clean);
      if (!res.success) throw new Error(res.error || "Profile update failed.");
      toast.success("Admin profile updated in Firebase Auth & Firestore.");
    } catch (err: any) {
      toast.error(err?.message || "Could not update Admin profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendPasswordReset = async () => {
    const email = (admin?.email || firebaseUser?.email || "").trim();
    if (!email) {
      toast.error("No verified admin email found.");
      return;
    }
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success(`Password reset email sent to ${email}.`);
    } catch (err: any) {
      toast.error(err?.message || "Could not send password reset email.");
    } finally {
      setSendingReset(false);
    }
  };

  const initials = (displayName || admin?.email || "A")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();

  return (
    <div className="content-page" style={{ display: "grid", gap: 18 }}>
      {/* CARD 1: Admin Profile & Security */}
      <section className="surface" style={{ padding: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <span className="panel-eyebrow">ADMINISTRATION / PROFILE &amp; SECURITY</span>
            <h2 style={{ margin: "4px 0 0" }}>Admin Profile &amp; Security</h2>
          </div>
          <span className="status-pill verified">
            <ShieldCheck size={13} style={{ marginRight: 4 }} />
            {admin?.role || "ADMIN"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          {firebaseUser?.photoURL ? (
            <img
              src={firebaseUser.photoURL}
              alt={displayName || "Admin"}
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid #1B4D3E",
              }}
            />
          ) : (
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "#1B4D3E",
                color: "#FFFFFF",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 20,
              }}
            >
              {initials}
            </div>
          )}
          <div>
            <strong style={{ display: "block", fontSize: 16 }}>{displayName || "Hive City Admin"}</strong>
            <span style={{ fontSize: 13, color: "var(--mu)" }}>
              {admin?.email || firebaseUser?.email || "hivecity10@gmail.com"} · Verified Administrator
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} style={{ display: "grid", gap: 14 }}>
          <div className="form-grid">
            <label className="field-label">
              Display Name
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Administrator display name"
              />
            </label>
            <label className="field-label">
              Verified Email Address
              <input
                type="email"
                readOnly
                disabled
                value={admin?.email || firebaseUser?.email || ""}
              />
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <button type="submit" className="primary-button" disabled={savingProfile}>
              <Save size={15} />
              {savingProfile ? "Saving..." : "Edit & Save Profile"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={sendingReset}
              onClick={handleSendPasswordReset}
            >
              <KeyRound size={15} />
              {sendingReset ? "Sending..." : "Send Password Reset Email"}
            </button>
            <button
              type="button"
              className="secondary-button"
              style={{ marginLeft: "auto", color: "#dc2626", borderColor: "rgba(220, 38, 38, 0.3)" }}
              onClick={() => void logout()}
            >
              <LogOut size={15} />
              Secure Sign Out
            </button>
          </div>
        </form>
      </section>

      {/* CARD 2: Workable User-Site Platform Controls (Synced Live to Firestore settings/platform) */}
      <section className="surface" style={{ padding: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <span className="panel-eyebrow">LIVE PLATFORM CONTROLS · FIRESTORE settings/platform</span>
            <h2 style={{ margin: "4px 0 0" }}>User-Site Platform Controls</h2>
          </div>
          <span className="live-sync-indicator">
            <i className="status-pulse" /> {savingControls ? "Syncing..." : "Live Synced"}
          </span>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {/* Toggle 1: User Registration Open */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid var(--bd)",
            }}
          >
            <div>
              <strong style={{ display: "block", fontSize: 14 }}>User Registration Open</strong>
              <small style={{ color: "var(--mu)" }}>
                Enables or blocks new user account sign-ups on the user-facing site in real time.
              </small>
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={settings.userRegistrationOpen}
                onChange={(e) =>
                  void persistPlatformSettings(
                    { ...settings, userRegistrationOpen: e.target.checked },
                    e.target.checked ? "User registration opened." : "User registration paused."
                  )
                }
              />
              {settings.userRegistrationOpen ? "Open" : "Paused"}
            </label>
          </div>

          {/* Toggle 2: Community Social Posting & Comments */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid var(--bd)",
            }}
          >
            <div>
              <strong style={{ display: "block", fontSize: 14 }}>Community Social Posting &amp; Comments</strong>
              <small style={{ color: "var(--mu)" }}>
                Allows or pauses new posts and comments on the user Social page immediately.
              </small>
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={settings.communityPostingEnabled}
                onChange={(e) =>
                  void persistPlatformSettings(
                    { ...settings, communityPostingEnabled: e.target.checked },
                    e.target.checked ? "Social posting & comments enabled." : "Social posting & comments paused."
                  )
                }
              />
              {settings.communityPostingEnabled ? "Active" : "Paused"}
            </label>
          </div>

          {/* Toggle 3: User Site Maintenance Mode + Custom Notice */}
          <div
            style={{
              display: "grid",
              gap: 10,
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid var(--bd)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                <strong style={{ display: "block", fontSize: 14 }}>User Site Maintenance Mode</strong>
                <small style={{ color: "var(--mu)" }}>
                  Displays a maintenance notice overlay across the user site while active.
                </small>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={settings.maintenanceMode}
                  onChange={(e) =>
                    void persistPlatformSettings(
                      { ...settings, maintenanceMode: e.target.checked },
                      e.target.checked ? "Maintenance Mode enabled." : "Maintenance Mode disabled."
                    )
                  }
                />
                {settings.maintenanceMode ? "Enabled" : "Off"}
              </label>
            </div>
            <label className="field-label" style={{ margin: 0 }}>
              Custom Maintenance Notice Message
              <input
                type="text"
                value={settings.maintenanceNotice}
                onChange={(e) => setSettings((prev) => ({ ...prev, maintenanceNotice: e.target.value }))}
                placeholder="Maintenance notice displayed to users..."
              />
            </label>
          </div>

          {/* Toggle 4: Global Top Announcement Banner */}
          <div
            style={{
              display: "grid",
              gap: 10,
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid var(--bd)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                <strong style={{ display: "block", fontSize: 14 }}>Global Top Announcement Banner</strong>
                <small style={{ color: "var(--mu)" }}>
                  Displays a live announcement bar across the top of the user-facing website.
                </small>
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={settings.announcementEnabled}
                  onChange={(e) =>
                    void persistPlatformSettings(
                      { ...settings, announcementEnabled: e.target.checked },
                      e.target.checked ? "Announcement banner activated." : "Announcement banner hidden."
                    )
                  }
                />
                {settings.announcementEnabled ? "Active" : "Off"}
              </label>
            </div>
            <label className="field-label" style={{ margin: 0 }}>
              Announcement Banner Text
              <input
                type="text"
                value={settings.announcementText}
                onChange={(e) => setSettings((prev) => ({ ...prev, announcementText: e.target.value }))}
                placeholder="e.g. Sunday 5K City Run registrations are open now!"
              />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="primary-button"
              disabled={savingControls}
              onClick={() => void persistPlatformSettings(settings, "All platform controls saved & synced live.")}
            >
              <Sliders size={15} />
              {savingControls ? "Saving..." : "Save Platform Controls"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
