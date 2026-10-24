import { pool } from "../config/db.js";
import { buildInvoice } from "../utils/Invoiceservice.js";
import { logActivitySafe } from "../utils/activity.js";
import { sendError, HttpError } from "../utils/httpError.js";

// GET /api/invoices/booking/:bookingId/:kind   (kind = receipt | final)
// The owner of the booking, or an admin.
export async function getInvoice(req, res) {
  try {
    const bookingId = Number(req.params.bookingId);
    if (!Number.isInteger(bookingId) || bookingId < 1) throw new HttpError(400, "Invalid booking");
    const kind = String(req.params.kind || "").toUpperCase();
    res.json({ invoice: await buildInvoice(bookingId, kind, req.user) });
  } catch (err) {
    sendError(res, err, "Get invoice");
  }
}

// POST /api/invoices/admin/booking/:bookingId/collected   { mode: "CASH" | "UPI" }
// For jobs the technician left as "PENDING": admin records that the money has now arrived.
export async function adminMarkCollected(req, res) {
  try {
    const bookingId = Number(req.params.bookingId);
    const mode = req.body?.mode;
    if (!Number.isInteger(bookingId) || bookingId < 1) throw new HttpError(400, "Invalid booking");
    if (!["CASH", "UPI"].includes(mode)) throw new HttpError(400, "Choose CASH or UPI");
    const r = await pool.query(
      `UPDATE job_completions c SET payment_mode = $2, collected_at = now(), collected_by = $3, updated_at = now()
       FROM bookings b
       WHERE c.booking_id = b.id AND b.id = $1 AND b.status = 'COMPLETED' AND c.payment_mode = 'PENDING'
       RETURNING c.amount_due`,
      [bookingId, mode, req.user.id]
    );
    if (!r.rows[0]) throw new HttpError(409, "Only a completed job that is still unpaid can be marked as collected");
    await logActivitySafe(pool, {
      actor: { id: req.user.id, role: "admin" },
      bookingId,
      action: "payment_collected",
      summary: `Admin recorded ₹${r.rows[0].amount_due} collected by ${mode} for booking #${bookingId}`,
      meta: { mode },
    });
    res.json({ message: "Recorded as collected", mode });
  } catch (err) {
    sendError(res, err, "Mark collected");
  }
}