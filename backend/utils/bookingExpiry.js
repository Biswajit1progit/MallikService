/* import { pool } from "../config/db.js";

// Any booking still PENDING (payment never completed) after this many minutes
// gets auto-cancelled so the slot frees up for someone else.
const PENDING_EXPIRY_MINUTES = 15;

export async function expireStalePendingBookings() {
  try {
    const result = await pool.query(
      `UPDATE bookings
       SET status = 'CANCELLED', cancellation_reason = 'Expired - payment not completed', updated_at = now()
       WHERE status = 'PENDING' AND created_at < now() - interval '${PENDING_EXPIRY_MINUTES} minutes'
       RETURNING id`
    );

    if (result.rows.length > 0) {
      const ids = result.rows.map((r) => r.id);
      // Log each expiry in the history table too, same as any other status change
      const values = ids.map((id) => `(${id}, 'CANCELLED', 'Auto-expired after ${PENDING_EXPIRY_MINUTES} min unpaid')`).join(",");
      await pool.query(
        `INSERT INTO booking_status_history (booking_id, status, note) VALUES ${values}`
      );
      console.log(`Auto-expired ${ids.length} stale pending booking(s): ${ids.join(", ")}`);
    }
  } catch (err) {
    console.error("Expiry sweep error:", err);
  }
} */
import { pool } from "../config/db.js";
import { razorpay } from "../config/razorpay.js";
import { confirmPaidBooking } from "./Paymentconfirm.js";

// Any booking still PENDING (payment never completed) after this many minutes
// gets auto-cancelled so the slot frees up for someone else.
const PENDING_EXPIRY_MINUTES = 15;

// Before cancelling, ask Razorpay whether the customer actually paid (their phone may have
// lost signal before telling us, and the webhook may not have arrived). If they did, confirm the
// booking instead. If Razorpay can't be reached we leave that booking alone this round: wrongly
// cancelling a paid booking is worse than keeping a slot a few minutes longer.
// Returns the ids to leave alone.
async function settlePaidOnes() {
  const leave = [];
  const stale = await pool.query(
    `SELECT b.id, p.razorpay_order_id
     FROM bookings b JOIN payments p ON p.booking_id = b.id AND p.status = 'pending'
     WHERE b.status = 'PENDING' AND b.created_at < now() - interval '${PENDING_EXPIRY_MINUTES} minutes'`
  );
  for (const row of stale.rows) {
    try {
      const r = await razorpay.orders.fetchPayments(row.razorpay_order_id);
      const paid = (r?.items || []).find((i) => i.status === "captured");
      if (paid) {
        await confirmPaidBooking({ bookingId: row.id, orderId: row.razorpay_order_id, paymentId: paid.id });
        leave.push(row.id);
      }
    } catch (err) {
      console.error(`Couldn't check Razorpay for booking ${row.id}:`, err?.error?.description || err.message);
      leave.push(row.id);
    }
  }
  return leave;
}

export async function expireStalePendingBookings() {
  try {
    const leave = await settlePaidOnes().catch((err) => {
      console.error("Payment double-check failed:", err.message);
      return null;
    });
    if (leave === null) return; // don't cancel anything blind

    const result = await pool.query(
      `UPDATE bookings
       SET status = 'CANCELLED', cancellation_reason = 'Expired - payment not completed', updated_at = now()
       WHERE status = 'PENDING' AND created_at < now() - interval '${PENDING_EXPIRY_MINUTES} minutes'
         AND id <> ALL($1::int[])
       RETURNING id`,
      [leave]
    );

    if (result.rows.length > 0) {
      const ids = result.rows.map((r) => r.id);
      // Log each expiry in the history table too, same as any other status change
      const values = ids.map((id) => `(${id}, 'CANCELLED', 'Auto-expired after ${PENDING_EXPIRY_MINUTES} min unpaid')`).join(",");
      await pool.query(
        `INSERT INTO booking_status_history (booking_id, status, note) VALUES ${values}`
      );
      console.log(`Auto-expired ${ids.length} stale pending booking(s): ${ids.join(", ")}`);
    }
  } catch (err) {
    console.error("Expiry sweep error:", err);
  }
}