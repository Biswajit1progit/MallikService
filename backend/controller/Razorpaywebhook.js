import crypto from "crypto";
import { pool } from "../config/db.js";
import { confirmPaidBooking } from "../utils/Paymentconfirm.js";
import { logActivitySafe } from "../utils/activity.js";

// POST /api/payments/webhook   (called by Razorpay's servers, not by a browser)
//
// Why it exists: the customer's browser is the only other way the site hears about a payment. If
// they pay by UPI and close the app, lose signal or the page crashes, Razorpay HAS the money but the
// site never knew. The webhook closes that gap, and it also reports when a refund really finishes.
//
// Set it up in Razorpay Dashboard > Settings > Webhooks:
//   URL     https://<your-backend>/api/payments/webhook
//   Secret  any long random text, the same value as the RAZORPAY_WEBHOOK_SECRET variable
//   Events  payment.captured, order.paid, payment.failed, refund.processed, refund.failed
//
// The route is mounted with express.raw() (see server.js): the signature is computed over the exact
// bytes Razorpay sent, so the body must not be parsed first.

function signatureOk(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || typeof signature !== "string") return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function razorpayWebhook(req, res) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    console.error("Razorpay webhook called but RAZORPAY_WEBHOOK_SECRET is not set");
    return res.status(500).json({ message: "Webhook not configured" });
  }
  const raw = req.body; // Buffer, thanks to express.raw()
  if (!Buffer.isBuffer(raw) || !signatureOk(raw, req.headers["x-razorpay-signature"])) {
    return res.status(400).json({ message: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Invalid body" });
  }

  try {
    const payment = event?.payload?.payment?.entity;
    const refund = event?.payload?.refund?.entity;

    switch (event.event) {
      case "payment.captured":
      case "order.paid": {
        if (!payment?.order_id || !payment?.id) break;
        const row = (
          await pool.query(`SELECT booking_id, amount FROM payments WHERE razorpay_order_id = $1`, [payment.order_id])
        ).rows[0];
        if (!row) break; // not one of ours
        if (Number(payment.amount) !== Math.round(Number(row.amount) * 100)) {
          await logActivitySafe(pool, {
            bookingId: row.booking_id,
            action: "payment_amount_mismatch",
            summary: `Razorpay reported a payment of ${Number(payment.amount) / 100} for booking #${row.booking_id}, but the booking charge is ₹${row.amount}. Check it in Razorpay.`,
            needsAttention: true,
          });
          break;
        }
        await confirmPaidBooking({ bookingId: row.booking_id, orderId: payment.order_id, paymentId: payment.id });
        break;
      }

      case "payment.failed": {
        // Informational only: the customer may retry the same order and succeed.
        if (payment?.order_id) {
          await pool.query(`UPDATE payments SET status = 'failed' WHERE razorpay_order_id = $1 AND status = 'pending'`, [payment.order_id]);
        }
        break;
      }

      case "refund.processed": {
        if (!refund?.id) break;
        const r = await pool.query(
          `UPDATE refunds SET status = 'PROCESSED', failure_reason = NULL, updated_at = now()
           WHERE razorpay_refund_id = $1 AND status = 'INITIATED'
           RETURNING booking_id, amount`,
          [refund.id]
        );
        // First time only: a repeated delivery finds nothing in INITIATED and stays quiet.
        if (r.rows[0]) {
          await logActivitySafe(pool, {
            bookingId: r.rows[0].booking_id,
            action: "refund_completed",
            summary: `Refund of ₹${r.rows[0].amount} for booking #${r.rows[0].booking_id} was completed by Razorpay`,
            meta: { razorpayRefundId: refund.id, amount: Number(r.rows[0].amount) },
          });
        }
        break;
      }

      case "refund.failed": {
        if (!refund?.id) break;
        const r = await pool.query(
          `UPDATE refunds SET status = 'FAILED', failure_reason = 'Razorpay could not complete this refund', updated_at = now()
           WHERE razorpay_refund_id = $1 AND status IN ('INITIATED', 'PROCESSED')
           RETURNING booking_id, amount, payment_id`,
          [refund.id]
        );
        if (r.rows[0]) {
          // Make the payment refundable again so the admin's Retry button works.
          await pool.query(`UPDATE payments SET status = 'success' WHERE id = $1 AND status = 'refunded'`, [r.rows[0].payment_id]);
          await logActivitySafe(pool, {
            bookingId: r.rows[0].booking_id,
            action: "refund_failed",
            summary: `Refund of ₹${r.rows[0].amount} for booking #${r.rows[0].booking_id} FAILED at Razorpay. Retry it from Refunds.`,
            meta: { razorpayRefundId: refund.id },
            needsAttention: true,
          });
        }
        break;
      }

      default:
        break; // events we don't use
    }
    res.json({ received: true });
  } catch (err) {
    // A non-2xx answer makes Razorpay deliver the event again later, which is what we want for a hiccup.
    console.error("Razorpay webhook error:", err);
    res.status(500).json({ message: "Webhook handling failed" });
  }
}