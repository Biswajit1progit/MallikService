import { pool } from "../config/db.js";
import { isTransitionAllowed } from "./bookingStatus.js";
import { refundBookingPayment } from "./refundService.js";
import { logActivity, logActivitySafe } from "./activity.js";

// ONE place that turns "Razorpay says this order was paid" into a confirmed booking.
// Used by the customer's browser callback (/payments/verify), by Razorpay's webhook and by the
// expiry sweep's double-check, so all three behave the same and can safely run for the same payment.
//
// Rules this guarantees:
//   * The paid order must belong to THIS booking (payments row matches order AND booking).
//     A payment for booking A can never confirm booking B.
//   * Safe to call twice (double tap, browser + webhook): the second call changes nothing.
//   * If the booking can no longer be confirmed (it expired while the customer was paying),
//     the money is refunded automatically instead of being left stranded.
//
//   customerId  pass it from a logged-in request to also require that the booking is theirs;
//               leave it out for the webhook and the sweep.
//   actor       who gets credited in the activity feed (null = the system).
//
// Returns { outcome, status? } with outcome one of:
//   "confirmed" | "already" | "mismatch" | "not_found" | "refunded" | "refund_failed"
export async function confirmPaidBooking({ bookingId, orderId, paymentId, customerId = null, actor = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const payRes = await client.query(
      `SELECT * FROM payments WHERE razorpay_order_id = $1 AND booking_id = $2 FOR UPDATE`,
      [orderId, bookingId]
    );
    const payment = payRes.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return { outcome: "mismatch" };
    }

    const bookingRes = await client.query(
      `SELECT * FROM bookings WHERE id = $1 ${customerId ? "AND customer_id = $2" : ""} FOR UPDATE`,
      customerId ? [bookingId, customerId] : [bookingId]
    );
    const booking = bookingRes.rows[0];
    if (!booking) {
      await client.query("ROLLBACK");
      return { outcome: "not_found" };
    }

    // Already handled earlier (the customer's browser and the webhook both report the same payment).
    if ((payment.status === "success" || payment.status === "refunded") && booking.status !== "PENDING") {
      await client.query("ROLLBACK");
      return { outcome: "already", status: booking.status };
    }

    // The booking can't be confirmed any more (expired while the customer was paying).
    // The money IS captured at Razorpay, so give it back.
    if (!isTransitionAllowed(booking.status, "CONFIRMED")) {
      await client.query(`UPDATE payments SET razorpay_payment_id = $1, status = 'success' WHERE id = $2`, [paymentId, payment.id]);
      await client.query("COMMIT");

      let refundResult;
      try {
        refundResult = await refundBookingPayment(bookingId, {
          reason: "Slot expired while the payment was in progress",
          actor: actor || null,
        });
      } catch (refundErr) {
        console.error(`Auto-refund failed for orphaned payment on booking ${bookingId}:`, refundErr);
        refundResult = { refunded: false };
      }
      await logActivitySafe(pool, {
        actor,
        bookingId: Number(bookingId),
        action: "payment_orphaned",
        summary: `Payment arrived after booking #${bookingId} expired - ${refundResult.refunded ? "auto-refunded" : "REFUND NEEDS ATTENTION"}`,
        needsAttention: !refundResult.refunded,
      });
      return { outcome: refundResult.refunded ? "refunded" : "refund_failed", status: booking.status };
    }

    await client.query(`UPDATE payments SET razorpay_payment_id = $1, status = 'success' WHERE id = $2`, [paymentId, payment.id]);
    await client.query(`UPDATE bookings SET status = 'CONFIRMED', updated_at = now() WHERE id = $1`, [bookingId]);
    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note)
       VALUES ($1, 'CONFIRMED', $2, $3)`,
      [bookingId, actor?.id ?? null, actor ? "Payment verified" : "Payment confirmed by Razorpay"]
    );

    const info = await client.query(
      `SELECT u.name AS customer_name, s.name AS service_name, to_char(b.slot_date, 'YYYY-MM-DD') AS slot_date,
              b.slot_time, b.booking_charge
       FROM bookings b JOIN users u ON u.id = b.customer_id JOIN services s ON s.id = b.service_id
       WHERE b.id = $1`,
      [bookingId]
    );
    const i = info.rows[0];
    await logActivity(client, {
      actor,
      bookingId: Number(bookingId),
      action: "payment_received",
      summary: `New booking #${bookingId}: ${i.customer_name} paid ₹${i.booking_charge} for ${i.service_name} on ${i.slot_date} ${String(i.slot_time).slice(0, 5)}`,
      meta: { amount: Number(i.booking_charge) },
    });

    await client.query("COMMIT");
    return { outcome: "confirmed", status: "CONFIRMED" };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // The same Razorpay payment id can never be stored on two payment rows.
    if (err.code === "23505") return { outcome: "mismatch" };
    throw err;
  } finally {
    client.release();
  }
}