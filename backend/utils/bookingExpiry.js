import { pool } from "../config/db.js";

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
}