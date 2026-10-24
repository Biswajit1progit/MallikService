import { pool } from "../config/db.js";
import { logActivitySafe } from "./activity.js";

// ---------------------------------------------------------------------------
// WHEN must the technician have confirmed the visit by phone?
//
//   Normal booking (made earlier than the visit day):  by 6:00 PM the day before the visit.
//   Same-day booking (made on the day of the visit):    by 3 hours before the visit.
//
// Two safety nets so the rule never produces a false alarm:
//   - never earlier than 1 hour after the admin scheduled the visit (he can't call before that)
//   - never later than the visit time itself
//
// All times are India time. The SQL below expects the bookings table to be aliased `b`.
// It is used by the admin list, the technician list, the overview tile and the alert job,
// so they can never disagree.
// ---------------------------------------------------------------------------
export const CALL_DUE_AT_SQL = `
  LEAST(
    GREATEST(
      CASE WHEN (b.created_at AT TIME ZONE 'Asia/Kolkata')::date = b.slot_date
           THEN ((b.slot_date + b.slot_time) AT TIME ZONE 'Asia/Kolkata') - interval '3 hours'
           ELSE (((b.slot_date - 1) + time '18:00') AT TIME ZONE 'Asia/Kolkata')
      END,
      COALESCE(
        (SELECT max(h.changed_at) FROM booking_status_history h WHERE h.booking_id = b.id AND h.status = 'SCHEDULED'),
        b.created_at
      ) + interval '1 hour'
    ),
    (b.slot_date + b.slot_time) AT TIME ZONE 'Asia/Kolkata'
  )`;

// Two columns to add to a SELECT: when the call is due, and whether that time has passed.
// Only visits still waiting for their confirmation call (SCHEDULED) have a due time.
export const CALL_DUE_FIELDS_SQL = `
  CASE WHEN b.status = 'SCHEDULED' THEN ${CALL_DUE_AT_SQL} END AS call_due_at,
  (b.status = 'SCHEDULED' AND now() > ${CALL_DUE_AT_SQL}) AS call_overdue`;

// Runs every few minutes (see server.js). For every visit whose call is overdue it writes ONE
// red "needs attention" line to the admin feed. It won't repeat for the same scheduling:
// if the visit is rescheduled and goes overdue again, it alerts again.
export async function flagOverdueCalls() {
  try {
    const r = await pool.query(
      `SELECT b.id, u.name AS customer_name, s.name AS service_name, t.name AS technician_name,
              to_char(b.slot_date, 'DD Mon') AS slot_day, to_char(b.slot_time, 'HH24:MI') AS slot_hm
       FROM bookings b
       JOIN users u ON u.id = b.customer_id
       JOIN services s ON s.id = b.service_id
       LEFT JOIN technicians t ON t.id = b.technician_id
       WHERE b.status = 'SCHEDULED'
         AND now() > ${CALL_DUE_AT_SQL}
         AND NOT EXISTS (
           SELECT 1 FROM activity_log a
           WHERE a.booking_id = b.id AND a.action = 'call_overdue'
             AND a.created_at >= COALESCE(
               (SELECT max(h.changed_at) FROM booking_status_history h WHERE h.booking_id = b.id AND h.status = 'SCHEDULED'),
               b.created_at)
         )`
    );
    for (const b of r.rows) {
      await logActivitySafe(pool, {
        bookingId: b.id,
        action: "call_overdue",
        summary: `Call overdue: ${b.technician_name || "no technician"} hasn't confirmed #${b.id} (${b.service_name}) with ${b.customer_name} yet. Visit is ${b.slot_day} at ${b.slot_hm}`,
        needsAttention: true,
      });
    }
    return r.rows.length;
  } catch (err) {
    console.error("flagOverdueCalls error:", err.message);
    return 0;
  }
}