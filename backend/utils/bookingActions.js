import { pool } from "../config/db.js";
import { isTransitionAllowed, computeRefundEligible } from "./bookingStatus.js";
import { refundBookingPayment } from "./refundService.js";
import { createTrackingToken } from "./trackingToken.js";
import { getIO } from "./socketInstance.js";
import { logActivity } from "./activity.js";
import { HttpError } from "./httpError.js";

// What a technician is allowed to do. The admin can do everything the status map allows.
export const TECHNICIAN_ALLOWED_TARGETS = ["CALL_CONFIRMED", "ON_THE_WAY", "IN_PROGRESS", "NO_SHOW"];

function describe(status, who, b) {
  const job = `#${b.id} (${b.service_name})`;
  switch (status) {
    case "CONFIRMED": return `${who} confirmed ${b.customer_name}'s booking ${job}`;
    case "SCHEDULED": return `${who} scheduled ${b.customer_name}'s visit ${job}`;
    case "CALL_CONFIRMED": return `${who} confirmed the call with ${b.customer_name} ${job}`;
    case "ON_THE_WAY": return `${who} started the trip to ${b.customer_name} ${job}`;
    case "IN_PROGRESS": return `${who} arrived and started work for ${b.customer_name} ${job}`;
    case "NO_SHOW": return `${who} marked ${b.customer_name} as no-show ${job}`;
    case "CANCELLED": return `${who} cancelled ${b.customer_name}'s booking ${job}`;
    case "RESCHEDULE_NEEDED": return `${who} flagged ${job} for reschedule`;
    default: return `${who} moved ${job} to ${status}`;
  }
}

// The ONE place a booking's status changes (admin and technician both use it).
//
//   technicianId  when set, the booking must belong to that technician (404 otherwise)
//   actor         { id, role }
//
// Everything that must be atomic (row lock, status, history, activity log) is inside one
// transaction. Slow/external things (refund, tracking link) run after COMMIT.
export async function changeBookingStatus({ bookingId, newStatus, actor, note = null, technicianId = null }) {
  const client = await pool.connect();
  let booking;
  let refundEligible;
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `SELECT b.*, u.name AS customer_name, s.name AS service_name,
              (b.slot_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS slot_is_due
       FROM bookings b
       JOIN users u ON u.id = b.customer_id
       JOIN services s ON s.id = b.service_id
       WHERE b.id = $1
       FOR UPDATE OF b`,
      [bookingId]
    );
    booking = r.rows[0];
    if (!booking || (technicianId !== null && booking.technician_id !== technicianId)) {
      throw new HttpError(404, "Booking not found");
    }

    const isTech = actor.role === "technician";
    const cleanNote = typeof note === "string" ? note.trim() : "";

    if (isTech && !TECHNICIAN_ALLOWED_TARGETS.includes(newStatus)) {
      throw new HttpError(403, "You can't make this change. Ask the admin.");
    }
    if (!isTransitionAllowed(booking.status, newStatus)) {
      throw new HttpError(409, `Can't move a booking from ${booking.status} to ${newStatus}`);
    }
    // These two only happen through the completion flow (report + approval + warranty).
    if (newStatus === "PENDING_APPROVAL" || newStatus === "COMPLETED") {
      throw new HttpError(409, "Use the job completion form to finish this job");
    }
    if (isTech && newStatus === "NO_SHOW") {
      if (booking.status !== "ON_THE_WAY") {
        throw new HttpError(409, "No-show can only be marked after you have travelled to the customer");
      }
      if (cleanNote.length < 5) {
        throw new HttpError(400, "Say what happened (for example: door locked, phone switched off)");
      }
    }
    if (isTech && newStatus === "ON_THE_WAY" && !booking.slot_is_due) {
      throw new HttpError(409, "This visit is scheduled for a later day. You can start the trip on the day.");
    }

    refundEligible = computeRefundEligible(booking.refund_eligible, newStatus);

    if (newStatus === "CANCELLED") {
      await client.query(
        `UPDATE bookings SET status = $1, refund_eligible = $2, cancellation_reason = $3, updated_at = now() WHERE id = $4`,
        [newStatus, refundEligible, cleanNote || "Cancelled by admin", bookingId]
      );
    } else {
      await client.query(
        `UPDATE bookings SET status = $1, refund_eligible = $2, updated_at = now() WHERE id = $3`,
        [newStatus, refundEligible, bookingId]
      );
    }

    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note) VALUES ($1, $2, $3, $4)`,
      [bookingId, newStatus, actor.id, cleanNote || null]
    );

    const who = isTech ? "Technician" : "Admin";
    await logActivity(client, {
      actor,
      bookingId,
      action: "status_changed",
      summary: describe(newStatus, who, booking) + (cleanNote && newStatus === "NO_SHOW" ? `: "${cleanNote}"` : ""),
      meta: { from: booking.status, to: newStatus, note: cleanNote || null },
      needsAttention: newStatus === "NO_SHOW" && isTech,
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // ---- after COMMIT ----
  // Company-side cancellation always refunds (customer cancellation goes through
  // cancelBooking, which respects refund_eligible).
  let refund = { refunded: false };
  if (newStatus === "CANCELLED") {
    refund = await refundBookingPayment(bookingId, {
      reason: cleanOrDefault(note, "Cancelled by the shop"),
      actor,
    });
  }

  let trackingUrl = null;
  if (newStatus === "ON_THE_WAY") {
    try {
      const token = await createTrackingToken(bookingId);
      trackingUrl = `${process.env.FRONTEND_URL}/track/${token}`;
    } catch (err) {
      console.error(`Tracking setup failed for booking ${bookingId}:`, err);
    }
  }

  if (booking.status === "ON_THE_WAY" && newStatus !== "ON_THE_WAY") {
    getIO()?.to(`booking:${bookingId}`).emit("tracking-ended");
  }

  return { status: newStatus, refundEligible, refund, trackingUrl, previousStatus: booking.status };
}

function cleanOrDefault(note, fallback) {
  const n = typeof note === "string" ? note.trim() : "";
  return n || fallback;
}