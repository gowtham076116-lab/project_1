import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export type AdminRole = "ADMIN";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  emailVerified: boolean;
}

interface AdminAuthContextType {
  admin: AdminUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  needsEmailVerification: boolean;
  unverifiedEmail: string | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; needsVerification?: boolean; error?: string }>;
  register: (email: string, pass: string, displayName: string) => Promise<{ success: boolean; needsVerification?: boolean; error?: string }>;
  resendVerification: () => Promise<{ success: boolean; message?: string; error?: string }>;
  checkVerification: () => Promise<boolean>;
  updateAdminProfile: (displayName: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasPermission: (path: string) => boolean;
  getRoleLabel: (role?: AdminRole) => string;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AUTHORIZED_ADMIN_PRIMARY_EMAIL = "hivecity10@gmail.com";

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  // Exchange Firebase ID token with backend to obtain verified admin session
  async function syncBackendAdminSession(user: FirebaseUser, displayName?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const idToken = await user.getIdToken(true);
      const res = await fetch("/api/admin/firebase-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken, name: displayName || user.displayName || "" }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.error === "EMAIL_NOT_VERIFIED") {
          setNeedsEmailVerification(true);
          setUnverifiedEmail(user.email || null);
          return { success: false, error: data.message };
        }
        return { success: false, error: data.message || data.error || "Admin verification failed" };
      }

      setAdmin(data.admin);
      setNeedsEmailVerification(false);
      setUnverifiedEmail(null);
      return { success: true };
    } catch (err) {
      return { success: false, error: "Network error connecting to administrator verification gateway" };
    }
  }

  // Monitor Firebase Auth state & server session
  useEffect(() => {
    let mounted = true;

    // 1. Initial check of server session
    async function initCheck() {
      try {
        const res = await fetch("/api/admin/me", {
          method: "GET",
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          if (mounted && data.authenticated && data.admin) {
            setAdmin(data.admin);
          }
        }
      } catch {}
    }

    initCheck();

    // 2. Subscribe to Firebase Auth
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;
      setFirebaseUser(user);

      if (user) {
        if (!user.emailVerified) {
          setNeedsEmailVerification(true);
          setUnverifiedEmail(user.email);
          setAdmin(null);
          setLoading(false);
        } else {
          await syncBackendAdminSession(user);
          setLoading(false);
        }
      } else {
        setAdmin(null);
        setNeedsEmailVerification(false);
        setUnverifiedEmail(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Admin Login with Firebase Email & Password
  const login = async (email: string, pass: string): Promise<{ success: boolean; needsVerification?: boolean; error?: string }> => {
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), pass);
      const user = credential.user;

      // 1. Enforce email verification
      if (!user.emailVerified) {
        setNeedsEmailVerification(true);
        setUnverifiedEmail(user.email);
        try {
          await sendEmailVerification(user);
        } catch {}
        return {
          success: false,
          needsVerification: true,
          error: "Email verification required. A link was sent to your email. Please verify before accessing the admin dashboard.",
        };
      }

      // 2. Verify admin Firestore collection & backend claim
      const adminDocRef = doc(db, "admins", user.uid);
      const adminDocSnap = await getDoc(adminDocRef);

      const isPrimary = user.email?.toLowerCase() === AUTHORIZED_ADMIN_PRIMARY_EMAIL.toLowerCase();

      if (!adminDocSnap.exists() && !isPrimary) {
        // Ordinary user trying to access admin dashboard -> Reject and sign out
        await signOut(auth);
        setAdmin(null);
        return {
          success: false,
          error: "Access Denied: Ordinary user accounts cannot access the Hive City Admin Portal. Only authorized administrators in the 'admins' collection are permitted.",
        };
      }

      // 3. Sync with backend
      const syncResult = await syncBackendAdminSession(user);
      if (!syncResult.success) {
        await signOut(auth);
        setAdmin(null);
        return { success: false, error: syncResult.error };
      }

      return { success: true };
    } catch (err: any) {
      let message = "Authentication failed. Please verify your credentials.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        message = "Invalid administrator email or password.";
      } else if (err.code === "auth/too-many-requests") {
        message = "Too many failed attempts. Account temporarily locked for security.";
      } else if (err.message) {
        message = err.message;
      }
      return { success: false, error: message };
    }
  };

  // Admin Registration with Firebase Email & Password
  const register = async (email: string, pass: string, displayName: string): Promise<{ success: boolean; needsVerification?: boolean; error?: string }> => {
    try {
      const cleanEmail = email.trim();

      // 1. Create account in Firebase Auth
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      const user = credential.user;

      // 2. Set display name
      if (displayName) {
        await updateProfile(user, { displayName });
      }

      // 3. Write record into dedicated Firestore 'admins' collection
      try {
        await setDoc(doc(db, "admins", user.uid), {
          uid: user.uid,
          email: cleanEmail.toLowerCase(),
          name: displayName || cleanEmail.split("@")[0],
          role: "ADMIN",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn("[AdminAuth] Firestore admins collection write note:", e);
      }

      // 4. Send mandatory verification email
      await sendEmailVerification(user);

      setNeedsEmailVerification(true);
      setUnverifiedEmail(user.email);

      return {
        success: true,
        needsVerification: true,
      };
    } catch (err: any) {
      let message = "Registration failed.";
      if (err.code === "auth/email-already-in-use") {
        message = "An account with this administrator email already exists. Please sign in.";
      } else if (err.code === "auth/weak-password") {
        message = "Password is too weak. Please use at least 8 characters with a mix of letters and numbers.";
      } else if (err.code === "auth/invalid-email") {
        message = "Invalid email format.";
      } else if (err.message) {
        message = err.message;
      }
      return { success: false, error: message };
    }
  };

  // Resend verification email
  const resendVerification = async (): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      if (!auth.currentUser) {
        return { success: false, error: "No active account session found. Please sign in again." };
      }
      await sendEmailVerification(auth.currentUser);
      return { success: true, message: `Verification email resent to ${auth.currentUser.email}.` };
    } catch (err: any) {
      return { success: false, error: err.message || "Failed to resend verification email." };
    }
  };

  // Check if user has clicked the email verification link
  const checkVerification = async (): Promise<boolean> => {
    try {
      if (!auth.currentUser) return false;
      await auth.currentUser.reload();

      if (auth.currentUser.emailVerified) {
        const syncResult = await syncBackendAdminSession(auth.currentUser);
        if (syncResult.success) {
          setNeedsEmailVerification(false);
          setUnverifiedEmail(null);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  // Secure logout
  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
    } catch {}

    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {}

    setAdmin(null);
    setNeedsEmailVerification(false);
    setUnverifiedEmail(null);
  };

  const updateAdminProfile = async (
    displayName: string
  ): Promise<{ success: boolean; error?: string }> => {
    const clean = displayName.trim();
    if (!clean) return { success: false, error: "Display name is required." };
    try {
      const current = auth.currentUser;
      if (current) {
        await updateProfile(current, { displayName: clean });
        try {
          await setDoc(
            doc(db, "admins", current.uid),
            {
              name: clean,
              displayName: clean,
              email: current.email || admin?.email || "",
              role: "ADMIN",
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (fsErr) {
          console.warn("[AdminAuth] Firestore admins profile update note:", fsErr);
        }
        await syncBackendAdminSession(current, clean);
      }
      setAdmin((prev) => (prev ? { ...prev, name: clean } : prev));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to update admin profile." };
    }
  };

  // Single full-access ADMIN role: unrestricted access to all modules
  const hasPermission = (_path: string): boolean => {
    return Boolean(admin && admin.role === "ADMIN");
  };

  const getRoleLabel = (_role?: AdminRole): string => {
    return "Administrator";
  };

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        firebaseUser,
        loading,
        needsEmailVerification,
        unverifiedEmail,
        login,
        register,
        resendVerification,
        checkVerification,
        updateAdminProfile,
        logout,
        hasPermission,
        getRoleLabel,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return context;
}
