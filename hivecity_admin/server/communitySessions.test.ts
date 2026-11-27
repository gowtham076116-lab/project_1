import { describe, expect, it } from "vitest";
import {
  computeHmacSha256,
  createCommunitySessionsService,
  type CentralPaymentRecord,
  type CommunitySessionRecord,
  type CommunitySessionRegistrationRecord,
  type SessionStoreBackend,
} from "./communitySessionsRoutes";

function createInMemoryBackend(keySecret = "test_razorpay_secret_32bytes_key") {
  let sessions: CommunitySessionRecord[] = [];
  let regs: CommunitySessionRegistrationRecord[] = [];
  let payments: CentralPaymentRecord[] = [];
  const sheetSyncedRows: CommunitySessionRegistrationRecord[] = [];
  let orderCounter = 1;

  const backend: SessionStoreBackend = {
    readSessions: async () => sessions.map((s) => ({ ...s })),
    writeSessions: async (list) => {
      sessions = list.map((s) => ({ ...s }));
    },
    readRegistrations: async () => regs.map((r) => ({ ...r })),
    writeRegistrations: async (list) => {
      regs = list.map((r) => ({ ...r }));
    },
    readPayments: async () => payments.map((p) => ({ ...p })),
    writePayments: async (list) => {
      payments = list.map((p) => ({ ...p }));
    },
    syncRegistrationToSheet: async (reg) => {
      sheetSyncedRows.push({ ...reg });
      return { ok: true };
    },
    createGatewayOrder: async ({ amountPaise, currency }) => ({
      id: `order_test_${orderCounter++}`,
      amount: amountPaise,
      currency,
    }),
    getGatewayCredentials: () => ({
      keyId: "rzp_test_key_id",
      keySecret,
      webhookSecret: keySecret,
    }),
  };

  return {
    backend,
    service: createCommunitySessionsService(backend),
    sheetSyncedRows,
    keySecret,
  };
}

describe("HIVECITY Community Sessions Module (12 Required Scenarios)", () => {
  it("Scenarios 1-3: Admin creates & publishes free session -> User discovers & registers -> Admin sees participant & Sheet updates", async () => {
    const { service, sheetSyncedRows } = createInMemoryBackend();

    // 1. Admin creates & publishes free session
    const created = await service.createSession(
      {
        title: "Sunday Sunrise 5K",
        description: "Easy group pace",
        category: "Running",
        organizer: "Coach Maya",
        date: "2026-12-15",
        startTime: "06:30",
        endTime: "07:30",
        locationOrMeetingDetails: "Cubbon Park Gate 1",
        maxCapacity: 20,
        sessionType: "free",
        ticketPrice: 0,
        status: "published",
      },
      "hivecity10@gmail.com"
    );
    expect(created.status).toBe(201);
    const sessionId = created.session!.sessionId;

    // 2. User discovers published session & registers for free
    const published = await service.listPublishedSessions();
    expect(published.some((s) => s.sessionId === sessionId && s.availableSeats === 20)).toBe(true);

    const reg = await service.registerFree(sessionId, {
      uid: "uid-athlete-1",
      email: "athlete1@hivecity.app",
      displayName: "Aarav",
    });
    expect(reg.status).toBe(201);
    expect(reg.registration?.registrationStatus).toBe("confirmed");
    expect(reg.registration?.paymentStatus).toBe("free");
    expect(reg.availableSeats).toBe(19);

    // 3. Admin sees participant & Google Sheet received real-time sync
    const participants = await service.listParticipants(sessionId);
    expect(participants).toHaveLength(1);
    expect(participants[0].userName).toBe("Aarav");

    const adminList = await service.listAdminSessions();
    expect(adminList[0].metrics.confirmedParticipants).toBe(1);
    expect(adminList[0].metrics.freeParticipants).toBe(1);
    expect(adminList[0].metrics.verifiedRevenue).toBe(0);
    expect(sheetSyncedRows).toHaveLength(1);
    expect(sheetSyncedRows[0].registrationStatus).toBe("confirmed");
  });

  it("Scenarios 4-8: Paid session -> order created -> backend verifies HMAC signature -> registration confirmed -> Finance counts verified payment ONCE", async () => {
    const { service, keySecret, sheetSyncedRows } = createInMemoryBackend();

    // 4. Admin creates & publishes paid session (also verify paid with price 0 is rejected)
    const invalidPaid = await service.createSession(
      {
        title: "Invalid Paid",
        date: "2026-12-20",
        maxCapacity: 10,
        sessionType: "paid",
        ticketPrice: 0,
        status: "published",
      },
      "hivecity10@gmail.com"
    );
    expect(invalidPaid.status).toBe(400);

    const created = await service.createSession(
      {
        title: "Strength & Conditioning Workshop",
        date: "2026-12-20",
        startTime: "08:00",
        endTime: "10:00",
        maxCapacity: 10,
        sessionType: "paid",
        ticketPrice: 499,
        status: "published",
      },
      "hivecity10@gmail.com"
    );
    expect(created.status).toBe(201);
    const sessionId = created.session!.sessionId;

    // 5. User initiates payment order
    const orderRes = await service.createPaidOrder(sessionId, {
      uid: "uid-paid-1",
      email: "priya@hivecity.app",
      displayName: "Priya",
    });
    expect(orderRes.status).toBe(201);
    expect(orderRes.registration?.registrationStatus).toBe("pending");
    const orderId = orderRes.order!.orderId;

    // Before verification, revenue MUST be 0
    const revBefore = await service.getRevenueSummary();
    expect(revBefore.grossVerifiedRevenue).toBe(0);

    // Forged signature MUST be rejected
    const forged = await service.verifyPayment({
      sessionId,
      gatewayOrderId: orderId,
      gatewayPaymentId: "pay_live_9001",
      gatewaySignature: "forged_signature",
      userId: "uid-paid-1",
    });
    expect(forged.status).toBe(400);

    // 6-7. Valid backend cryptographic verification confirms registration
    const validSig = computeHmacSha256(keySecret, `${orderId}|pay_live_9001`);
    const verified = await service.verifyPayment({
      sessionId,
      gatewayOrderId: orderId,
      gatewayPaymentId: "pay_live_9001",
      gatewaySignature: validSig,
      userId: "uid-paid-1",
    });
    expect(verified.status).toBe(200);
    expect(verified.registration?.registrationStatus).toBe("confirmed");
    expect(verified.registration?.paymentStatus).toBe("verified");

    // 8. Re-verifying the same gatewayPaymentId is idempotent & Finance counts it ONCE
    const duplicateVerify = await service.verifyPayment({
      sessionId,
      gatewayOrderId: orderId,
      gatewayPaymentId: "pay_live_9001",
      gatewaySignature: validSig,
      userId: "uid-paid-1",
    });
    expect(duplicateVerify.status).toBe(200);

    const revAfter = await service.getRevenueSummary();
    expect(revAfter.verifiedTransactionsCount).toBe(1);
    expect(revAfter.grossVerifiedRevenue).toBe(499);
    expect(revAfter.netVerifiedRevenue).toBe(499);
    expect(sheetSyncedRows.some((r) => r.paymentStatus === "verified" && r.registrationStatus === "confirmed")).toBe(true);
  });

  it("Scenario 9: Failed payment grants zero seats and generates zero revenue", async () => {
    const { service } = createInMemoryBackend();
    const created = await service.createSession(
      {
        title: "Recovery Sauna Session",
        date: "2026-12-22",
        maxCapacity: 5,
        sessionType: "paid",
        ticketPrice: 799,
        status: "published",
      },
      "hivecity10@gmail.com"
    );
    const sessionId = created.session!.sessionId;
    const orderRes = await service.createPaidOrder(sessionId, {
      uid: "uid-fail-1",
      email: "fail@hivecity.app",
      displayName: "Fail User",
    });

    const failRes = await service.verifyPayment({
      sessionId,
      gatewayOrderId: orderRes.order!.orderId,
      gatewayPaymentId: "pay_failed_1",
      gatewaySignature: "",
      paymentOutcome: "failed",
      userId: "uid-fail-1",
    });
    expect(failRes.status).toBe(200);
    expect(failRes.registration?.paymentStatus).toBe("failed");
    expect(failRes.registration?.registrationStatus).toBe("cancelled");

    const rev = await service.getRevenueSummary();
    expect(rev.grossVerifiedRevenue).toBe(0);
    expect(rev.failedCount).toBe(1);

    const adminList = await service.listAdminSessions();
    expect(adminList[0].metrics.confirmedParticipants).toBe(0);
    expect(adminList[0].metrics.availableSeats).toBe(5);
  });

  it("Scenario 10: Duplicate registration by the same user is prevented", async () => {
    const { service } = createInMemoryBackend();
    const created = await service.createSession(
      {
        title: "Track Intervals",
        date: "2026-12-24",
        maxCapacity: 10,
        sessionType: "free",
        status: "published",
      },
      "hivecity10@gmail.com"
    );
    const sessionId = created.session!.sessionId;

    const first = await service.registerFree(sessionId, {
      uid: "uid-dup-1",
      email: "dup@hivecity.app",
      displayName: "Dup User",
    });
    expect(first.status).toBe(201);

    const second = await service.registerFree(sessionId, {
      uid: "uid-dup-1",
      email: "dup@hivecity.app",
      displayName: "Dup User",
    });
    expect(second.status).toBe(409);
  });

  it("Scenario 11: Session capacity cannot be exceeded under concurrent registrations", async () => {
    const { service } = createInMemoryBackend();
    const created = await service.createSession(
      {
        title: "Intimate Form Clinic",
        date: "2026-12-25",
        maxCapacity: 2,
        sessionType: "free",
        status: "published",
      },
      "hivecity10@gmail.com"
    );
    const sessionId = created.session!.sessionId;

    const results = await Promise.all([
      service.registerFree(sessionId, { uid: "u1", email: "u1@test.com", displayName: "U1" }),
      service.registerFree(sessionId, { uid: "u2", email: "u2@test.com", displayName: "U2" }),
      service.registerFree(sessionId, { uid: "u3", email: "u3@test.com", displayName: "U3" }),
      service.registerFree(sessionId, { uid: "u4", email: "u4@test.com", displayName: "U4" }),
    ]);

    const succeeded = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(succeeded).toHaveLength(2);
    expect(rejected).toHaveLength(2);

    const adminList = await service.listAdminSessions();
    expect(adminList[0].metrics.confirmedParticipants).toBe(2);
    expect(adminList[0].metrics.availableSeats).toBe(0);
  });

  it("Scenario 12: Cancelled sessions reject new registrations", async () => {
    const { service } = createInMemoryBackend();
    const created = await service.createSession(
      {
        title: "Rain-Out Trail Run",
        date: "2026-12-26",
        maxCapacity: 15,
        sessionType: "free",
        status: "published",
      },
      "hivecity10@gmail.com"
    );
    const sessionId = created.session!.sessionId;

    const cancelled = await service.updateSession(sessionId, { status: "cancelled" });
    expect(cancelled.status).toBe(200);

    const attempt = await service.registerFree(sessionId, {
      uid: "uid-late-1",
      email: "late@hivecity.app",
      displayName: "Late Runner",
    });
    expect(attempt.status).toBe(409);
  });
});
