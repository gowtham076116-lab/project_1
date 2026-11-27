import { describe, expect, it } from "vitest";
import { aggregateFinanceData } from "./financeRoutes";

describe("Admin Revenue & Finance Aggregation", () => {
  const now = new Date("2026-11-26T12:00:00.000Z");

  it("counts verified paid Community Sessions once and ignores free, pending, failed, and cancelled entries", () => {
    const res = aggregateFinanceData({
      range: "30d",
      now,
      payments: [
        {
          paymentId: "pay_1",
          gatewayOrderId: "ord_1",
          gatewayPaymentId: "pay_1",
          source: "community_session",
          sessionId: "sess_1",
          sessionTitle: "Strength Clinic",
          registrationId: "sess_1_u1",
          userId: "u1",
          userEmail: "u1@test.com",
          amount: 500,
          currency: "INR",
          paymentStatus: "verified",
          verifiedAt: "2026-11-25T10:00:00.000Z",
          createdAt: "2026-11-25T10:00:00.000Z",
          updatedAt: "2026-11-25T10:00:00.000Z",
        },
        // Duplicate of same gatewayPaymentId must NOT be double-counted
        {
          paymentId: "pay_1",
          gatewayOrderId: "ord_1",
          gatewayPaymentId: "pay_1",
          source: "community_session",
          sessionId: "sess_1",
          sessionTitle: "Strength Clinic",
          registrationId: "sess_1_u1",
          userId: "u1",
          userEmail: "u1@test.com",
          amount: 500,
          currency: "INR",
          paymentStatus: "verified",
          verifiedAt: "2026-11-25T10:00:00.000Z",
          createdAt: "2026-11-25T10:00:00.000Z",
          updatedAt: "2026-11-25T10:00:00.000Z",
        },
        // Pending & failed must generate ₹0
        {
          paymentId: "ord_2",
          gatewayOrderId: "ord_2",
          gatewayPaymentId: "",
          source: "community_session",
          sessionId: "sess_1",
          registrationId: "sess_1_u2",
          userId: "u2",
          amount: 500,
          currency: "INR",
          paymentStatus: "pending",
          verifiedAt: null,
          createdAt: "2026-11-25T11:00:00.000Z",
          updatedAt: "2026-11-25T11:00:00.000Z",
        },
        {
          paymentId: "pay_fail",
          gatewayOrderId: "ord_3",
          gatewayPaymentId: "pay_fail",
          source: "community_session",
          sessionId: "sess_1",
          registrationId: "sess_1_u3",
          userId: "u3",
          amount: 500,
          currency: "INR",
          paymentStatus: "failed",
          verifiedAt: null,
          createdAt: "2026-11-25T11:30:00.000Z",
          updatedAt: "2026-11-25T11:30:00.000Z",
        },
      ],
      bookings: [
        { id: "bk_paid", eventId: "e1", eventTitle: "City 10K", feeAmount: 300, status: "Booked", bookedAt: "2026-11-24T09:00:00.000Z" },
        { id: "bk_cancelled", eventId: "e1", eventTitle: "City 10K", feeAmount: 300, status: "Cancelled", bookedAt: "2026-11-24T09:00:00.000Z" },
        { id: "bk_free", eventId: "e2", eventTitle: "Free Run", feeAmount: 0, status: "Booked", bookedAt: "2026-11-24T09:00:00.000Z" },
      ],
      sponsors: [
        { id: "SPN-1", sponsorName: "Acme Hydration", sponsorshipAmount: 1000, createdAt: "2026-11-23T08:00:00.000Z" },
      ],
      sessions: [],
      registrations: [],
    });

    expect(res.grossRevenue).toBe(1800); // 500 + 300 + 1000
    expect(res.verifiedCount).toBe(3);
    expect(res.avgOrderValue).toBe(600);
    expect(res.refunds).toBe(0);
    expect(res.netRevenue).toBe(1800);
    expect(res.breakdown).toEqual({
      communitySessions: 500,
      eventBookings: 300,
      sponsors: 1000,
    });
    expect(res.dailySeries.length).toBeGreaterThan(0);
    expect(res.signals.length).toBeGreaterThan(0);
  });

  it("tracks confirmed refunds separately and subtracts them from net revenue", () => {
    const res = aggregateFinanceData({
      range: "30d",
      now,
      payments: [
        {
          paymentId: "pay_ok",
          gatewayOrderId: "ord_ok",
          gatewayPaymentId: "pay_ok",
          source: "community_session",
          sessionId: "sess_1",
          registrationId: "sess_1_u1",
          userId: "u1",
          amount: 1000,
          currency: "INR",
          paymentStatus: "verified",
          verifiedAt: "2026-11-25T10:00:00.000Z",
          createdAt: "2026-11-25T10:00:00.000Z",
          updatedAt: "2026-11-25T10:00:00.000Z",
        },
        {
          paymentId: "pay_ref",
          gatewayOrderId: "ord_ref",
          gatewayPaymentId: "pay_ref",
          source: "community_session",
          sessionId: "sess_1",
          registrationId: "sess_1_u2",
          userId: "u2",
          amount: 400,
          currency: "INR",
          paymentStatus: "refunded",
          verifiedAt: "2026-11-25T12:00:00.000Z",
          createdAt: "2026-11-25T12:00:00.000Z",
          updatedAt: "2026-11-25T12:00:00.000Z",
        },
      ],
      bookings: [],
      sponsors: [],
      sessions: [],
      registrations: [],
    });

    expect(res.grossRevenue).toBe(1000);
    expect(res.refunds).toBe(400);
    expect(res.netRevenue).toBe(600);
    expect(res.avgOrderValue).toBe(1000);
  });
});
