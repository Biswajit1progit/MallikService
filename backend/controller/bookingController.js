/* import { pool } from "../config/db.js";
import { getBookingCharge } from "../utils/distance.js";
import { findNextAvailableDate, countBookingsOnDate } from "../utils/availability.js";
import {
  isTransitionAllowed,
  computeRefundEligible,
  CUSTOMER_MODIFIABLE_STATUSES,
} from "../utils/bookingStatus.js";
import { refundBookingPayment } from "./paymentController.js";
import { createTrackingToken } from "../utils/trackingToken.js";
import { getIO } from "../utils/socketInstance.js";

export async function checkAvailability(req, res) {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: "date query param is required (YYYY-MM-DD)" });
    }

    const technicianResult = await pool.query(
      `SELECT id, max_bookings_per_day FROM technicians WHERE is_active = true ORDER BY id ASC LIMIT 1`
    );
    if (technicianResult.rows.length === 0) {
      return res.status(503).json({ message: "No technician is available right now" });
    }
    const { id: technicianId, max_bookings_per_day: maxPerDay } = technicianResult.rows[0];

    const booked = await countBookingsOnDate(pool, technicianId, date);

    if (booked < maxPerDay) {
      return res.json({ date, available: true, booked, capacity: maxPerDay });
    }

    const next = await findNextAvailableDate(pool, technicianId, maxPerDay, date);
    res.json({
      date,
      available: false,
      booked,
      capacity: maxPerDay,
      suggestedDate: next?.date ?? null,
    });
  } catch (err) {
    console.error("Check availability error:", err);
    res.status(500).json({ message: "Couldn't check availability right now" });
  }
}

// ---------------------------------------------------------------------------
// Customer-facing endpoints
// ---------------------------------------------------------------------------

export async function createBooking(req, res) {
  const client = await pool.connect();
  try {
    const customerId = req.user.id;
    const { serviceId, addressId, slotDate, slotTime } = req.body;

    if (!serviceId || !addressId || !slotDate || !slotTime) {
      return res
        .status(400)
        .json({ message: "serviceId, addressId, slotDate, and slotTime are all required" });
    }

    // The technician must be able to call the customer - phone is mandatory
    const phoneRow = await client.query(`SELECT phone FROM users WHERE id = $1`, [customerId]);
    if (!phoneRow.rows[0]?.phone) {
      return res.status(422).json({
        code: "PHONE_REQUIRED",
        message: "Please add your mobile number before booking so our technician can reach you",
      });
    }

    // Validate the service exists and is active
    const serviceResult = await client.query(
      `SELECT id, name FROM services WHERE id = $1 AND is_active = true`,
      [serviceId]
    );
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: "This service isn't available right now" });
    }

    // Validate the address belongs to this customer (never trust a client-sent address_id blindly)
    const addressResult = await client.query(
      `SELECT id, distance_km FROM customer_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, customerId]
    );
    if (addressResult.rows.length === 0) {
      return res.status(404).json({ message: "Address not found on your account" });
    }
    const { distance_km: distanceKm } = addressResult.rows[0];

    const bookingCharge = await getBookingCharge(client, distanceKm);
    if (bookingCharge === null) {
      return res
        .status(422)
        .json({ message: "Couldn't calculate a price for this distance. Contact support." });
    }

    // v1: single active technician, auto-assigned. This is the one line that
    // changes when multi-technician assignment logic is added later.
    const technicianResult = await client.query(
      `SELECT id, max_bookings_per_day FROM technicians WHERE is_active = true ORDER BY id ASC LIMIT 1`
    );
    if (technicianResult.rows.length === 0) {
      return res.status(503).json({ message: "No technician is available right now" });
    }
    const { id: technicianId, max_bookings_per_day: maxPerDay } = technicianResult.rows[0];

    await client.query("BEGIN");

    // Advisory lock keyed to this technician+date - serializes concurrent
    // booking attempts for the same day (covers both the exact-slot check
    // and the daily-capacity check below) without needing a separate slots
    // table. Held only for the duration of this transaction.
    const lockKey = `${technicianId}:${slotDate}`;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);

    // Daily capacity check - if this technician is already fully booked for
    // the requested day, reject with the next day that actually has room.
    // This cascades forward automatically: if day+1 is also full, it keeps
    // walking forward until it finds an open day.
    const bookedToday = await countBookingsOnDate(client, technicianId, slotDate);
    if (bookedToday >= maxPerDay) {
      await client.query("ROLLBACK");
      const next = await findNextAvailableDate(pool, technicianId, maxPerDay, slotDate);
      return res.status(409).json({
        message: next
          ? `${slotDate} is fully booked. The next available date is ${next.date}.`
          : `${slotDate} is fully booked and no open dates were found in the next 30 days.`,
        fullyBooked: true,
        suggestedDate: next?.date ?? null,
      });
    }

    const conflictResult = await client.query(
      `SELECT id FROM bookings
       WHERE technician_id = $1 AND slot_date = $2 AND slot_time = $3
       AND status NOT IN ('CANCELLED', 'NO_SHOW')`,
      [technicianId, slotDate, slotTime]
    );

    if (conflictResult.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "That exact time slot was just taken. Pick another time." });
    }

    const insertResult = await client.query(
      `INSERT INTO bookings
        (customer_id, technician_id, service_id, address_id, distance_km, booking_charge, slot_date, slot_time, status, refund_eligible)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', true)
       RETURNING *`,
      [customerId, technicianId, serviceId, addressId, distanceKm, bookingCharge, slotDate, slotTime]
    );
    const booking = insertResult.rows[0];

    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note)
       VALUES ($1, 'PENDING', $2, 'Booking created')`,
      [booking.id, customerId]
    );

    await client.query("COMMIT");

    res.status(201).json({ booking });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create booking error:", err);
    res.status(500).json({ message: "Couldn't create this booking right now" });
  } finally {
    client.release();
  }
}

export async function listMyBookings(req, res) {
  try {
    const customerId = req.user.id;
    const result = await pool.query(
      `SELECT b.*, s.name AS service_name, a.address_text,
              jc.customer_status AS completion_status, jc.customer_note AS completion_note,
              jc.total_amount AS completion_total,
              to_char(w.expires_on, 'YYYY-MM-DD') AS warranty_expires_on
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN customer_addresses a ON a.id = b.address_id
       LEFT JOIN job_completions jc ON jc.booking_id = b.id
       LEFT JOIN warranties w ON w.booking_id = b.id
       WHERE b.customer_id = $1
       ORDER BY b.created_at DESC`,
      [customerId]
    );
    res.json({ bookings: result.rows });
  } catch (err) {
    console.error("List bookings error:", err);
    res.status(500).json({ message: "Couldn't load your bookings right now" });
  }
}

export async function getMyBookingById(req, res) {
  try {
    const customerId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT b.*, s.name AS service_name, a.address_text
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN customer_addresses a ON a.id = b.address_id
       WHERE b.id = $1 AND b.customer_id = $2`,
      [id, customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const historyResult = await pool.query(
      `SELECT status, note, changed_at FROM booking_status_history
       WHERE booking_id = $1 ORDER BY changed_at ASC`,
      [id]
    );

    res.json({ booking: result.rows[0], history: historyResult.rows });
  } catch (err) {
    console.error("Get booking error:", err);
    res.status(500).json({ message: "Couldn't load this booking right now" });
  }
}

export async function cancelBooking(req, res) {
  try {
    const customerId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    const bookingResult = await pool.query(
      `SELECT * FROM bookings WHERE id = $1 AND customer_id = $2`,
      [id, customerId]
    );
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const booking = bookingResult.rows[0];

    if (!CUSTOMER_MODIFIABLE_STATUSES.includes(booking.status)) {
      return res.status(422).json({
        message: "This booking can no longer be cancelled - the technician is already on the way.",
      });
    }

    await pool.query(
      `UPDATE bookings
       SET status = 'CANCELLED', cancellation_reason = $1, updated_at = now()
       WHERE id = $2`,
      [reason || "Cancelled by customer", id]
    );

    await pool.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note)
       VALUES ($1, 'CANCELLED', $2, $3)`,
      [id, customerId, reason || "Cancelled by customer"]
    );

    let refundResult = { refunded: false };
    if (booking.refund_eligible) {
      try {
        refundResult = await refundBookingPayment(id);
      } catch (refundErr) {
        // Booking is still correctly cancelled even if the refund call itself
        // fails (e.g. Razorpay hiccup) - don't block cancellation on this.
        // Log it clearly so it can be handled manually if needed.
        console.error(`Refund failed for booking ${id}:`, refundErr);
        refundResult = { refunded: false, reason: "Refund processing failed, contact support" };
      }
    }

    res.json({
      message: "Booking cancelled",
      refundEligible: booking.refund_eligible,
      refund: refundResult,
    });
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ message: "Couldn't cancel this booking right now" });
  }
}

export async function rescheduleBooking(req, res) {
  try {
    const customerId = req.user.id;
    const { id } = req.params;
    const { slotDate, slotTime } = req.body;

    if (!slotDate || !slotTime) {
      return res.status(400).json({ message: "New slotDate and slotTime are required" });
    }

    const bookingResult = await pool.query(
      `SELECT * FROM bookings WHERE id = $1 AND customer_id = $2`,
      [id, customerId]
    );
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const booking = bookingResult.rows[0];

    if (!CUSTOMER_MODIFIABLE_STATUSES.includes(booking.status)) {
      return res.status(422).json({
        message: "This booking can no longer be rescheduled - the technician is already on the way.",
      });
    }

    // Reschedule never triggers a refund - it just moves the same booking charge
    // to a new slot. See utils/bookingStatus.js for the reasoning.
    await pool.query(
      `UPDATE bookings
       SET slot_date = $1, slot_time = $2, status = 'SCHEDULED',
           reschedule_count = reschedule_count + 1, rescheduled_by = 'customer', updated_at = now()
       WHERE id = $3`,
      [slotDate, slotTime, id]
    );

    await pool.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note)
       VALUES ($1, 'SCHEDULED', $2, 'Rescheduled by customer')`,
      [id, customerId]
    );

    res.json({ message: "Booking rescheduled" });
  } catch (err) {
    console.error("Reschedule booking error:", err);
    res.status(500).json({ message: "Couldn't reschedule this booking right now" });
  }
}

// ---------------------------------------------------------------------------
// Admin-facing endpoints (require role = 'admin', enforced in routes file)
// ---------------------------------------------------------------------------

export async function adminListAllBookings(req, res) {
  try {
    const { status, date } = req.query;

    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (date) {
      params.push(date);
      conditions.push(`b.slot_date = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT b.*, s.name AS service_name, a.address_text, u.name AS customer_name, u.phone AS customer_phone,
              jc.customer_status AS completion_status, jc.customer_note AS completion_note,
              jc.total_amount AS completion_total
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN customer_addresses a ON a.id = b.address_id
       JOIN users u ON u.id = b.customer_id
       LEFT JOIN job_completions jc ON jc.booking_id = b.id
       ${whereClause}
       ORDER BY b.slot_date ASC, b.slot_time ASC`,
      params
    );

    res.json({ bookings: result.rows });
  } catch (err) {
    console.error("Admin list bookings error:", err);
    res.status(500).json({ message: "Couldn't load bookings right now" });
  }
}

export async function adminEarnings(req, res) {
  try {
    // Revenue per booking = prepaid booking charge, plus the final job total
    // once the job is COMPLETED (approved report -> final_price is set).
    const activeStatuses = [
      "CONFIRMED", "SCHEDULED", "CALL_CONFIRMED", "ON_THE_WAY",
      "IN_PROGRESS", "PENDING_APPROVAL", "COMPLETED",
    ];

    const result = await pool.query(
      `SELECT
        COALESCE(SUM(rev) FILTER (WHERE slot_date = CURRENT_DATE), 0) AS today,
        COALESCE(SUM(rev) FILTER (WHERE slot_date >= date_trunc('week', CURRENT_DATE)), 0) AS this_week,
        COALESCE(SUM(rev), 0) AS all_time,
        count(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
        count(*) FILTER (WHERE slot_date = CURRENT_DATE) AS today_count
       FROM (
         SELECT slot_date, status,
                booking_charge + CASE WHEN status = 'COMPLETED' THEN COALESCE(final_price, 0) ELSE 0 END AS rev
         FROM bookings
         WHERE status = ANY($1)
       ) t`,
      [activeStatuses]
    );

    res.json({ earnings: result.rows[0] });
  } catch (err) {
    console.error("Admin earnings error:", err);
    res.status(500).json({ message: "Couldn't load earnings right now" });
  }
}

export async function adminUpdateStatus(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { status: newStatus, note } = req.body;

    if (!newStatus) {
      return res.status(400).json({ message: "New status is required" });
    }

    const bookingResult = await pool.query(`SELECT * FROM bookings WHERE id = $1`, [id]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const booking = bookingResult.rows[0];

    if (!isTransitionAllowed(booking.status, newStatus)) {
      return res.status(409).json({
        message: `Can't move a booking from ${booking.status} to ${newStatus}`,
      });
    }

    // These two moves only happen through the completion flow (report + customer
    // approval + warranty). Allowing them here would skip the warranty record.
    if (newStatus === "PENDING_APPROVAL" || newStatus === "COMPLETED") {
      return res.status(409).json({
        message: "Use the job completion form to finish this job",
      });
    }

    const refundEligible = computeRefundEligible(booking.refund_eligible, newStatus);

    if (newStatus === "CANCELLED") {
      await pool.query(
        `UPDATE bookings SET status = $1, refund_eligible = $2, cancellation_reason = $3, updated_at = now() WHERE id = $4`,
        [newStatus, refundEligible, note || "Cancelled by admin", id]
      );
    } else {
      await pool.query(
        `UPDATE bookings SET status = $1, refund_eligible = $2, updated_at = now() WHERE id = $3`,
        [newStatus, refundEligible, id]
      );
    }

    await pool.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note)
       VALUES ($1, $2, $3, $4)`,
      [id, newStatus, adminId, note || null]
    );

    // Admin-initiated cancellation always refunds - this is a company-side
    // override, distinct from customer cancellation which respects the
    // refund_eligible flag (see cancelBooking above).
    let refundResult = { refunded: false };
    if (newStatus === "CANCELLED") {
      try {
        refundResult = await refundBookingPayment(id);
      } catch (refundErr) {
        console.error(`Admin-initiated refund failed for booking ${id}:`, refundErr);
        refundResult = { refunded: false, reason: "Refund processing failed, handle manually" };
      }
    }

    // Live tracking starts the moment a booking hits ON_THE_WAY: generate a
    // tracking link. No SMS - admin/customer get the link in the app.
    let trackingUrl = null;
    if (newStatus === "ON_THE_WAY") {
      try {
        const token = await createTrackingToken(id);
        trackingUrl = `${process.env.FRONTEND_URL}/track/${token}`;
      } catch (trackingErr) {
        console.error(`Tracking setup failed for booking ${id}:`, trackingErr);
      }
    }

    // If a booking leaves ON_THE_WAY (technician arrived, or otherwise),
    // tell any open tracking pages to stop showing a live map.
    if (booking.status === "ON_THE_WAY" && newStatus !== "ON_THE_WAY") {
      getIO()?.to(`booking:${id}`).emit("tracking-ended");
    }

    res.json({ message: "Status updated", status: newStatus, refundEligible, refund: refundResult, trackingUrl });
  } catch (err) {
    console.error("Admin update status error:", err);
    res.status(500).json({ message: "Couldn't update this booking's status right now" });
  }
}

export async function adminReschedule(req, res) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { slotDate, slotTime, note } = req.body;

    if (!slotDate || !slotTime) {
      return res.status(400).json({ message: "New slotDate and slotTime are required" });
    }

    const bookingResult = await pool.query(`SELECT * FROM bookings WHERE id = $1`, [id]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Admin-initiated reschedule always keeps refund eligibility on - this is
    // an override for company-side issues (technician unavailable, etc.)
    await pool.query(
      `UPDATE bookings
       SET slot_date = $1, slot_time = $2, status = 'SCHEDULED', refund_eligible = true,
           reschedule_count = reschedule_count + 1, rescheduled_by = 'admin', updated_at = now()
       WHERE id = $3`,
      [slotDate, slotTime, id]
    );

    await pool.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note)
       VALUES ($1, 'SCHEDULED', $2, $3)`,
      [id, adminId, note || "Rescheduled by admin"]
    );

    res.json({ message: "Booking rescheduled by admin, refund eligibility preserved" });
  } catch (err) {
    console.error("Admin reschedule error:", err);
    res.status(500).json({ message: "Couldn't reschedule this booking right now" });
  }
} */









import { pool } from "../config/db.js";
import { getBookingCharge } from "../utils/distance.js";
import { findNextAvailableDate, countBookingsOnDate } from "../utils/availability.js";
import {
  CUSTOMER_MODIFIABLE_STATUSES,
  CUSTOMER_RESCHEDULABLE_STATUSES,
} from "../utils/bookingStatus.js";
import { refundBookingPayment } from "../utils/refundService.js";
import { changeBookingStatus } from "../utils/bookingActions.js";
import { logActivity, logActivitySafe } from "../utils/activity.js";
import { assertSlotAvailable } from "../utils/slotRules.js";
import { assertValidFutureDate } from "../utils/dates.js";
import { HttpError, sendError } from "../utils/httpError.js";
import { POLICY_VERSION } from "../utils/policy.js";
import { CALL_DUE_FIELDS_SQL } from "../utils/CallDue.js";

export async function checkAvailability(req, res) {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: "date query param is required (YYYY-MM-DD)" });
    }

    const technicianResult = await pool.query(
      `SELECT id, max_bookings_per_day FROM technicians WHERE is_active = true ORDER BY id ASC LIMIT 1`
    );
    if (technicianResult.rows.length === 0) {
      return res.status(503).json({ message: "No technician is available right now" });
    }
    const { id: technicianId, max_bookings_per_day: maxPerDay } = technicianResult.rows[0];

    const booked = await countBookingsOnDate(pool, technicianId, date);

    if (booked < maxPerDay) {
      return res.json({ date, available: true, booked, capacity: maxPerDay });
    }

    const next = await findNextAvailableDate(pool, technicianId, maxPerDay, date);
    res.json({
      date,
      available: false,
      booked,
      capacity: maxPerDay,
      suggestedDate: next?.date ?? null,
    });
  } catch (err) {
    console.error("Check availability error:", err);
    res.status(500).json({ message: "Couldn't check availability right now" });
  }
}

// ---------------------------------------------------------------------------
// Customer-facing endpoints
// ---------------------------------------------------------------------------

export async function createBooking(req, res) {
  const client = await pool.connect();
  try {
    const customerId = req.user.id;
    const { serviceId, addressId, slotDate, slotTime, acceptedPolicy } = req.body;

    if (!serviceId || !addressId || !slotDate || !slotTime) {
      return res
        .status(400)
        .json({ message: "serviceId, addressId, slotDate, and slotTime are all required" });
    }
    if (acceptedPolicy !== true) {
      return res.status(400).json({
        code: "POLICY_NOT_ACCEPTED",
        message: "Please accept the cancellation & refund policy to continue",
      });
    }
    await assertValidFutureDate(client, slotDate, slotTime);

    // The technician must be able to call the customer - phone is mandatory
    const phoneRow = await client.query(`SELECT phone FROM users WHERE id = $1`, [customerId]);
    if (!phoneRow.rows[0]?.phone) {
      return res.status(422).json({
        code: "PHONE_REQUIRED",
        message: "Please add your mobile number before booking so our technician can reach you",
      });
    }

    // Validate the service exists and is active
    const serviceResult = await client.query(
      `SELECT id, name FROM services WHERE id = $1 AND is_active = true`,
      [serviceId]
    );
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: "This service isn't available right now" });
    }

    // Validate the address belongs to this customer (never trust a client-sent address_id blindly)
    const addressResult = await client.query(
      `SELECT id, distance_km FROM customer_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, customerId]
    );
    if (addressResult.rows.length === 0) {
      return res.status(404).json({ message: "Address not found on your account" });
    }
    const { distance_km: distanceKm } = addressResult.rows[0];

    const bookingCharge = await getBookingCharge(client, distanceKm);
    if (bookingCharge === null) {
      return res
        .status(422)
        .json({ message: "Couldn't calculate a price for this distance. Contact support." });
    }

    // v1: single active technician, auto-assigned. This is the one line that
    // changes when multi-technician assignment logic is added later.
    const technicianResult = await client.query(
      `SELECT id, max_bookings_per_day FROM technicians WHERE is_active = true ORDER BY id ASC LIMIT 1`
    );
    if (technicianResult.rows.length === 0) {
      return res.status(503).json({ message: "No technician is available right now" });
    }
    const { id: technicianId, max_bookings_per_day: maxPerDay } = technicianResult.rows[0];

    await client.query("BEGIN");

    // Advisory lock keyed to this technician+date - serializes concurrent
    // booking attempts for the same day (covers both the exact-slot check
    // and the daily-capacity check below) without needing a separate slots
    // table. Held only for the duration of this transaction.
    const lockKey = `${technicianId}:${slotDate}`;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);

    // Daily capacity check - if this technician is already fully booked for
    // the requested day, reject with the next day that actually has room.
    // This cascades forward automatically: if day+1 is also full, it keeps
    // walking forward until it finds an open day.
    const bookedToday = await countBookingsOnDate(client, technicianId, slotDate);
    if (bookedToday >= maxPerDay) {
      await client.query("ROLLBACK");
      const next = await findNextAvailableDate(pool, technicianId, maxPerDay, slotDate);
      return res.status(409).json({
        message: next
          ? `${slotDate} is fully booked. The next available date is ${next.date}.`
          : `${slotDate} is fully booked and no open dates were found in the next 30 days.`,
        fullyBooked: true,
        suggestedDate: next?.date ?? null,
      });
    }

    const conflictResult = await client.query(
      `SELECT id FROM bookings
       WHERE technician_id = $1 AND slot_date = $2 AND slot_time = $3
       AND status NOT IN ('CANCELLED', 'NO_SHOW')`,
      [technicianId, slotDate, slotTime]
    );

    if (conflictResult.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "That exact time slot was just taken. Pick another time." });
    }

    const insertResult = await client.query(
      `INSERT INTO bookings
        (customer_id, technician_id, service_id, address_id, distance_km, booking_charge, slot_date, slot_time,
         status, refund_eligible, policy_version, policy_accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', true, $9, now())
       RETURNING *`,
      [customerId, technicianId, serviceId, addressId, distanceKm, bookingCharge, slotDate, slotTime, POLICY_VERSION]
    );
    const booking = insertResult.rows[0];

    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note)
       VALUES ($1, 'PENDING', $2, 'Booking created')`,
      [booking.id, customerId]
    );

    await client.query("COMMIT");

    res.status(201).json({ booking });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof HttpError) return sendError(res, err);
    console.error("Create booking error:", err);
    res.status(500).json({ message: "Couldn't create this booking right now" });
  } finally {
    client.release();
  }
}

export async function listMyBookings(req, res) {
  try {
    const customerId = req.user.id;
    const result = await pool.query(
      `SELECT b.*, s.name AS service_name, a.address_text,
              jc.customer_status AS completion_status, jc.customer_note AS completion_note,
              jc.total_amount AS completion_total,
              to_char(w.expires_on, 'YYYY-MM-DD') AS warranty_expires_on,
              t.name AS technician_name,
              CASE WHEN b.status IN ('CALL_CONFIRMED','ON_THE_WAY','IN_PROGRESS','PENDING_APPROVAL','COMPLETED')
                   THEN t.phone END AS technician_phone,
              rf.status AS refund_status, rf.amount AS refund_amount,
              lc.started_at AS last_call_at, lc.outcome AS last_call_outcome
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN customer_addresses a ON a.id = b.address_id
       LEFT JOIN job_completions jc ON jc.booking_id = b.id
       LEFT JOIN warranties w ON w.booking_id = b.id
       LEFT JOIN technicians t ON t.id = b.technician_id
       LEFT JOIN LATERAL (
         SELECT status, amount FROM refunds WHERE booking_id = b.id ORDER BY id DESC LIMIT 1
       ) rf ON true
       LEFT JOIN LATERAL (
         SELECT started_at, ended_at, outcome, note FROM call_logs WHERE booking_id = b.id ORDER BY id DESC LIMIT 1
       ) lc ON true
       WHERE b.customer_id = $1
       ORDER BY b.created_at DESC`,
      [customerId]
    );
    res.json({ bookings: result.rows });
  } catch (err) {
    console.error("List bookings error:", err);
    res.status(500).json({ message: "Couldn't load your bookings right now" });
  }
}

export async function getMyBookingById(req, res) {
  try {
    const customerId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT b.*, s.name AS service_name, a.address_text
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN customer_addresses a ON a.id = b.address_id
       WHERE b.id = $1 AND b.customer_id = $2`,
      [id, customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const historyResult = await pool.query(
      `SELECT status, note, changed_at FROM booking_status_history
       WHERE booking_id = $1 ORDER BY changed_at ASC`,
      [id]
    );

    res.json({ booking: result.rows[0], history: historyResult.rows });
  } catch (err) {
    console.error("Get booking error:", err);
    res.status(500).json({ message: "Couldn't load this booking right now" });
  }
}

export async function cancelBooking(req, res) {
  try {
    const customerId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    const bookingResult = await pool.query(
      `SELECT b.*, s.name AS service_name FROM bookings b JOIN services s ON s.id = b.service_id
       WHERE b.id = $1 AND b.customer_id = $2`,
      [id, customerId]
    );
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const booking = bookingResult.rows[0];

    if (!CUSTOMER_MODIFIABLE_STATUSES.includes(booking.status)) {
      return res.status(422).json({
        message: "This booking can no longer be cancelled - the technician is already on the way.",
      });
    }

    const cancelReason = (typeof reason === "string" && reason.trim()) || "Cancelled by customer";

    // The WHERE on status makes a double-click harmless: only the first request flips it.
    const upd = await pool.query(
      `UPDATE bookings
       SET status = 'CANCELLED', cancellation_reason = $1, updated_at = now()
       WHERE id = $2 AND status = ANY($3)
       RETURNING id`,
      [cancelReason, id, CUSTOMER_MODIFIABLE_STATUSES]
    );
    if (upd.rows.length === 0) {
      return res.status(409).json({ message: "This booking was just updated. Refresh and try again." });
    }

    await pool.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note)
       VALUES ($1, 'CANCELLED', $2, $3)`,
      [id, customerId, cancelReason]
    );

    let refundResult = { refunded: false };
    if (booking.refund_eligible) {
      // Never throws: a Razorpay failure is recorded as a FAILED refund + admin alert,
      // and the booking stays correctly cancelled.
      refundResult = await refundBookingPayment(id, {
        reason: "Cancelled by customer before the technician left",
        actor: { id: customerId, role: "customer" },
      });
    }

    await logActivitySafe(pool, {
      actor: { id: customerId, role: "customer" },
      bookingId: Number(id),
      action: "booking_cancelled",
      summary: `Customer cancelled booking #${id} (${booking.service_name})` +
        (refundResult.refunded ? " - refund started" : refundResult.failed ? " - REFUND FAILED" : ""),
      meta: { reason: cancelReason, refund: refundResult.refunded ? "started" : refundResult.failed ? "failed" : "none" },
    });

    res.json({
      message: "Booking cancelled",
      refundEligible: booking.refund_eligible,
      refund: refundResult,
    });
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ message: "Couldn't cancel this booking right now" });
  }
}

// Shared by the customer and admin reschedule: lock, re-check the new slot, move, log.
async function moveBookingToSlot({ bookingId, slotDate, slotTime, actor, customerId = null, allowedStatuses, refundEligibleOverride = null, note, ignoreCapacity = false }) {
  const client = await pool.connect();
  try {
    await assertValidFutureDate(client, slotDate, slotTime);
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT b.*, u.name AS customer_name, s.name AS service_name
       FROM bookings b JOIN users u ON u.id = b.customer_id JOIN services s ON s.id = b.service_id
       WHERE b.id = $1 FOR UPDATE OF b`,
      [bookingId]
    );
    const booking = r.rows[0];
    if (!booking || (customerId !== null && booking.customer_id !== customerId)) {
      throw new HttpError(404, "Booking not found");
    }
    if (!allowedStatuses.includes(booking.status)) {
      throw new HttpError(422, actor.role === "customer"
        ? booking.status === "PENDING"
          ? "Please complete the payment first, or cancel this booking and book again."
          : "This booking can no longer be rescheduled - the technician is already on the way."
        : `A ${booking.status} booking can't be rescheduled`);
    }
    if (!booking.technician_id) throw new HttpError(409, "This booking has no technician yet. Assign one first.");

    if (!ignoreCapacity) {
      await assertSlotAvailable(client, {
        technicianId: booking.technician_id,
        slotDate,
        slotTime,
        excludeBookingId: booking.id,
      });
    }

    await client.query(
      `UPDATE bookings
       SET slot_date = $1, slot_time = $2, status = 'SCHEDULED',
           refund_eligible = COALESCE($3::boolean, refund_eligible),
           reschedule_count = reschedule_count + 1, rescheduled_by = $4, updated_at = now()
       WHERE id = $5`,
      [slotDate, slotTime, refundEligibleOverride, actor.role, bookingId]
    );
    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note) VALUES ($1, 'SCHEDULED', $2, $3)`,
      [bookingId, actor.id, note]
    );
    await logActivity(client, {
      actor,
      bookingId: booking.id,
      action: "rescheduled",
      summary: `${actor.role === "admin" ? "Admin" : "Customer"} rescheduled #${booking.id} (${booking.customer_name}, ${booking.service_name}) to ${slotDate} ${String(slotTime).slice(0, 5)}`,
      meta: { slotDate, slotTime },
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function rescheduleBooking(req, res) {
  try {
    const { slotDate, slotTime } = req.body;
    if (!slotDate || !slotTime) {
      return res.status(400).json({ message: "New slotDate and slotTime are required" });
    }
    // Customer reschedule never triggers a refund - the same booking charge just moves
    // to the new slot (refundEligibleOverride stays null = unchanged).
    await moveBookingToSlot({
      bookingId: req.params.id,
      slotDate,
      slotTime,
      actor: { id: req.user.id, role: "customer" },
      customerId: req.user.id,
      allowedStatuses: CUSTOMER_RESCHEDULABLE_STATUSES,
      note: "Rescheduled by customer",
    });
    res.json({ message: "Booking rescheduled" });
  } catch (err) {
    sendError(res, err, "Reschedule booking");
  }
}

// ---------------------------------------------------------------------------
// Admin-facing endpoints (require role = 'admin', enforced in routes file)
// ---------------------------------------------------------------------------

export async function adminListAllBookings(req, res) {
  try {
    const { status, date, technicianId } = req.query;

    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (date) {
      params.push(date);
      conditions.push(`b.slot_date = $${params.length}`);
    }
    if (technicianId) {
      params.push(technicianId);
      conditions.push(`b.technician_id = $${params.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT b.*, s.name AS service_name, a.address_text, u.name AS customer_name, u.phone AS customer_phone,
              jc.customer_status AS completion_status, jc.customer_note AS completion_note,
              jc.total_amount AS completion_total,
              t.name AS technician_name,
              rf.status AS refund_status, rf.amount AS refund_amount,
              lc.started_at AS last_call_at, lc.ended_at AS last_call_ended_at,
              lc.outcome AS last_call_outcome, lc.note AS last_call_note,
              (SELECT count(*)::int FROM call_logs c WHERE c.booking_id = b.id) AS call_attempts,
              ${CALL_DUE_FIELDS_SQL}
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN customer_addresses a ON a.id = b.address_id
       JOIN users u ON u.id = b.customer_id
       LEFT JOIN job_completions jc ON jc.booking_id = b.id
       LEFT JOIN technicians t ON t.id = b.technician_id
       LEFT JOIN LATERAL (
         SELECT status, amount FROM refunds WHERE booking_id = b.id ORDER BY id DESC LIMIT 1
       ) rf ON true
       LEFT JOIN LATERAL (
         SELECT started_at, ended_at, outcome, note FROM call_logs WHERE booking_id = b.id ORDER BY id DESC LIMIT 1
       ) lc ON true
       ${whereClause}
       ORDER BY b.slot_date ASC, b.slot_time ASC`,
      params
    );

    res.json({ bookings: result.rows });
  } catch (err) {
    console.error("Admin list bookings error:", err);
    res.status(500).json({ message: "Couldn't load bookings right now" });
  }
}

export async function adminEarnings(req, res) {
  try {
    // Revenue per booking = prepaid booking charge, plus the final job total
    // once the job is COMPLETED (approved report -> final_price is set).
    const activeStatuses = [
      "CONFIRMED", "SCHEDULED", "CALL_CONFIRMED", "ON_THE_WAY",
      "IN_PROGRESS", "PENDING_APPROVAL", "COMPLETED",
    ];

    const result = await pool.query(
      `SELECT
        COALESCE(SUM(rev) FILTER (WHERE slot_date = CURRENT_DATE), 0) AS today,
        COALESCE(SUM(rev) FILTER (WHERE slot_date >= date_trunc('week', CURRENT_DATE)), 0) AS this_week,
        COALESCE(SUM(rev), 0) AS all_time,
        count(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
        count(*) FILTER (WHERE slot_date = CURRENT_DATE) AS today_count
       FROM (
         SELECT slot_date, status,
                booking_charge + CASE WHEN status = 'COMPLETED' THEN COALESCE(final_price, 0) ELSE 0 END AS rev
         FROM bookings
         WHERE status = ANY($1)
       ) t`,
      [activeStatuses]
    );

    res.json({ earnings: result.rows[0] });
  } catch (err) {
    console.error("Admin earnings error:", err);
    res.status(500).json({ message: "Couldn't load earnings right now" });
  }
}

export async function adminUpdateStatus(req, res) {
  try {
    const { status: newStatus, note } = req.body || {};
    if (!newStatus) {
      return res.status(400).json({ message: "New status is required" });
    }
    const result = await changeBookingStatus({
      bookingId: req.params.id,
      newStatus,
      actor: { id: req.user.id, role: "admin" },
      note,
    });
    res.json({
      message: "Status updated",
      status: result.status,
      refundEligible: result.refundEligible,
      refund: result.refund,
      trackingUrl: result.trackingUrl,
    });
  } catch (err) {
    sendError(res, err, "Admin update status");
  }
}

export async function adminReschedule(req, res) {
  try {
    const { slotDate, slotTime, note, force } = req.body || {};
    if (!slotDate || !slotTime) {
      return res.status(400).json({ message: "New slotDate and slotTime are required" });
    }
    // Admin-initiated reschedule always keeps refund eligibility on - this is an
    // override for company-side issues (technician unavailable, etc.).
    // force:true lets the admin knowingly go over the daily cap.
    await moveBookingToSlot({
      bookingId: req.params.id,
      slotDate,
      slotTime,
      actor: { id: req.user.id, role: "admin" },
      allowedStatuses: [...CUSTOMER_RESCHEDULABLE_STATUSES, "NO_SHOW"],
      refundEligibleOverride: true,
      note: note || "Rescheduled by admin",
      ignoreCapacity: force === true,
    });
    res.json({ message: "Booking rescheduled by admin, refund eligibility preserved" });
  } catch (err) {
    sendError(res, err, "Admin reschedule");
  }
}

// POST /api/bookings/:id/report-no-call
// The customer says "the technician marked the call as done, but nobody called me".
// This is the cross-check on the technician's word: the admin gets a red item.
export async function reportNoCall(req, res) {
  try {
    const r = await pool.query(
      `SELECT b.id, b.status, u.name AS customer_name, s.name AS service_name, t.name AS technician_name
       FROM bookings b
       JOIN users u ON u.id = b.customer_id
       JOIN services s ON s.id = b.service_id
       LEFT JOIN technicians t ON t.id = b.technician_id
       WHERE b.id = $1 AND b.customer_id = $2`,
      [req.params.id, req.user.id]
    );
    const b = r.rows[0];
    if (!b) throw new HttpError(404, "Booking not found");
    if (b.status !== "CALL_CONFIRMED") {
      throw new HttpError(409, "This only applies after the technician has confirmed your visit by phone");
    }
    // One open report per booking is enough; don't let it be spammed.
    const dup = await pool.query(
      `SELECT 1 FROM activity_log WHERE booking_id = $1 AND action = 'customer_no_call' AND acknowledged_at IS NULL`,
      [b.id]
    );
    if (dup.rows.length === 0) {
      await logActivity(pool, {
        actor: { id: req.user.id, role: "customer" },
        bookingId: b.id,
        action: "customer_no_call",
        summary: `${b.customer_name} says nobody called about #${b.id} (${b.service_name}), but ${b.technician_name || "the technician"} marked the call as confirmed`,
        needsAttention: true,
      });
    }
    res.json({ message: "Thanks. The shop has been told and will call you." });
  } catch (err) {
    sendError(res, err, "Report no call");
  }
}