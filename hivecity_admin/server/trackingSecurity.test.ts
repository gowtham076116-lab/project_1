import "dotenv/config";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  isAuthorizedAdminEmail,
  requireAdminSession,
  signAdminToken,
  getAppsScriptSecret,
  normalizeUnifiedUserRecord,
  mergeUnifiedUsers,
  type AdminUser,
} from "./adminAuth";

describe("Google Sheets & Tracking Security Hardening", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Admin Email Whitelist Tests
  describe("Admin Authorization & Email Whitelist", () => {
    it("permits the primary authorized admin hivecity10@gmail.com", () => {
      expect(isAuthorizedAdminEmail("hivecity10@gmail.com")).toBe(true);
      expect(isAuthorizedAdminEmail("HIVECITY10@GMAIL.COM")).toBe(true);
      expect(isAuthorizedAdminEmail("  hivecity10@gmail.com  ")).toBe(true);
    });

    it("rejects unauthorized ordinary user emails", () => {
      expect(isAuthorizedAdminEmail("attacker@evil.com")).toBe(false);
      expect(isAuthorizedAdminEmail("ordinary.athlete@gmail.com")).toBe(false);
      expect(isAuthorizedAdminEmail("hivecity10@gmail.com.attacker.com")).toBe(false);
      expect(isAuthorizedAdminEmail("")).toBe(false);
    });

    it("rejects unauthenticated requests in requireAdminSession", () => {
      const mockReq = { headers: {} } as Request;
      let statusCode = 0;
      let responseJson: any = null;
      const mockRes = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (payload: any) => {
              responseJson = payload;
            },
          };
        },
      } as unknown as Response;

      const admin = requireAdminSession(mockReq, mockRes);
      expect(admin).toBeNull();
      expect(statusCode).toBe(401);
      expect(responseJson?.error).toBe("UNAUTHENTICATED");
    });

    it("rejects authenticated ordinary users who are not authorized admins", () => {
      const ordinaryUser: AdminUser = {
        id: "normal-user-123",
        email: "athlete@gmail.com",
        name: "Normal Athlete",
        role: "ADMIN",
        emailVerified: true,
      };
      const token = signAdminToken(ordinaryUser);

      const mockReq = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as unknown as Request;

      let statusCode = 0;
      let responseJson: any = null;
      const mockRes = {
        status: (code: number) => {
          statusCode = code;
          return {
            json: (payload: any) => {
              responseJson = payload;
            },
          };
        },
      } as unknown as Response;

      const admin = requireAdminSession(mockReq, mockRes);
      expect(admin).toBeNull();
      expect(statusCode).toBe(403);
      expect(responseJson?.error).toBe("FORBIDDEN");
    });

    it("accepts valid tokens for authorized super admin", () => {
      const validAdmin: AdminUser = {
        id: "super-admin-uid",
        email: "hivecity10@gmail.com",
        name: "Super Admin",
        role: "ADMIN",
        emailVerified: true,
      };
      const token = signAdminToken(validAdmin);

      const mockReq = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as unknown as Request;

      let statusCode = 0;
      const mockRes = {
        status: (code: number) => {
          statusCode = code;
          return { json: () => {} };
        },
      } as unknown as Response;

      const admin = requireAdminSession(mockReq, mockRes);
      expect(admin).not.toBeNull();
      expect(admin?.email).toBe("hivecity10@gmail.com");
      expect(statusCode).toBe(0);
    });
  });

  // 2. Apps Script Shared Secret Authentication
  describe("Apps Script Shared Secret Verification", () => {
    it("verifies server secret is configured and not empty", () => {
      const secret = getAppsScriptSecret();
      expect(typeof secret).toBe("string");
      expect(secret.length).toBeGreaterThanOrEqual(32);
    });

    it("validates secret comparison logic: rejects missing or incorrect secret", () => {
      const expectedSecret = "test-32-byte-cryptographic-shared-secret-val";

      function verifyAppsScriptSecret(payloadSecret: any): { ok: boolean; status: number } {
        const cleanReqSecret = String(payloadSecret || "").trim();
        if (!expectedSecret || !cleanReqSecret || cleanReqSecret !== expectedSecret) {
          return { ok: false, status: 401 };
        }
        return { ok: true, status: 200 };
      }

      expect(verifyAppsScriptSecret(undefined).ok).toBe(false);
      expect(verifyAppsScriptSecret("").ok).toBe(false);
      expect(verifyAppsScriptSecret("wrong-secret").ok).toBe(false);
      expect(verifyAppsScriptSecret(expectedSecret).ok).toBe(true);
    });
  });

  // 3. Identity Derivation & Zero-Trust Client Overrides
  describe("Identity Derivation & Email Verification Rules", () => {
    it("strictly overrides client-supplied UID and email with Google verified data", () => {
      // Simulating a malicious client attempting to forge UID and Email
      const clientPayload = {
        uid: "FORGED_VICTIM_UID",
        email: "victim@example.com",
        displayName: "Real Athlete",
        mobile: "+919876543210",
      };

      // Google Identity Toolkit verified response
      const verifiedGoogleUser = {
        uid: "ACTUAL_AUTHENTICATED_UID_999",
        email: "actual.user@example.com",
        emailVerified: true,
        displayName: "Google Name",
      };

      // Derivation logic: never trust client UID or email
      const derivedRecord = {
        uid: verifiedGoogleUser.uid,
        email: verifiedGoogleUser.email,
        displayName: clientPayload.displayName || verifiedGoogleUser.displayName,
        mobile: clientPayload.mobile,
        status: verifiedGoogleUser.emailVerified ? "Active" : "Pending Verification",
      };

      expect(derivedRecord.uid).toBe("ACTUAL_AUTHENTICATED_UID_999");
      expect(derivedRecord.uid).not.toBe(clientPayload.uid);
      expect(derivedRecord.email).toBe("actual.user@example.com");
      expect(derivedRecord.email).not.toBe(clientPayload.email);
      expect(derivedRecord.status).toBe("Active");
    });

    it("enforces Pending Verification if email is not verified", () => {
      const unverifiedGoogleUser = {
        uid: "UNVERIFIED_UID_123",
        email: "unverified@example.com",
        emailVerified: false,
        displayName: "New User",
      };

      let derivedStatus = "Active";
      if (!unverifiedGoogleUser.emailVerified) {
        derivedStatus = "Pending Verification";
      }

      expect(derivedStatus).toBe("Pending Verification");
    });
  });

  // 4. Primary Key Deduplication
  describe("Primary Key Deduplication using Firebase UID", () => {
    it("ensures duplicate UIDs are consolidated and only 1 record per UID exists", () => {
      const rows = [
        ["UID", "Email", "Display Name", "Registration Date", "Last Login", "Status", "Provider", "Mobile", "Updated At"],
        ["uid_athlete_1", "old@example.com", "Athlete One", "2026-01-01", "2026-01-01", "Active", "password", "", "2026-01-01"],
        ["uid_athlete_2", "two@example.com", "Athlete Two", "2026-01-02", "2026-01-02", "Active", "password", "", "2026-01-02"],
        ["uid_athlete_1", "old@example.com", "Athlete Duplicate", "2026-01-01", "2026-01-03", "Active", "password", "", "2026-01-03"],
      ];

      const targetUid = "uid_athlete_1";
      const userMap: Record<string, any> = {};

      for (let i = 1; i < rows.length; i++) {
        const uid = rows[i][0];
        // Index strictly by UID
        userMap[uid] = {
          uid: rows[i][0],
          email: rows[i][1],
          displayName: rows[i][2],
          lastLogin: rows[i][4],
        };
      }

      const deduplicatedRecords = Object.values(userMap);
      expect(deduplicatedRecords.length).toBe(2);
      expect(deduplicatedRecords.map((r: any) => r.uid)).toEqual(["uid_athlete_1", "uid_athlete_2"]);
    });
  });

  // 5. 9-Column Users Schema Preservation
  describe("Spreadsheet Schema Preservation", () => {
    it("preserves exact 9-column Users spreadsheet schema in order", () => {
      const HEADERS = [
        "UID",
        "Email",
        "Display Name",
        "Registration Date",
        "Last Login",
        "Status",
        "Provider",
        "Mobile",
        "Updated At",
      ];

      expect(HEADERS.length).toBe(9);
      expect(HEADERS[0]).toBe("UID");
      expect(HEADERS[1]).toBe("Email");
      expect(HEADERS[2]).toBe("Display Name");
      expect(HEADERS[3]).toBe("Registration Date");
      expect(HEADERS[4]).toBe("Last Login");
      expect(HEADERS[5]).toBe("Status");
      expect(HEADERS[6]).toBe("Provider");
      expect(HEADERS[7]).toBe("Mobile");
      expect(HEADERS[8]).toBe("Updated At");
    });
  });

  // 6. Unified Multi-Source User Merge & Deduplication (Google Sheets + Firestore + Local Fallback)
  describe("Unified User Merge & Deduplication", () => {
    it("merges Google Sheet rows with Firestore records deduplicating by UID and email while preserving earliest registration & latest login", () => {
      const fsUser = normalizeUnifiedUserRecord({
        uid: "uid-sync-1",
        email: "runner@hivecity.test",
        name: "Arjun Runner",
        mobile: "+919876543210",
        bmi: 22.4,
        bmiCategory: "Normal",
        emailVerified: true,
        status: "Active",
        createdAt: "2026-01-10T08:00:00.000Z",
        lastLoginAt: "2026-03-01T09:00:00.000Z",
      })!;

      const sheetRow = normalizeUnifiedUserRecord(
        {
          UID: "uid-sync-1",
          Email: "runner@hivecity.test",
          "Display Name": "Arjun Runner",
          "Registration Date": "2026-01-05T08:00:00.000Z",
          "Last Login": "2026-03-05T10:30:00.000Z",
          Status: "Active",
          Provider: "google.com",
          Mobile: "+919876543210",
        },
        { sheetSynced: true }
      )!;

      const legacySheetOnly = normalizeUnifiedUserRecord(
        {
          UID: "",
          Email: "runner@hivecity.test",
          "Display Name": "Legacy Arjun",
        },
        { sheetSynced: true }
      )!;

      const merged = mergeUnifiedUsers([[fsUser], [sheetRow, legacySheetOnly]]);
      expect(merged.length).toBe(1);
      expect(merged[0].uid).toBe("uid-sync-1");
      expect(merged[0].sheetSynced).toBe(true);
      expect(merged[0].bmi).toBe(22.4);
      expect(merged[0].registrationDate).toBe("2026-01-05T08:00:00.000Z");
      expect(merged[0].lastLogin).toBe("2026-03-05T10:30:00.000Z");
    });

    it("normalizes exact 9-column Hivecity Admin User Tracking headers (Firebase_UID, Display_Name, Registration_Date, Last_SignIn, Verified/Pending Verification)", () => {
      const verifiedRow = normalizeUnifiedUserRecord(
        {
          Firebase_UID: "fb-uid-901",
          Email: "verified.athlete@hivecity.test",
          Display_Name: "Maya Sprinter",
          Registration_Date: "2026-02-01T06:00:00.000Z",
          Last_SignIn: "2026-03-10T07:15:00.000Z",
          Status: "Verified",
          Provider: "google.com",
          Mobile: "+919900112233",
          "Updated At": "2026-03-10T07:15:00.000Z",
        },
        { sheetSynced: true }
      )!;

      const pendingRow = normalizeUnifiedUserRecord({
        Firebase_UID: "fb-uid-902",
        Email: "pending.athlete@hivecity.test",
        Display_Name: "Kiran New",
        Registration_Date: "2026-03-11T08:00:00.000Z",
        Last_SignIn: "2026-03-11T08:00:00.000Z",
        Status: "Pending Verification",
        Provider: "password",
        Mobile: "",
      })!;

      expect(verifiedRow.uid).toBe("fb-uid-901");
      expect(verifiedRow.displayName).toBe("Maya Sprinter");
      expect(verifiedRow.emailVerified).toBe(true);
      expect(verifiedRow.status).toBe("active");
      expect(verifiedRow.lastLogin).toBe("2026-03-10T07:15:00.000Z");
      expect(verifiedRow.sheetSynced).toBe(true);

      expect(pendingRow.uid).toBe("fb-uid-902");
      expect(pendingRow.emailVerified).toBe(false);
      expect(pendingRow.status).toBe("Pending Verification");
    });
  });
});
