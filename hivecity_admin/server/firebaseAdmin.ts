
import { readFileSync } from "node:fs";
import path from "node:path";

import {
    initializeApp,
    getApps,
    cert,
    type ServiceAccount
} from "firebase-admin/app";

import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const serviceAccountPath = path.join(
    process.cwd(),
    "server",
    "private",
    "firebase-service-account.json"
);

const serviceAccount = JSON.parse(
    readFileSync(serviceAccountPath, "utf8")
) as ServiceAccount;

const firebaseApp = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
        projectId: "hivecity-32eb6",
    });

export const firestore = getFirestore(firebaseApp);
try {
    firestore.settings({
        preferRest: true,
        ignoreUndefinedProperties: true,
    });
} catch {
    // Settings may already be applied in hot-reload/test contexts
}
export const firebaseAdminAuth = getAuth(firebaseApp);

let firestoreQuotaBackoffUntil = 0;

export function isFirestoreQuotaBackoffActive(): boolean {
    return Date.now() < firestoreQuotaBackoffUntil;
}

export function noteFirestoreError(err: unknown): void {
    const anyErr = err as { code?: number | string; httpStatusCode?: number; message?: string } | null;
    const msg = String(anyErr?.message || err || "");
    const isQuotaOrRateLimit =
        anyErr?.code === 8 ||
        anyErr?.code === "8" ||
        anyErr?.httpStatusCode === 429 ||
        /quota exceeded|resource_exhausted|429/i.test(msg);
    if (isQuotaOrRateLimit) {
        if (Date.now() >= firestoreQuotaBackoffUntil) {
            console.warn("[Firestore] Quota exceeded (429) — using local synchronized store fallback for 120s.");
        }
        firestoreQuotaBackoffUntil = Date.now() + 120_000;
    }
}
