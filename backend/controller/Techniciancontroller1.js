import bcrypt from "bcrypt";
import { pool } from "../config/db.js";
import { changeBookingStatus } from "../utils/bookingActions.js";
import { getActiveTokenForBooking } from "../utils/trackingToken.js";
import { logActivity, logActivitySafe } from "../utils/activity.js";
import { assertSlotAvailable } from "../utils/slotRules.js";
import { HttpError, sendError } from "../utils/httpError.js";
import { normalizePhone } from "../utils/phone.js";
import { CALL_DUE_FIELDS_SQL } from "../utils/CallDue.js";

const INDIA_TODAY = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;
const WAITING = ["CONFIRMED", "SCHEDULED", "CALL_CONFIRMED", "RESCHEDULE_NEEDED"];
const ON_SITE = ["ON_THE_WAY", "IN_PROGRESS", "PENDING_APPROVAL"];

// ---- Confirmation call rules ------------------------------------------------
// A technician cannot just tap "confirmed". He must start a call (this records the time),
// talk, then record the result. "Confirmed" is refused if the call was shorter than this.
const MIN_CALL_SECONDS = 20;
const CALL_OUTCOMES = {
  CONFIRMED: "customer confirmed the visit",
  NO_ANSWER: "no answer",
  WRONG_NUMBER: "wrong number or phone switched off",
  WANTS_RESCHEDULE: "customer wants another day",
};

// ===========================================================================
// TECHNICIAN endpoints  (/api/technician/...)  - req.technician is set by
// requireTechnician, so a technician can only ever touch their OWN jobs.
// ===========================================================================

// GET /api/technician/me
export async function getMyProfile(req, res) {
  try {
    const t = req.technician;
    const stats = await pool.query(
      `SELECT
         count(*) FILTER (WHERE slot_date = ${INDIA_TODAY} AND status NOT IN ('PENDING','CANCELLED'))::int AS jobs_today,
         count(*) FILTER (WHERE status = ANY($2))::int AS on_site_now,
         count(*) FILTER (WHERE status = 'COMPLETED' AND (updated_at AT TIME ZONE 'Asia/Kolkata')::date = ${INDIA_TODAY})::int AS done_today,
         count(*) FILTER (WHERE status = 'PENDING_APPROVAL')::int AS awaiting_customer
       FROM bookings WHERE technician_id = $1`,
      [t.id, ON_SITE]
    );
    res.json({
      technician: { id: t.id, name: t.name, phone: t.phone, maxBookingsPerDay: t.max_bookings_per_day },
      stats: stats.rows[0],
    });
  } catch (err) {
    sendError(res, err, "Technician profile");
  }
}

const JOB_SELECT = `
  SELECT b.id, b.status, to_char(b.slot_date, 'YYYY-MM-DD') AS slot_date, b.slot_time, b.distance_km,
         b.reschedule_count,
         (b.slot_date < ${INDIA_TODAY} AND b.status = ANY($2)) AS is_overdue,
         s.name AS service_name,
         a.address_text, a.latitude AS address_lat, a.longitude AS address_lng,
         u.name AS customer_name, u.phone AS customer_phone,
         jc.customer_status AS completion_status, jc.customer_note AS completion_note,
         jc.total_amount AS completion_total, jc.amount_due AS completion_amount_due,
         lc.started_at AS last_call_at, lc.outcome AS last_call_outcome,
         floor(extract(epoch FROM (now() - lc.started_at)))::int AS call_open_seconds,
         (SELECT count(*)::int FROM call_logs c WHERE c.booking_id = b.id) AS call_attempts,
         ${CALL_DUE_FIELDS_SQL}
  FROM bookings b
  JOIN services s ON s.id = b.service_id
  JOIN customer_addresses a ON a.id = b.address_id
  JOIN users u ON u.id = b.customer_id
  LEFT JOIN job_completions jc ON jc.booking_id = b.id
  LEFT JOIN LATERAL (
    SELECT started_at, outcome FROM call_logs WHERE booking_id = b.id ORDER BY id DESC LIMIT 1
  ) lc ON true`;

// GET /api/technician/jobs?scope=today|upcoming|history
// Deliberately NOT returned: booking_charge, refund state, payment details.
// A technician needs to know where to go and what to do, not the shop's money.
export async function listMyJobs(req, res) {
  try {
    const scope = ["today", "upcoming", "history"].includes(req.query.scope) ? req.query.scope : "today";
    const techId = req.technician.id;

    let where;
    let order;
    let params = [techId, WAITING];
    if (scope === "today") {
      // today's visits + anything already on site (any date) + visits that were missed
      where = `b.technician_id = $1 AND (
                 (b.slot_date = ${INDIA_TODAY} AND b.status NOT IN ('PENDING','CANCELLED','COMPLETED','NO_SHOW'))
                 OR b.status = ANY($3)
                 OR (b.slot_date < ${INDIA_TODAY} AND b.status = ANY($2))
               )`;
      order = `ORDER BY b.slot_date ASC, b.slot_time ASC`;
      params = [techId, WAITING, ON_SITE];
    } else if (scope === "upcoming") {
      where = `b.technician_id = $1 AND b.slot_date > ${INDIA_TODAY} AND b.status = ANY($2) `;
      order = `ORDER BY b.slot_date ASC, b.slot_time ASC`;
    } else {
      where = `b.technician_id = $1 AND b.status IN ('COMPLETED','CANCELLED','NO_SHOW') `;
      order = `ORDER BY b.updated_at DESC LIMIT 50`;
    }

    const r = await pool.query(`${JOB_SELECT} WHERE ${where} ${order}`, params);

    // Tracking link for jobs currently ON_THE_WAY (so the technician can WhatsApp it)
    const jobs = await Promise.all(
      r.rows.map(async (j) => {
        let trackingUrl = null;
        if (j.status === "ON_THE_WAY") {
          const token = await getActiveTokenForBooking(j.id);
          if (token) trackingUrl = `${process.env.FRONTEND_URL}/track/${token}`;
        }
        return { ...j, trackingUrl };
      })
    );
    res.json({ scope, jobs });
  } catch (err) {
    sendError(res, err, "List technician jobs");
  }
}

// PATCH /api/technician/jobs/:id/status   { status, note? }
export async function updateMyJobStatus(req, res) {
  try {
    const { status, note } = req.body || {};
    if (!status) return res.status(400).json({ message: "New status is required" });
    if (status === "CALL_CONFIRMED") {
      // The only way to confirm is through the call flow below, so the shop can see the call.
      return res.status(409).json({
        message: "Tap Call customer and record the result. A visit can't be confirmed without a call.",
      });
    }
    const result = await changeBookingStatus({
      bookingId: req.params.id,
      newStatus: status,
      actor: { id: req.user.id, role: "technician" },
      note,
      technicianId: req.technician.id,
    });
    res.json({ message: "Status updated", status: result.status, trackingUrl: result.trackingUrl });
  } catch (err) {
    sendError(res, err, "Technician status update");
  }
}

function fmtDuration(sec) {
  if (sec < 60) return `${sec}s`;
  return `${Math.round(sec / 60)} min`;
}

// POST /api/technician/jobs/:id/call/start
// The technician taps "Call customer". We record WHEN, so the shop can see it.
// Calling it again while a call is open just returns the same call (page reloads are safe).
export async function startCall(req, res) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const b = await client.query(
      `SELECT b.id, b.status, u.name AS customer_name, u.phone AS customer_phone, s.name AS service_name
       FROM bookings b JOIN users u ON u.id = b.customer_id JOIN services s ON s.id = b.service_id
       WHERE b.id = $1 AND b.technician_id = $2 FOR UPDATE OF b`,
      [req.params.id, req.technician.id]
    );
    const booking = b.rows[0];
    if (!booking) throw new HttpError(404, "Booking not found");
    if (booking.status !== "SCHEDULED") {
      throw new HttpError(409, "This visit isn't waiting for a confirmation call");
    }

    let call = await client.query(`SELECT id, started_at FROM call_logs WHERE booking_id = $1 AND outcome IS NULL`, [booking.id]);
    if (call.rows.length === 0) {
      call = await client.query(
        `INSERT INTO call_logs (booking_id, technician_id) VALUES ($1, $2) RETURNING id, started_at`,
        [booking.id, req.technician.id]
      );
      await logActivity(client, {
        actor: { id: req.user.id, role: "technician" },
        bookingId: booking.id,
        action: "call_started",
        summary: `Technician started a call to ${booking.customer_name} for #${booking.id} (${booking.service_name})`,
      });
    }
    await client.query("COMMIT");
    res.json({ call: call.rows[0], phone: booking.customer_phone });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendError(res, err, "Start call");
  } finally {
    client.release();
  }
}

// POST /api/technician/jobs/:id/call/outcome   { outcome, note? }
// outcome: CONFIRMED | NO_ANSWER | WRONG_NUMBER | WANTS_RESCHEDULE
// CONFIRMED moves the booking to CALL_CONFIRMED, but only if a call was started and lasted
// at least MIN_CALL_SECONDS.
export async function recordCallOutcome(req, res) {
  try {
    const { outcome, note } = req.body || {};
    if (!CALL_OUTCOMES[outcome]) throw new HttpError(400, "Pick what happened on the call");
    const cleanNote = typeof note === "string" ? note.trim() : "";
    if (cleanNote.length > 300) throw new HttpError(400, "Keep the note under 300 characters");
    if (outcome === "WANTS_RESCHEDULE" && cleanNote.length < 5) {
      throw new HttpError(400, "Write which day or time the customer wants");
    }

    const open = await pool.query(
      `SELECT c.id, floor(extract(epoch FROM (now() - c.started_at)))::int AS elapsed,
              b.status, u.name AS customer_name, s.name AS service_name
       FROM call_logs c
       JOIN bookings b ON b.id = c.booking_id
       JOIN users u ON u.id = b.customer_id
       JOIN services s ON s.id = b.service_id
       WHERE c.booking_id = $1 AND c.technician_id = $2 AND c.outcome IS NULL`,
      [req.params.id, req.technician.id]
    );
    const call = open.rows[0];
    if (!call) throw new HttpError(409, "Tap Call customer first, then record the result");
    if (call.status !== "SCHEDULED") throw new HttpError(409, "This visit isn't waiting for a confirmation call");
    if (outcome === "CONFIRMED" && call.elapsed < MIN_CALL_SECONDS) {
      throw new HttpError(
        409,
        `The call was only ${call.elapsed}s. Talk to the customer first, then confirm (wait ${MIN_CALL_SECONDS - call.elapsed} more seconds at least).`
      );
    }

    // Claim the call. A double tap can't record it twice.
    const claim = await pool.query(
      `UPDATE call_logs SET ended_at = now(), outcome = $2, note = $3
       WHERE id = $1 AND outcome IS NULL RETURNING id`,
      [call.id, outcome, cleanNote || null]
    );
    if (claim.rows.length === 0) throw new HttpError(409, "This call was already recorded");

    let status = call.status;
    if (outcome === "CONFIRMED") {
      try {
        const r = await changeBookingStatus({
          bookingId: req.params.id,
          newStatus: "CALL_CONFIRMED",
          actor: { id: req.user.id, role: "technician" },
          technicianId: req.technician.id,
        });
        status = r.status;
      } catch (err) {
        // The booking moved under us (cancelled, re-assigned...). Reopen the call so nothing is lost.
        await pool.query(`UPDATE call_logs SET ended_at = NULL, outcome = NULL, note = NULL WHERE id = $1`, [call.id]);
        throw err;
      }
    }

    const failed = await pool.query(
      `SELECT count(*)::int AS n FROM call_logs WHERE booking_id = $1 AND outcome IN ('NO_ANSWER', 'WRONG_NUMBER')`,
      [req.params.id]
    );
    const needsAttention =
      outcome === "WRONG_NUMBER" || outcome === "WANTS_RESCHEDULE" || (outcome === "NO_ANSWER" && failed.rows[0].n >= 2);

    await logActivitySafe(pool, {
      actor: { id: req.user.id, role: "technician" },
      bookingId: Number(req.params.id),
      action: "call_result",
      summary:
        `Call to ${call.customer_name} for #${req.params.id} (${call.service_name}): ${CALL_OUTCOMES[outcome]}, ` +
        `call lasted ${fmtDuration(call.elapsed)}` +
        (cleanNote ? `. Note: "${cleanNote}"` : ""),
      meta: { outcome, seconds: call.elapsed, note: cleanNote || null },
      needsAttention,
    });

    res.json({ message: "Saved", outcome, status });
  } catch (err) {
    sendError(res, err, "Record call outcome");
  }
}

const ISSUE_TYPES = {
  CUSTOMER_UNREACHABLE: "customer not reachable",
  ADDRESS_PROBLEM: "can't find the address",
  NEED_PARTS: "needs parts / tools",
  OTHER: "other problem",
};

// POST /api/technician/jobs/:id/issue   { type, note }
// Doesn't change the booking - it puts a flagged item in the admin's "needs attention" list.
export async function reportJobIssue(req, res) {
  try {
    const { type, note } = req.body || {};
    const cleanNote = typeof note === "string" ? note.trim() : "";
    if (!ISSUE_TYPES[type]) return res.status(400).json({ message: "Pick what kind of problem it is" });
    if (cleanNote.length < 5 || cleanNote.length > 500) {
      return res.status(400).json({ message: "Describe the problem (5 to 500 characters)" });
    }

    const r = await pool.query(
      `SELECT b.id, b.status, u.name AS customer_name, s.name AS service_name
       FROM bookings b JOIN users u ON u.id = b.customer_id JOIN services s ON s.id = b.service_id
       WHERE b.id = $1 AND b.technician_id = $2`,
      [req.params.id, req.technician.id]
    );
    const b = r.rows[0];
    if (!b) return res.status(404).json({ message: "Booking not found" });
    if (["CANCELLED", "COMPLETED"].includes(b.status)) {
      return res.status(409).json({ message: "This job is already closed" });
    }

    await logActivity(pool, {
      actor: { id: req.user.id, role: "technician" },
      bookingId: b.id,
      action: "issue_reported",
      summary: `Technician reported a problem on #${b.id} for ${b.customer_name} (${b.service_name}), ${ISSUE_TYPES[type]}: "${cleanNote}"`,
      meta: { type, note: cleanNote },
      needsAttention: true,
    });
    res.status(201).json({ message: "Reported. The admin has been notified." });
  } catch (err) {
    sendError(res, err, "Report job issue");
  }
}

// ===========================================================================
// ADMIN endpoints  (/api/technician/admin/...)
// ===========================================================================

// GET /api/technician/admin/list
export async function adminListTechnicians(req, res) {
  try {
    const r = await pool.query(
      `SELECT t.id, t.name, t.phone, t.is_active, t.max_bookings_per_day, t.user_id, u.email,
         (SELECT count(*)::int FROM bookings b WHERE b.technician_id = t.id AND b.slot_date = ${INDIA_TODAY}
            AND b.status NOT IN ('PENDING','CANCELLED','NO_SHOW')) AS jobs_today,
         (SELECT count(*)::int FROM bookings b WHERE b.technician_id = t.id AND b.status = ANY($1)) AS on_site_now,
         (SELECT count(*)::int FROM bookings b WHERE b.technician_id = t.id AND b.status = 'COMPLETED') AS completed_total,
         (SELECT max(created_at) FROM activity_log a WHERE a.actor_id = t.user_id) AS last_active_at
       FROM technicians t LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.id ASC`,
      [ON_SITE]
    );
    res.json({ technicians: r.rows });
  } catch (err) {
    sendError(res, err, "Admin list technicians");
  }
}

// POST /api/technician/admin   { name, email, phone, password, technicianId?, maxBookingsPerDay? }
// Creates a technician LOGIN. With technicianId, attaches the login to an existing
// technician row (e.g. your seeded "Default Technician"); without it, creates a new technician.
export async function adminCreateTechnician(req, res) {
  const client = await pool.connect();
  try {
    const { name, email, phone, password, technicianId, maxBookingsPerDay } = req.body || {};
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanPhone = normalizePhone(phone);
    if (cleanName.length < 2) throw new HttpError(400, "Enter the technician's name");
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new HttpError(400, "Enter a valid email");
    if (!cleanPhone) throw new HttpError(400, "Enter a valid 10-digit mobile number");
    if (typeof password !== "string" || password.length < 8) {
      throw new HttpError(400, "Password must be at least 8 characters");
    }
    const maxPerDay = maxBookingsPerDay === undefined ? 5 : Number(maxBookingsPerDay);
    if (!Number.isInteger(maxPerDay) || maxPerDay < 1 || maxPerDay > 30) {
      throw new HttpError(400, "Daily job limit must be a whole number from 1 to 30");
    }

    await client.query("BEGIN");

    if ((await client.query(`SELECT 1 FROM users WHERE email = $1`, [cleanEmail])).rows.length) {
      throw new HttpError(409, "This email is already registered");
    }
    if ((await client.query(`SELECT 1 FROM users WHERE phone = $1`, [cleanPhone])).rows.length) {
      throw new HttpError(409, "This mobile number is already registered");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const u = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, auth_provider, role)
       VALUES ($1, $2, $3, $4, 'local', 'technician') RETURNING id`,
      [cleanName, cleanEmail, cleanPhone, passwordHash]
    );
    const userId = u.rows[0].id;

    let techRow;
    if (technicianId !== undefined && technicianId !== null && technicianId !== "") {
      const existing = await client.query(`SELECT id, user_id FROM technicians WHERE id = $1 FOR UPDATE`, [technicianId]);
      if (existing.rows.length === 0) throw new HttpError(404, "Technician not found");
      if (existing.rows[0].user_id) throw new HttpError(409, "This technician already has a login");
      techRow = (
        await client.query(
          `UPDATE technicians SET user_id = $1, name = $2, phone = $3 WHERE id = $4 RETURNING id`,
          [userId, cleanName, cleanPhone, technicianId]
        )
      ).rows[0];
    } else {
      techRow = (
        await client.query(
          `INSERT INTO technicians (user_id, name, phone, max_bookings_per_day) VALUES ($1, $2, $3, $4) RETURNING id`,
          [userId, cleanName, cleanPhone, maxPerDay]
        )
      ).rows[0];
    }

    await logActivity(client, {
      actor: { id: req.user.id, role: "admin" },
      action: "technician_created",
      summary: `Admin created a technician login for ${cleanName}`,
      meta: { technicianId: techRow.id },
    });
    await client.query("COMMIT");
    res.status(201).json({ technicianId: techRow.id, userId, message: "Technician login created" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendError(res, err, "Create technician");
  } finally {
    client.release();
  }
}

// PATCH /api/technician/admin/:id   { isActive?, maxBookingsPerDay? }
export async function adminUpdateTechnician(req, res) {
  try {
    const { isActive, maxBookingsPerDay } = req.body || {};
    const sets = [];
    const params = [];
    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") throw new HttpError(400, "isActive must be true or false");
      params.push(isActive);
      sets.push(`is_active = $${params.length}`);
    }
    if (maxBookingsPerDay !== undefined) {
      const n = Number(maxBookingsPerDay);
      if (!Number.isInteger(n) || n < 1 || n > 30) throw new HttpError(400, "Daily job limit must be 1 to 30");
      params.push(n);
      sets.push(`max_bookings_per_day = $${params.length}`);
    }
    if (sets.length === 0) throw new HttpError(400, "Nothing to update");

    params.push(req.params.id);
    const r = await pool.query(
      `UPDATE technicians SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id, name, user_id, is_active, max_bookings_per_day`,
      params
    );
    const t = r.rows[0];
    if (!t) throw new HttpError(404, "Technician not found");

    // Switching a technician off also blocks their login.
    if (isActive !== undefined && t.user_id) {
      await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [isActive, t.user_id]);
      if (!isActive) await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [t.user_id]);
    }
    await logActivitySafe(pool, {
      actor: { id: req.user.id, role: "admin" },
      action: "technician_updated",
      summary: `Admin updated technician ${t.name}${isActive !== undefined ? (isActive ? " (switched on)" : " (switched off)") : ""}`,
      meta: { isActive, maxBookingsPerDay },
    });
    res.json({ technician: t });
  } catch (err) {
    sendError(res, err, "Update technician");
  }
}

// PATCH /api/technician/admin/bookings/:id/assign   { technicianId }
// Moves a booking to another technician. Allowed until the technician is on the way.
export async function adminAssignBooking(req, res) {
  const client = await pool.connect();
  try {
    const technicianId = Number(req.body?.technicianId);
    if (!Number.isInteger(technicianId)) throw new HttpError(400, "Pick a technician");

    await client.query("BEGIN");
    const b = await client.query(
      `SELECT b.id, b.status, b.technician_id, to_char(b.slot_date,'YYYY-MM-DD') AS slot_date, b.slot_time,
              u.name AS customer_name
       FROM bookings b JOIN users u ON u.id = b.customer_id WHERE b.id = $1 FOR UPDATE OF b`,
      [req.params.id]
    );
    const booking = b.rows[0];
    if (!booking) throw new HttpError(404, "Booking not found");
    if (!["PENDING", ...WAITING].includes(booking.status)) {
      throw new HttpError(409, "This job has already started or is closed, so it can't be re-assigned");
    }
    if (booking.technician_id === technicianId) throw new HttpError(409, "Already assigned to this technician");

    const t = await client.query(`SELECT id, name, is_active FROM technicians WHERE id = $1`, [technicianId]);
    if (t.rows.length === 0) throw new HttpError(404, "Technician not found");
    if (!t.rows[0].is_active) throw new HttpError(409, "This technician is switched off");

    await assertSlotAvailable(client, {
      technicianId,
      slotDate: booking.slot_date,
      slotTime: booking.slot_time,
      excludeBookingId: booking.id,
    });

    await client.query(`UPDATE bookings SET technician_id = $1, updated_at = now() WHERE id = $2`, [technicianId, booking.id]);
    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note) VALUES ($1, $2, $3, $4)`,
      [booking.id, booking.status, req.user.id, `Assigned to ${t.rows[0].name}`]
    );
    await logActivity(client, {
      actor: { id: req.user.id, role: "admin" },
      bookingId: booking.id,
      action: "assigned",
      summary: `Admin assigned #${booking.id} (${booking.customer_name}) to ${t.rows[0].name}`,
      meta: { from: booking.technician_id, to: technicianId },
    });
    await client.query("COMMIT");
    res.json({ message: `Assigned to ${t.rows[0].name}` });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendError(res, err, "Assign booking");
  } finally {
    client.release();
  }
}