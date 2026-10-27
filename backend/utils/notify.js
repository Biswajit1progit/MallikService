/* import { pool } from "../config/db.js";

// ---------------------------------------------------------------------------
// Turns "something happened" into notifications for the right people.
//
// It plugs into the activity log (utils/activity.js): every real event in the system
// already writes one activity row, so this file only has to answer
// "who should be told about it, and in what words?".
//
// Rows are written with the SAME database client as the event itself. If the event
// rolls back, the notification rolls back with it, so nobody is told about something
// that never happened. Sending to phones happens later (pushDelivery.js).
// ---------------------------------------------------------------------------

export async function createNotification(db, { userId, bookingId = null, kind, title, body, url = null, dedupeKey = null }) {
  const r = await db.query(
    `INSERT INTO notifications (user_id, booking_id, kind, title, body, url, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [userId, bookingId, kind, String(title).slice(0, 120), String(body).slice(0, 400), url, dedupeKey]
  );
  return r.rows[0]?.id ?? null;
}

async function adminIds(db) {
  const r = await db.query(`SELECT id FROM users WHERE role = 'admin' AND is_active IS NOT FALSE`);
  return r.rows.map((x) => x.id);
}

async function loadBooking(db, bookingId) {
  const r = await db.query(
    `SELECT b.id, b.customer_id, t.user_id AS technician_user_id,
            s.name AS service_name, cu.name AS customer_name,
            to_char(b.slot_date, 'DD Mon') AS slot_day, to_char(b.slot_time, 'HH24:MI') AS slot_hm
     FROM bookings b
     JOIN users cu ON cu.id = b.customer_id
     JOIN services s ON s.id = b.service_id
     LEFT JOIN technicians t ON t.id = b.technician_id
     WHERE b.id = $1`,
    [bookingId]
  );
  return r.rows[0] || null;
}

const URL_FOR = { customer: "/bookings", technician: "/technician", admin: "/admin" };
const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

// Who gets what. Each item: { to: "customer" | "technician" | "admin", kind, title, body, self? }
// `self: true` means the person who did the action should still get it (e.g. the customer's own payment receipt).
export function planMessages(entry, b) {
  const { action, meta = {}, summary } = entry;
  const job = b ? `${b.service_name}` : "your booking";
  const when = b ? `${b.slot_day} at ${b.slot_hm}` : "";
  const out = [];
  const add = (to, kind, title, body, extra = {}) => out.push({ to, kind, title, body, ...extra });

  switch (action) {
    case "payment_received":
      add("customer", "booking", "Booking received", `We got your ${money(meta.amount ?? 0)} payment. Booking #${b?.id} is placed. We'll confirm your visit time shortly.`, { self: true });
      add("admin", "booking", `New booking #${b?.id}`, summary);
      break;

    case "status_changed": {
      switch (meta.to) {
        case "CONFIRMED":
          add("customer", "booking", "Booking confirmed", `Your ${job} booking #${b?.id} is confirmed.`);
          break;
        case "SCHEDULED":
          add("customer", "visit", "Visit scheduled", `Your ${job} visit is set for ${when}. Our technician will call you to confirm.`);
          add("technician", "visit", "New visit assigned", `${b?.customer_name}, ${job}, ${when}. Call the customer to confirm.`);
          break;
        case "CALL_CONFIRMED":
          add("customer", "visit", "Visit confirmed", `Our technician confirmed your ${job} visit on ${when}.`);
          break;
        case "ON_THE_WAY":
          add("customer", "visit", "Technician is on the way", "Open My bookings to see him live on the map.");
          break;
        case "IN_PROGRESS":
          add("customer", "visit", "Technician has arrived", `Work on your ${job} has started.`);
          break;
        case "NO_SHOW":
          add("customer", "visit", "We missed you", "Our technician couldn't meet you at the visit. Please contact us to book a new time.");
          break;
        case "CANCELLED":
          add("customer", "booking", "Booking cancelled", `Your ${job} booking #${b?.id} was cancelled by the shop. Your booking charge will be refunded.`);
          add("technician", "visit", "Visit cancelled", `${b?.customer_name}, ${when} is cancelled.`);
          break;
        case "RESCHEDULE_NEEDED":
          add("customer", "visit", "We need to reschedule", "We'll contact you with a new time for your visit.");
          add("admin", "visit", `Reschedule needed #${b?.id}`, summary);
          break;
      }
      break;
    }

    case "booking_cancelled":
      add("admin", "booking", `Customer cancelled #${b?.id}`, summary);
      add("technician", "visit", "Visit cancelled", `${b?.customer_name}, ${when} was cancelled by the customer.`);
      break;

    case "rescheduled":
      add("customer", "visit", "Visit rescheduled", `Your ${job} visit is now on ${meta.slotDate ? `${b.slot_day} at ${b.slot_hm}` : when}.`);
      add("technician", "visit", "Visit rescheduled", `${b?.customer_name} is now on ${when}.`);
      add("admin", "visit", `Rescheduled #${b?.id}`, summary);
      break;

    case "assigned":
      add("technician", "visit", "New job assigned", `${b?.customer_name}, ${job}, ${when}.`);
      break;

    case "completion_submitted":
    case "completion_resubmitted":
      add("customer", "approval", "Please approve the work", `Your ${job} job is done. Review the report and approve it. Total ${money(meta.totalAmount ?? 0)}.`);
      break;

    case "completion_approved":
      add("technician", "job", "Work approved", `${b?.customer_name} approved the ${job} job.`);
      add("admin", "job", `Job #${b?.id} completed`, summary);
      break;

    case "completion_approved_by_admin":
      add("customer", "job", "Job completed", `Your ${job} job is closed and your warranty has started. Your invoice is in My bookings.`);
      add("technician", "job", "Work approved", `The ${job} job for ${b?.customer_name} was approved.`);
      break;

    case "completion_disputed":
      add("technician", "alert", "Customer raised an issue", `${b?.customer_name} has a question on the ${job} job. The shop will contact you.`);
      break;

    case "refund_issued":
      add("customer", "refund", "Refund started", `${money(meta.amount ?? 0)} is on its way back to you. It can take 5 to 7 working days to show in your account.`, { self: true });
      break;

    case "payment_collected":
      add("customer", "payment", "Payment received", `We received your payment for the ${job} job. Your receipt is in My bookings.`);
      break;
  }
  return out;
}

export async function notifyFromActivity(db, entry) {
  const { bookingId, actor, needsAttention, summary } = entry;
  if (!bookingId && !needsAttention) return 0;

  const b = bookingId ? await loadBooking(db, bookingId) : null;
  let plan = b ? planMessages(entry, b) : [];

  // Anything flagged "needs attention" also reaches every admin, unless they already got a specific message.
  if (needsAttention && !plan.some((m) => m.to === "admin")) {
    plan.push({ to: "admin", kind: "alert", title: "Needs attention", body: summary });
  }
  if (!plan.length) return 0;

  const admins = plan.some((m) => m.to === "admin") ? await adminIds(db) : [];
  const actorId = actor?.id ?? null;
  const sent = new Set(); // one notification per person per event
  let n = 0;
  for (const m of plan) {
    const ids =
      m.to === "customer" ? [b?.customer_id]
      : m.to === "technician" ? [b?.technician_user_id]
      : admins;
    for (const userId of ids) {
      if (!userId || sent.has(userId)) continue;
      if (userId === actorId && !m.self) continue; // don't tell people about what they just did
      sent.add(userId);
      const role = m.to;
      const id = await createNotification(db, {
        userId,
        bookingId: bookingId ?? null,
        kind: m.kind,
        title: m.title,
        body: m.body,
        url: URL_FOR[role],
      });
      if (id) n++;
    }
  }
  return n;
}

// Called by activity.js. Must NEVER break the real action:
//  - inside a transaction it uses a SAVEPOINT, so a failed notification insert (or a missing
//    table before the migration is run) is rolled back on its own and the booking change still commits.
export async function notifyForEntry(db, entry) {
  const inTxn = db !== pool;
  try {
    if (inTxn) await db.query("SAVEPOINT notify_sp");
    await notifyFromActivity(db, entry);
    if (inTxn) await db.query("RELEASE SAVEPOINT notify_sp");
  } catch (err) {
    console.error("Notification failed:", err.message);
    if (inTxn) await db.query("ROLLBACK TO SAVEPOINT notify_sp").catch(() => {});
  }
} */




  import { pool } from "../config/db.js";

// ---------------------------------------------------------------------------
// Turns "something happened" into notifications for the right people.
//
// It plugs into the activity log (utils/activity.js): every real event in the system
// already writes one activity row, so this file only has to answer
// "who should be told about it, and in what words?".
//
// Rows are written with the SAME database client as the event itself. If the event
// rolls back, the notification rolls back with it, so nobody is told about something
// that never happened. Sending to phones happens later (pushDelivery.js).
// ---------------------------------------------------------------------------

export async function createNotification(db, { userId, bookingId = null, kind, title, body, url = null, dedupeKey = null }) {
  const r = await db.query(
    `INSERT INTO notifications (user_id, booking_id, kind, title, body, url, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [userId, bookingId, kind, String(title).slice(0, 120), String(body).slice(0, 400), url, dedupeKey]
  );
  return r.rows[0]?.id ?? null;
}

async function adminIds(db) {
  const r = await db.query(`SELECT id FROM users WHERE role = 'admin' AND is_active IS NOT FALSE`);
  return r.rows.map((x) => x.id);
}

async function loadBooking(db, bookingId) {
  const r = await db.query(
    `SELECT b.id, b.customer_id, t.user_id AS technician_user_id,
            s.name AS service_name, cu.name AS customer_name,
            to_char(b.slot_date, 'DD Mon') AS slot_day, to_char(b.slot_time, 'HH24:MI') AS slot_hm
     FROM bookings b
     JOIN users cu ON cu.id = b.customer_id
     JOIN services s ON s.id = b.service_id
     LEFT JOIN technicians t ON t.id = b.technician_id
     WHERE b.id = $1`,
    [bookingId]
  );
  return r.rows[0] || null;
}

const URL_FOR = { customer: "/bookings", technician: "/technician", admin: "/admin" };
const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

// Who gets what. Each item: { to: "customer" | "technician" | "admin", kind, title, body, self? }
// `self: true` means the person who did the action should still get it (e.g. the customer's own payment receipt).
export function planMessages(entry, b) {
  const { action, meta = {}, summary } = entry;
  const job = b ? `${b.service_name}` : "your booking";
  const when = b ? `${b.slot_day} at ${b.slot_hm}` : "";
  const out = [];
  const add = (to, kind, title, body, extra = {}) => out.push({ to, kind, title, body, ...extra });

  switch (action) {
    case "payment_received":
      add("customer", "booking", "Booking received", `We got your ${money(meta.amount ?? 0)} payment. Booking #${b?.id} is placed. We'll confirm your visit time shortly.`, { self: true });
      add("admin", "booking", `New booking #${b?.id}`, summary);
      break;

    case "status_changed": {
      switch (meta.to) {
        case "CONFIRMED":
          add("customer", "booking", "Booking confirmed", `Your ${job} booking #${b?.id} is confirmed.`);
          break;
        case "SCHEDULED":
          add("customer", "visit", "Visit scheduled", `Your ${job} visit is set for ${when}. Our technician will call you to confirm.`);
          add("technician", "visit", "New visit assigned", `${b?.customer_name}, ${job}, ${when}. Call the customer to confirm.`);
          break;
        case "CALL_CONFIRMED":
          add("customer", "visit", "Visit confirmed", `Our technician confirmed your ${job} visit on ${when}.`);
          break;
        case "ON_THE_WAY":
          add("customer", "visit", "Technician is on the way", "Open My bookings to see him live on the map.");
          break;
        case "IN_PROGRESS":
          add("customer", "visit", "Technician has arrived", `Work on your ${job} has started.`);
          break;
        case "NO_SHOW":
          add("customer", "visit", "We missed you", "Our technician couldn't meet you at the visit. Please contact us to book a new time.");
          break;
        case "CANCELLED":
          add("customer", "booking", "Booking cancelled", `Your ${job} booking #${b?.id} was cancelled by the shop. Your booking charge will be refunded.`);
          add("technician", "visit", "Visit cancelled", `${b?.customer_name}, ${when} is cancelled.`);
          break;
        case "RESCHEDULE_NEEDED":
          add("customer", "visit", "We need to reschedule", "We'll contact you with a new time for your visit.");
          add("admin", "visit", `Reschedule needed #${b?.id}`, summary);
          break;
      }
      break;
    }

    case "booking_cancelled":
      add("admin", "booking", `Customer cancelled #${b?.id}`, summary);
      add("technician", "visit", "Visit cancelled", `${b?.customer_name}, ${when} was cancelled by the customer.`);
      break;

    case "rescheduled":
      add("customer", "visit", "Visit rescheduled", `Your ${job} visit is now on ${meta.slotDate ? `${b.slot_day} at ${b.slot_hm}` : when}.`);
      add("technician", "visit", "Visit rescheduled", `${b?.customer_name} is now on ${when}.`);
      add("admin", "visit", `Rescheduled #${b?.id}`, summary);
      break;

    case "assigned":
      add("technician", "visit", "New job assigned", `${b?.customer_name}, ${job}, ${when}.`);
      break;

    case "completion_submitted":
    case "completion_resubmitted":
      add("customer", "approval", "Please approve the work", `Your ${job} job is done. Review the report and approve it. Total ${money(meta.totalAmount ?? 0)}.`);
      break;

    case "completion_approved":
      add("technician", "job", "Work approved", `${b?.customer_name} approved the ${job} job.`);
      add("admin", "job", `Job #${b?.id} completed`, summary);
      break;

    case "completion_approved_by_admin":
      add("customer", "job", "Job completed", `Your ${job} job is closed and your warranty has started. Your invoice is in My bookings.`);
      add("technician", "job", "Work approved", `The ${job} job for ${b?.customer_name} was approved.`);
      break;

    case "completion_disputed":
      add("technician", "alert", "Customer raised an issue", `${b?.customer_name} has a question on the ${job} job. The shop will contact you.`);
      break;

    case "refund_issued":
      add("customer", "refund", "Refund started", `${money(meta.amount ?? 0)} is on its way back to you. It can take 5 to 7 working days to show in your account.`, { self: true });
      break;

    case "refund_completed":
      add("customer", "refund", "Refund completed", `${money(meta.amount ?? 0)} has been sent back to you. Your bank may take a few more days to show it.`, { self: true });
      break;

    case "payment_collected":
      add("customer", "payment", "Payment received", `We received your payment for the ${job} job. Your receipt is in My bookings.`);
      break;
  }
  return out;
}

export async function notifyFromActivity(db, entry) {
  const { bookingId, actor, needsAttention, summary } = entry;
  if (!bookingId && !needsAttention) return 0;

  const b = bookingId ? await loadBooking(db, bookingId) : null;
  let plan = b ? planMessages(entry, b) : [];

  // Anything flagged "needs attention" also reaches every admin, unless they already got a specific message.
  if (needsAttention && !plan.some((m) => m.to === "admin")) {
    plan.push({ to: "admin", kind: "alert", title: "Needs attention", body: summary });
  }
  if (!plan.length) return 0;

  const admins = plan.some((m) => m.to === "admin") ? await adminIds(db) : [];
  const actorId = actor?.id ?? null;
  const sent = new Set(); // one notification per person per event
  let n = 0;
  for (const m of plan) {
    const ids =
      m.to === "customer" ? [b?.customer_id]
      : m.to === "technician" ? [b?.technician_user_id]
      : admins;
    for (const userId of ids) {
      if (!userId || sent.has(userId)) continue;
      if (userId === actorId && !m.self) continue; // don't tell people about what they just did
      sent.add(userId);
      const role = m.to;
      const id = await createNotification(db, {
        userId,
        bookingId: bookingId ?? null,
        kind: m.kind,
        title: m.title,
        body: m.body,
        url: URL_FOR[role],
      });
      if (id) n++;
    }
  }
  return n;
}

// Called by activity.js. Must NEVER break the real action:
//  - inside a transaction it uses a SAVEPOINT, so a failed notification insert (or a missing
//    table before the migration is run) is rolled back on its own and the booking change still commits.
export async function notifyForEntry(db, entry) {
  const inTxn = db !== pool;
  try {
    if (inTxn) await db.query("SAVEPOINT notify_sp");
    await notifyFromActivity(db, entry);
    if (inTxn) await db.query("RELEASE SAVEPOINT notify_sp");
  } catch (err) {
    console.error("Notification failed:", err.message);
    if (inTxn) await db.query("ROLLBACK TO SAVEPOINT notify_sp").catch(() => {});
  }
}

