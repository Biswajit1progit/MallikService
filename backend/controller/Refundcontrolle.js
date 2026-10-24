import { pool } from "../config/db.js";
import { refundBookingPayment, retryFailedRefund } from "../utils/refundService.js";
import { sendError, HttpError } from "../utils/httpError.js";

// GET /api/refunds/admin?status=FAILED
export async function adminListRefunds(req, res) {
  try {
    const params = [];
    let where = "";
    if (req.query.status) {
      if (!["INITIATED", "PROCESSED", "FAILED"].includes(req.query.status)) {
        throw new HttpError(400, "Invalid status filter");
      }
      params.push(req.query.status);
      where = `WHERE r.status = $1`;
    }
    const result = await pool.query(
      `SELECT r.id, r.booking_id, r.amount, r.reason, r.status, r.failure_reason, r.initiated_by_role,
              r.razorpay_refund_id, r.created_at, r.updated_at,
              u.name AS customer_name, u.phone AS customer_phone, s.name AS service_name
       FROM refunds r
       JOIN bookings b ON b.id = r.booking_id
       JOIN users u ON u.id = b.customer_id
       JOIN services s ON s.id = b.service_id
       ${where}
       ORDER BY r.id DESC LIMIT 100`,
      params
    );
    res.json({ refunds: result.rows });
  } catch (err) {
    sendError(res, err, "Admin list refunds");
  }
}

// POST /api/refunds/admin/:id/retry
export async function adminRetryRefund(req, res) {
  try {
    const out = await retryFailedRefund(req.params.id, { id: req.user.id, role: "admin" });
    if (!out.ok) return res.status(out.status).json({ message: out.message });
    if (out.result.refunded) return res.json({ message: "Refund started", refund: out.result });
    res.status(502).json({ message: "Razorpay rejected it again. See the reason on the refund.", refund: out.result });
  } catch (err) {
    sendError(res, err, "Retry refund");
  }
}

// POST /api/refunds/admin/booking/:bookingId   { reason }
// Goodwill refund of the booking charge that is still unrefunded (e.g. after a complaint).
export async function adminManualRefund(req, res) {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 300) {
      throw new HttpError(400, "Write the reason for this refund (5 to 300 characters)");
    }
    const b = await pool.query(`SELECT id FROM bookings WHERE id = $1`, [req.params.bookingId]);
    if (b.rows.length === 0) throw new HttpError(404, "Booking not found");

    const out = await refundBookingPayment(b.rows[0].id, {
      reason: `Goodwill refund by admin: ${reason}`,
      actor: { id: req.user.id, role: "admin" },
    });
    if (out.alreadyRefunded || out.alreadyInProgress) {
      throw new HttpError(409, "This booking's payment is already refunded");
    }
    if (!out.refunded && !out.failed) throw new HttpError(409, out.reason || "Nothing to refund");
    if (out.failed) return res.status(502).json({ message: out.reason, refund: out });
    res.status(201).json({ message: "Refund started", refund: out });
  } catch (err) {
    sendError(res, err, "Manual refund");
  }
}