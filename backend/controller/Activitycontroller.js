import { pool } from "../config/db.js";
import { sendError, HttpError } from "../utils/httpError.js";
import { CALL_DUE_AT_SQL } from "../utils/CallDue.js";

const ROLES = ["customer", "technician", "admin", "system"];

// GET /api/activity/admin?limit=40&before=<id>&role=technician&attention=1&bookingId=12
// Newest first. Pass the returned `nextBefore` as `before` to load older items.
export async function adminListActivity(req, res) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);
    const conditions = [];
    const params = [];

    if (req.query.before) {
      const before = parseInt(req.query.before, 10);
      if (!Number.isInteger(before)) throw new HttpError(400, "Invalid 'before'");
      params.push(before);
      conditions.push(`a.id < $${params.length}`);
    }
    if (req.query.role) {
      if (!ROLES.includes(req.query.role)) throw new HttpError(400, "Invalid role filter");
      params.push(req.query.role);
      conditions.push(`a.actor_role = $${params.length}`);
    }
    if (req.query.attention === "1") {
      conditions.push(`a.needs_attention AND a.acknowledged_at IS NULL`);
    }
    if (req.query.bookingId) {
      const bid = parseInt(req.query.bookingId, 10);
      if (!Number.isInteger(bid)) throw new HttpError(400, "Invalid bookingId");
      params.push(bid);
      conditions.push(`a.booking_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(limit + 1); // one extra row tells us whether there is another page
    const r = await pool.query(
      `SELECT a.id, a.actor_id, a.actor_role, a.actor_name, a.booking_id, a.action, a.summary, a.meta,
              a.needs_attention, a.acknowledged_at, a.created_at
       FROM activity_log a ${where}
       ORDER BY a.id DESC LIMIT $${params.length}`,
      params
    );
    const rows = r.rows;
    const hasMore = rows.length > limit;
    const activities = hasMore ? rows.slice(0, limit) : rows;

    const count = await pool.query(
      `SELECT count(*)::int AS n FROM activity_log WHERE needs_attention AND acknowledged_at IS NULL`
    );
    res.json({
      activities,
      nextBefore: hasMore ? activities[activities.length - 1].id : null,
      attentionCount: count.rows[0].n,
    });
  } catch (err) {
    sendError(res, err, "Admin activity list");
  }
}

// POST /api/activity/admin/:id/ack   - "I've seen / handled this"
export async function adminAcknowledge(req, res) {
  try {
    const r = await pool.query(
      `UPDATE activity_log SET acknowledged_at = now(), acknowledged_by = $2
       WHERE id = $1 AND needs_attention AND acknowledged_at IS NULL RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (r.rows.length === 0) throw new HttpError(404, "Nothing to acknowledge");
    res.json({ message: "Acknowledged" });
  } catch (err) {
    sendError(res, err, "Acknowledge activity");
  }
}

// POST /api/activity/admin/ack-all
export async function adminAcknowledgeAll(req, res) {
  try {
    const r = await pool.query(
      `UPDATE activity_log SET acknowledged_at = now(), acknowledged_by = $1
       WHERE needs_attention AND acknowledged_at IS NULL`,
      [req.user.id]
    );
    res.json({ message: "All acknowledged", count: r.rowCount });
  } catch (err) {
    sendError(res, err, "Acknowledge all");
  }
}

// GET /api/activity/admin/overview - the numbers on the admin's top tiles
export async function adminOverview(req, res) {
  try {
    const r = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM bookings b JOIN job_completions jc ON jc.booking_id = b.id
            WHERE b.status = 'PENDING_APPROVAL' AND jc.customer_status = 'PENDING') AS awaiting_customer,
         (SELECT count(*)::int FROM bookings b JOIN job_completions jc ON jc.booking_id = b.id
            WHERE b.status = 'PENDING_APPROVAL' AND jc.customer_status = 'DISPUTED') AS disputed,
         (SELECT count(*)::int FROM refunds WHERE status = 'FAILED') AS failed_refunds,
         (SELECT count(*)::int FROM activity_log WHERE needs_attention AND acknowledged_at IS NULL) AS attention,
         (SELECT count(*)::int FROM bookings
            WHERE technician_id IS NULL AND status NOT IN ('PENDING','CANCELLED','COMPLETED','NO_SHOW')) AS unassigned,
         (SELECT count(*)::int FROM bookings b WHERE b.status = 'SCHEDULED' AND now() > ${CALL_DUE_AT_SQL}) AS calls_overdue`
    );
    res.json({ overview: r.rows[0] });
  } catch (err) {
    sendError(res, err, "Admin overview");
  }
}