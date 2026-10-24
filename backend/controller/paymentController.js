/* import crypto from "crypto";
import { pool } from "../config/db.js";
import { razorpay } from "../config/razorpay.js";
import { isTransitionAllowed } from "../utils/bookingStatus.js";

export async function createOrder(req, res) {
  try {
    const customerId = req.user.id;
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ message: "bookingId is required" });
    }

    const bookingResult = await pool.query(
      `SELECT * FROM bookings WHERE id = $1 AND customer_id = $2`,
      [bookingId, customerId]
    );
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const booking = bookingResult.rows[0];

    if (booking.status !== "PENDING") {
      return res.status(422).json({ message: "This booking isn't awaiting payment" });
    }

    // Razorpay wants the amount in paise, as an integer
    const amountInPaise = Math.round(Number(booking.booking_charge) * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `booking_${booking.id}`,
      notes: { bookingId: String(booking.id), customerId: String(customerId) },
    });

    await pool.query(
      `INSERT INTO payments (booking_id, razorpay_order_id, amount, payment_type, status)
       VALUES ($1, $2, $3, 'advance', 'pending')`,
      [booking.id, order.id, booking.booking_charge]
    );

    res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID, // safe to expose - it's the public key
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Couldn't start payment right now" });
  }
}

export async function verifyPayment(req, res) {
  const client = await pool.connect();
  try {
    const customerId = req.user.id;
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment verification details" });
    }

    // HMAC signature check - this is what actually proves the payment is
    // genuine and untampered, not just trusting whatever the frontend sends.
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await client.query(`UPDATE payments SET status = 'failed' WHERE razorpay_order_id = $1`, [
        razorpay_order_id,
      ]);
      return res.status(400).json({ message: "Payment verification failed" });
    }

    // From here on, the signature is genuine - Razorpay really did capture
    // this payment. Everything below has to guarantee that money is never
    // left "orphaned" (captured with no valid booking behind it), even if
    // the 15-minute expiry sweep cancels this exact booking in the race
    // window between the customer paying and this request completing.
    await client.query("BEGIN");

    // Lock the booking row so the expiry sweep (running on its own 5-minute
    // interval) can't cancel it out from under us mid-verification.
    const bookingResult = await client.query(
      `SELECT * FROM bookings WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
      [bookingId, customerId]
    );
    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Booking not found" });
    }
    const booking = bookingResult.rows[0];

    if (!isTransitionAllowed(booking.status, "CONFIRMED")) {
      // The booking is no longer confirmable (most likely: it auto-expired
      // in the race window while this payment was in flight). The payment
      // itself is still genuinely captured on Razorpay's side, so refund it
      // automatically rather than leaving the customer's money stuck with
      // no booking to show for it.
      await client.query(
        `UPDATE payments SET razorpay_payment_id = $1, status = 'success' WHERE razorpay_order_id = $2`,
        [razorpay_payment_id, razorpay_order_id]
      );
      await client.query("COMMIT");

      let refundResult;
      try {
        refundResult = await refundBookingPayment(bookingId);
      } catch (refundErr) {
        console.error(`Auto-refund failed for orphaned payment on booking ${bookingId}:`, refundErr);
        refundResult = { refunded: false };
      }

      return res.status(409).json({
        message: refundResult.refunded
          ? `This booking's slot expired just before your payment completed. Your payment has been automatically refunded.`
          : `This booking's slot expired just before your payment completed. Refund is being processed - contact support if it doesn't appear within a few days.`,
        currentStatus: booking.status,
        autoRefunded: refundResult.refunded,
      });
    }

    await client.query(
      `UPDATE payments SET razorpay_payment_id = $1, status = 'success' WHERE razorpay_order_id = $2`,
      [razorpay_payment_id, razorpay_order_id]
    );

    await client.query(`UPDATE bookings SET status = 'CONFIRMED', updated_at = now() WHERE id = $1`, [
      bookingId,
    ]);

    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note)
       VALUES ($1, 'CONFIRMED', $2, 'Payment verified')`,
      [bookingId, customerId]
    );

    await client.query("COMMIT");

    res.json({ message: "Payment verified, booking confirmed", status: "CONFIRMED" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Verify payment error:", err);
    res.status(500).json({ message: "Couldn't verify this payment right now" });
  } finally {
    client.release();
  }
}

// Called from bookingController.cancelBooking when a refund is owed.
// Kept here since it's Razorpay-specific logic, imported by the booking controller.
export async function refundBookingPayment(bookingId) {
  const paymentResult = await pool.query(
    `SELECT * FROM payments WHERE booking_id = $1 AND status = 'success' ORDER BY id DESC LIMIT 1`,
    [bookingId]
  );
  const payment = paymentResult.rows[0];

  if (!payment) {
    return { refunded: false, reason: "No successful payment found for this booking" };
  }

  const refund = await razorpay.payments.refund(payment.razorpay_payment_id, {
    amount: Math.round(Number(payment.amount) * 100),
  });

  await pool.query(
    `UPDATE payments SET status = 'refunded', razorpay_refund_id = $1 WHERE id = $2`,
    [refund.id, payment.id]
  );

  return { refunded: true, refundId: refund.id };
} */







  import crypto from "crypto";
import { pool } from "../config/db.js";
import { razorpay } from "../config/razorpay.js";
import { isTransitionAllowed } from "../utils/bookingStatus.js";
import { refundBookingPayment } from "../utils/refundService.js";
import { logActivity, logActivitySafe } from "../utils/activity.js";

// Kept so any older import of this name from paymentController still works.
export { refundBookingPayment };

export async function createOrder(req, res) {
  try {
    const customerId = req.user.id;
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ message: "bookingId is required" });
    }

    const bookingResult = await pool.query(
      `SELECT * FROM bookings WHERE id = $1 AND customer_id = $2`,
      [bookingId, customerId]
    );
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const booking = bookingResult.rows[0];

    if (booking.status !== "PENDING") {
      return res.status(422).json({ message: "This booking isn't awaiting payment" });
    }

    // Razorpay wants the amount in paise, as an integer
    const amountInPaise = Math.round(Number(booking.booking_charge) * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `booking_${booking.id}`,
      notes: { bookingId: String(booking.id), customerId: String(customerId) },
    });

    await pool.query(
      `INSERT INTO payments (booking_id, razorpay_order_id, amount, payment_type, status)
       VALUES ($1, $2, $3, 'advance', 'pending')`,
      [booking.id, order.id, booking.booking_charge]
    );

    res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID, // safe to expose - it's the public key
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Couldn't start payment right now" });
  }
}

export async function verifyPayment(req, res) {
  const client = await pool.connect();
  try {
    const customerId = req.user.id;
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment verification details" });
    }

    // HMAC signature check - this is what actually proves the payment is
    // genuine and untampered, not just trusting whatever the frontend sends.
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await client.query(`UPDATE payments SET status = 'failed' WHERE razorpay_order_id = $1`, [
        razorpay_order_id,
      ]);
      return res.status(400).json({ message: "Payment verification failed" });
    }

    // From here on, the signature is genuine - Razorpay really did capture
    // this payment. Everything below has to guarantee that money is never
    // left "orphaned" (captured with no valid booking behind it), even if
    // the 15-minute expiry sweep cancels this exact booking in the race
    // window between the customer paying and this request completing.
    await client.query("BEGIN");

    // Lock the booking row so the expiry sweep (running on its own 5-minute
    // interval) can't cancel it out from under us mid-verification.
    const bookingResult = await client.query(
      `SELECT * FROM bookings WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
      [bookingId, customerId]
    );
    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Booking not found" });
    }
    const booking = bookingResult.rows[0];

    if (!isTransitionAllowed(booking.status, "CONFIRMED")) {
      // The booking is no longer confirmable (most likely: it auto-expired
      // in the race window while this payment was in flight). The payment
      // itself is still genuinely captured on Razorpay's side, so refund it
      // automatically rather than leaving the customer's money stuck with
      // no booking to show for it.
      await client.query(
        `UPDATE payments SET razorpay_payment_id = $1, status = 'success' WHERE razorpay_order_id = $2`,
        [razorpay_payment_id, razorpay_order_id]
      );
      await client.query("COMMIT");

      let refundResult;
      try {
        refundResult = await refundBookingPayment(bookingId, {
          reason: "Slot expired while the payment was in progress",
          actor: { id: customerId, role: "customer" },
        });
      } catch (refundErr) {
        console.error(`Auto-refund failed for orphaned payment on booking ${bookingId}:`, refundErr);
        refundResult = { refunded: false };
      }
      await logActivitySafe(pool, {
        actor: { id: customerId, role: "customer" },
        bookingId: Number(bookingId),
        action: "payment_orphaned",
        summary: `Payment arrived after booking #${bookingId} expired - ${refundResult.refunded ? "auto-refunded" : "REFUND NEEDS ATTENTION"}`,
        needsAttention: !refundResult.refunded,
      });

      return res.status(409).json({
        message: refundResult.refunded
          ? `This booking's slot expired just before your payment completed. Your payment has been automatically refunded.`
          : `This booking's slot expired just before your payment completed. Refund is being processed - contact support if it doesn't appear within a few days.`,
        currentStatus: booking.status,
        autoRefunded: refundResult.refunded,
      });
    }

    await client.query(
      `UPDATE payments SET razorpay_payment_id = $1, status = 'success' WHERE razorpay_order_id = $2`,
      [razorpay_payment_id, razorpay_order_id]
    );

    await client.query(`UPDATE bookings SET status = 'CONFIRMED', updated_at = now() WHERE id = $1`, [
      bookingId,
    ]);

    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note)
       VALUES ($1, 'CONFIRMED', $2, 'Payment verified')`,
      [bookingId, customerId]
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
      actor: { id: customerId, role: "customer" },
      bookingId: Number(bookingId),
      action: "payment_received",
      summary: `New booking #${bookingId}: ${i.customer_name} paid ₹${i.booking_charge} for ${i.service_name} on ${i.slot_date} ${String(i.slot_time).slice(0, 5)}`,
      meta: { amount: Number(i.booking_charge) },
    });

    await client.query("COMMIT");

    res.json({ message: "Payment verified, booking confirmed", status: "CONFIRMED" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Verify payment error:", err);
    res.status(500).json({ message: "Couldn't verify this payment right now" });
  } finally {
    client.release();
  }
}