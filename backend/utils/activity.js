import { pool } from "../config/db.js";
import { notifyForEntry } from "./notify.js";

// Writes one row to the activity log - the admin's "everything that happened" feed.
//
//   actor        { id, role } of whoever did it. Omit for system events (auto-expiry...).
//   bookingId    which booking it is about (optional)
//   action       short machine name, e.g. "status_changed"
//   summary      the sentence the admin reads
//   needsAttention  true = shows up in the admin's "needs attention" list until acknowledged
//
// `db` can be the pool or a transaction client. Pass the client when you are inside
// a transaction so the log row commits (or rolls back) together with the change itself.
export async function logActivity(db, { actor = null, bookingId = null, action, summary, meta = {}, needsAttention = false }) {
  const actorId = actor?.id ?? null;
  const role = actor?.role ?? "system";
  await db.query(
    `INSERT INTO activity_log (actor_id, actor_role, actor_name, booking_id, action, summary, meta, needs_attention)
     VALUES ($1::int, $2, (SELECT name FROM users WHERE id = $1::int), $3, $4, $5, $6::jsonb, $7)`,
    [actorId, role, bookingId, action, summary, JSON.stringify(meta), needsAttention]
  );
  // Tell the right people (bell + phone). Never throws, and rolls back with the event if the event rolls back.
  await notifyForEntry(db, { actor, bookingId, action, summary, meta, needsAttention });
}

// Same thing, but never throws. Use it OUTSIDE transactions: a failed log line
// must never break the real action (cancelling, refunding, ...).
export async function logActivitySafe(db, entry) {
  try {
    await logActivity(db || pool, entry);
  } catch (err) {
    console.error("Activity log failed:", err.message);
  }
}