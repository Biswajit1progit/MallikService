import { pool } from "../config/db.js";
import { createNotification } from "./notify.js";
import { CALL_DUE_AT_SQL } from "./CallDue.js";

// ---------------------------------------------------------------------------
// Time-based alerts. Runs every 5 minutes (server.js). Everything is idempotent:
// each reminder has a dedupe key, so running the job twice, or after a restart, never repeats one.
// All clock rules use India time.
//
//   Customer   6 PM the day before   "Visit tomorrow at ..."
//   Customer   ~3 hours before       "Visit in about 3 hours"
//   Technician ~3 hours before       "Visit today at ..."
//   Technician 8 AM                  "You have N visits today"
//   Technician 30 min before the call-confirmation deadline   "Call <customer> now"
//   Customer   3 h and 24 h after the report is sent          "Please approve the work"
//
// `at` lets tests pretend it is another time. Production passes nothing.
// ---------------------------------------------------------------------------

export async function sendVisitReminders(at = null) {
  let made = 0;
  const add = async (args) => { if (await createNotification(pool, args)) made++; };
  try {
    const NOW = `COALESCE($1::timestamptz, now())`;

    // ---- visit reminders (customer + technician) ----
    const visits = await pool.query(
      `SELECT b.id, b.status, b.customer_id, t.user_id AS tech_user_id,
              s.name AS service_name, cu.name AS customer_name,
              b.slot_date::text AS slot_date, to_char(b.slot_date, 'DD Mon') AS slot_day,
              to_char(b.slot_time, 'HH24:MI') AS slot_hm,
              (b.slot_date - (${NOW} AT TIME ZONE 'Asia/Kolkata')::date) AS days_ahead,
              EXTRACT(HOUR FROM (${NOW} AT TIME ZONE 'Asia/Kolkata'))::int AS ist_hour,
              EXTRACT(EPOCH FROM (((b.slot_date + b.slot_time) AT TIME ZONE 'Asia/Kolkata') - ${NOW})) AS secs_to_visit,
              (b.created_at <= ${NOW} - interval '30 minutes') AS booked_earlier
       FROM bookings b
       JOIN users cu ON cu.id = b.customer_id
       JOIN services s ON s.id = b.service_id
       LEFT JOIN technicians t ON t.id = b.technician_id
       WHERE b.status IN ('CONFIRMED','SCHEDULED','CALL_CONFIRMED')
         AND b.slot_date BETWEEN (${NOW} AT TIME ZONE 'Asia/Kolkata')::date AND (${NOW} AT TIME ZONE 'Asia/Kolkata')::date + 1`,
      [at]
    );
    for (const v of visits.rows) {
      const key = `${v.id}:${v.slot_date}:${v.slot_hm}`; // a rescheduled visit gets fresh reminders
      if (v.days_ahead === 1 && v.ist_hour >= 18 && v.booked_earlier) {
        await add({ userId: v.customer_id, bookingId: v.id, kind: "reminder", title: "Visit tomorrow",
          body: `Our technician visits tomorrow at ${v.slot_hm} for your ${v.service_name}. Keep your phone nearby, he will call to confirm.`,
          url: "/bookings", dedupeKey: `rem-day:${key}` });
      }
      const secs = Number(v.secs_to_visit);
      if (secs > 0 && secs <= 3 * 3600 && v.booked_earlier) {
        await add({ userId: v.customer_id, bookingId: v.id, kind: "reminder", title: "Visit in about 3 hours",
          body: `Your ${v.service_name} visit is today at ${v.slot_hm}. Please be at the address.`,
          url: "/bookings", dedupeKey: `rem-3h:c:${key}` });
        if (v.tech_user_id && v.status !== "CONFIRMED") {
          await add({ userId: v.tech_user_id, bookingId: v.id, kind: "reminder", title: `Visit today at ${v.slot_hm}`,
            body: `${v.customer_name}, ${v.service_name}.`, url: "/technician", dedupeKey: `rem-3h:t:${key}` });
        }
      }
    }

    // ---- technician morning summary ----
    const morning = await pool.query(
      `SELECT t.user_id, count(*)::int AS n, to_char(min(b.slot_time), 'HH24:MI') AS first_hm,
              (${NOW} AT TIME ZONE 'Asia/Kolkata')::date::text AS today
       FROM bookings b JOIN technicians t ON t.id = b.technician_id
       WHERE b.status IN ('SCHEDULED','CALL_CONFIRMED')
         AND b.slot_date = (${NOW} AT TIME ZONE 'Asia/Kolkata')::date
         AND EXTRACT(HOUR FROM (${NOW} AT TIME ZONE 'Asia/Kolkata')) BETWEEN 8 AND 19
         AND t.user_id IS NOT NULL
       GROUP BY t.user_id`,
      [at]
    );
    for (const m of morning.rows) {
      await add({ userId: m.user_id, kind: "reminder", title: `${m.n} visit${m.n > 1 ? "s" : ""} today`,
        body: `Your first visit is at ${m.first_hm}.`, url: "/technician", dedupeKey: `tech-day:${m.user_id}:${m.today}` });
    }

    // ---- technician: confirmation call is almost due ----
    const calls = await pool.query(
      `SELECT * FROM (
         SELECT b.id, t.user_id AS tech_user_id, cu.name AS customer_name,
                to_char(b.slot_date, 'DD Mon') AS slot_day, to_char(b.slot_time, 'HH24:MI') AS slot_hm,
                ${CALL_DUE_AT_SQL} AS due_at
         FROM bookings b
         JOIN users cu ON cu.id = b.customer_id
         JOIN technicians t ON t.id = b.technician_id
         WHERE b.status = 'SCHEDULED' AND t.user_id IS NOT NULL
       ) x
       WHERE ${NOW} >= x.due_at - interval '30 minutes' AND ${NOW} < x.due_at + interval '3 hours'`,
      [at]
    );
    for (const c of calls.rows) {
      await add({ userId: c.tech_user_id, bookingId: c.id, kind: "reminder", title: `Call ${c.customer_name} now`,
        body: `Confirm the ${c.slot_day} ${c.slot_hm} visit by phone.`, url: "/technician",
        dedupeKey: `rem-call:${c.id}:${Math.floor(new Date(c.due_at).getTime() / 1000)}` });
    }

    // ---- customer: please approve the finished work ----
    const approvals = await pool.query(
      `SELECT * FROM (
         SELECT b.id, b.customer_id, s.name AS service_name,
                (SELECT max(h.changed_at) FROM booking_status_history h WHERE h.booking_id = b.id AND h.status = 'PENDING_APPROVAL') AS sent_at
         FROM bookings b JOIN services s ON s.id = b.service_id
         WHERE b.status = 'PENDING_APPROVAL'
       ) x WHERE x.sent_at IS NOT NULL AND ${NOW} - x.sent_at >= interval '3 hours'`,
      [at]
    );
    for (const a of approvals.rows) {
      const stage2 = (await pool.query(`SELECT ${NOW} - $2::timestamptz >= interval '24 hours' AS late`, [at, a.sent_at])).rows[0].late;
      const stamp = Math.floor(new Date(a.sent_at).getTime() / 1000);
      await add({ userId: a.customer_id, bookingId: a.id, kind: "approval", title: stage2 ? "Still waiting for your approval" : "Please approve the work",
        body: `Review the ${a.service_name} report so we can close the job and start your warranty.`, url: "/bookings",
        dedupeKey: `rem-approve:${a.id}:${stamp}:${stage2 ? 2 : 1}` });
      if (stage2) {
        // the first (3 hour) reminder may have been missed if the server was down: make sure it exists too
        await add({ userId: a.customer_id, bookingId: a.id, kind: "approval", title: "Please approve the work",
          body: `Review the ${a.service_name} report so we can close the job and start your warranty.`, url: "/bookings",
          dedupeKey: `rem-approve:${a.id}:${stamp}:1` });
      }
    }

    // keep the table small: alerts older than 90 days go
    await pool.query(`DELETE FROM notifications WHERE created_at < now() - interval '90 days'`);
  } catch (err) {
    console.error("sendVisitReminders error:", err.message);
  }
  return made;
}