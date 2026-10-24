// ONE place that defines the business policy. The /api/policy endpoint (and so the
// public Policies page and the Book page checkbox) read from here and from the
// database, so the website text can never drift away from what the code really does.
import { pool } from "../config/db.js";

// Bump this whenever the wording/rules change. It is stored on every booking
// ("customer accepted policy version X on date Y") - that is your proof if there's a dispute.
export const POLICY_VERSION = "2026-10-v2";

// false: the prepaid booking charge is a separate visit fee; the customer pays the
//        full job total on site.
// true:  the booking charge is credited against the job total.
export const DEDUCT_BOOKING_CHARGE = true;

export const REFUND_TIMELINE = "5 to 7 working days";

export async function getPolicy(db = pool) {
  const [tiers, zone, services] = await Promise.all([
    db.query(
      `SELECT min_distance_km, max_distance_km, flat_fee FROM pricing_tiers
       WHERE is_active = true ORDER BY min_distance_km ASC`
    ),
    db.query(`SELECT COALESCE(MAX(radius_km), 0) AS radius FROM service_zones WHERE is_active = true`),
    db.query(`SELECT name, warranty_days FROM services WHERE is_active = true ORDER BY id ASC`),
  ]);

  return {
    version: POLICY_VERSION,
    serviceRadiusKm: Number(zone.rows[0].radius),
    bookingCharges: tiers.rows.map((t) => ({
      fromKm: Number(t.min_distance_km),
      toKm: Number(t.max_distance_km),
      fee: Number(t.flat_fee),
    })),
    warranties: services.rows.map((s) => ({ service: s.name, days: s.warranty_days })),
    rules: {
      bookingChargeDeductedFromJob: DEDUCT_BOOKING_CHARGE,
      refundTimeline: REFUND_TIMELINE,
      // Customer can cancel for a full refund until the technician starts heading out.
      customerRefundUntil: "ON_THE_WAY",
      customerRescheduleRefunds: false,
      companyCancelOrRescheduleRefunds: true,
      unpaidBookingExpiryMinutes: 15,
    },
  };
}