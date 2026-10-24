import { pool } from "../config/db.js";
import { razorpay } from "../config/razorpay.js";
import { logActivitySafe } from "./activity.js";

// ---------------------------------------------------------------------------
// Refunds. Rules this file guarantees:
//  1. Every attempt is written to the `refunds` table - including failures - so
//     money never "disappears" into a console.log.
//  2. A payment can never be refunded twice: the row is CLAIMED first (unique
//     index allows one live refund per payment), and only then is Razorpay called.
//     Double click, retry, or two admins at once -> still one refund.
//  3. A Razorpay failure never throws to the caller. The booking action (cancel...)
//     still succeeds; the refund row is FAILED, the admin is alerted in the feed,
//     and can retry with one click.
// ---------------------------------------------------------------------------

const LIVE = ["INITIATED", "PROCESSED"];

// Calls Razorpay for an already-claimed refund row and records the outcome.
async function executeRefund(refund, payment, actor) {
  let rz;
  try {
    rz = await razorpay.payments.refund(payment.razorpay_payment_id, {
      amount: Math.round(Number(refund.amount) * 100), // Razorpay wants paise
      notes: { bookingId: String(refund.booking_id), reason: String(refund.reason).slice(0, 200) },
    });
  } catch (err) {
    const why = err?.error?.description || err?.message || "Unknown Razorpay error";
    await pool.query(
      `UPDATE refunds SET status = 'FAILED', failure_reason = $2, updated_at = now() WHERE id = $1`,
      [refund.id, why]
    );
    await logActivitySafe(pool, {
      actor,
      bookingId: refund.booking_id,
      action: "refund_failed",
      summary: `Refund of ₹${refund.amount} for booking #${refund.booking_id} FAILED (${why}). Retry it from Refunds.`,
      meta: { refundId: refund.id, reason: why },
      needsAttention: true,
    });
    console.error(`Refund ${refund.id} for booking ${refund.booking_id} failed:`, why);
    return {
      refunded: false,
      failed: true,
      refundRecordId: refund.id,
      reason: "The refund couldn't be processed automatically. The shop has been alerted and will fix it.",
    };
  }

  // Razorpay accepted it. From here the money IS moving - never mark FAILED.
  const status = rz.status === "processed" ? "PROCESSED" : "INITIATED";
  try {
    await pool.query(
      `UPDATE refunds SET status = $2, razorpay_refund_id = $3, failure_reason = NULL, updated_at = now() WHERE id = $1`,
      [refund.id, status, rz.id]
    );
    await pool.query(`UPDATE payments SET status = 'refunded', razorpay_refund_id = $1 WHERE id = $2`, [
      rz.id,
      payment.id,
    ]);
  } catch (dbErr) {
    console.error(`CRITICAL: Razorpay refund ${rz.id} succeeded but saving it failed (refund row ${refund.id}):`, dbErr);
  }
  await logActivitySafe(pool, {
    actor,
    bookingId: refund.booking_id,
    action: "refund_issued",
    summary: `Refund of ₹${refund.amount} started for booking #${refund.booking_id} (${refund.reason})`,
    meta: { refundId: refund.id, razorpayRefundId: rz.id, amount: Number(refund.amount) },
  });
  return { refunded: true, refundId: rz.id, status, amount: Number(refund.amount) };
}

// Refunds the successful payment of a booking (full amount).
// opts.actor = { id, role } of who triggered it; omit for system-triggered refunds.
export async function refundBookingPayment(bookingId, { reason = "Booking cancelled", actor = null } = {}) {
  const payRes = await pool.query(
    `SELECT * FROM payments WHERE booking_id = $1 AND status = 'success' ORDER BY id DESC LIMIT 1`,
    [bookingId]
  );
  const payment = payRes.rows[0];

  if (!payment) {
    // Nothing left to refund - either never paid, or already refunded.
    const live = await pool.query(
      `SELECT status, amount FROM refunds WHERE booking_id = $1 AND status = ANY($2) ORDER BY id DESC LIMIT 1`,
      [bookingId, LIVE]
    );
    if (live.rows[0]) {
      return { refunded: true, alreadyRefunded: true, status: live.rows[0].status, amount: Number(live.rows[0].amount) };
    }
    return { refunded: false, reason: "No successful payment found for this booking" };
  }

  // Claim. If another request already holds a live refund for this payment, the
  // unique index makes this insert do nothing.
  const claim = await pool.query(
    `INSERT INTO refunds (booking_id, payment_id, amount, reason, initiated_by, initiated_by_role, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'INITIATED')
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [bookingId, payment.id, payment.amount, reason, actor?.id ?? null, actor?.role ?? "system"]
  );
  if (claim.rows.length === 0) {
    return { refunded: true, alreadyInProgress: true };
  }
  return executeRefund(claim.rows[0], payment, actor);
}

// Admin: retry a FAILED refund.
export async function retryFailedRefund(refundId, actor) {
  let claimed;
  try {
    claimed = await pool.query(
      `UPDATE refunds
       SET status = 'INITIATED', failure_reason = NULL, initiated_by = $2, initiated_by_role = $3, updated_at = now()
       WHERE id = $1 AND status = 'FAILED'
       RETURNING *`,
      [refundId, actor?.id ?? null, actor?.role ?? "system"]
    );
  } catch (err) {
    if (err.code === "23505") return { ok: false, status: 409, message: "This payment already has a refund in progress" };
    throw err;
  }
  if (claimed.rows.length === 0) {
    return { ok: false, status: 409, message: "Only a failed refund can be retried" };
  }
  const refund = claimed.rows[0];

  const payRes = await pool.query(`SELECT * FROM payments WHERE id = $1`, [refund.payment_id]);
  const payment = payRes.rows[0];
  if (!payment || payment.status !== "success") {
    await pool.query(
      `UPDATE refunds SET status = 'FAILED', failure_reason = 'Payment is not in a refundable state', updated_at = now() WHERE id = $1`,
      [refund.id]
    );
    return { ok: false, status: 409, message: "This payment is not in a refundable state" };
  }
  const result = await executeRefund(refund, payment, actor);
  return { ok: true, result };
}