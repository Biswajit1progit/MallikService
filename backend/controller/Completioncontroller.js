/* import { pool } from "../config/db.js";

// ---------------------------------------------------------------------------
// Business settings - change here, nowhere else.
// ---------------------------------------------------------------------------
// false: the prepaid booking (visit) charge is a separate visit fee, the customer
//        pays the full job total on site.
// true:  the booking charge is credited against the job total.
const DEDUCT_BOOKING_CHARGE = false;

const MAX_PARTS = 30;
const MAX_PHOTOS = 8;
const PHOTO_URL_PREFIX = "https://res.cloudinary.com/";
const PAYMENT_MODES = ["CASH", "UPI", "PENDING"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Validation: never trust the client. Totals are recomputed on the server.
// ---------------------------------------------------------------------------
function validateCompletionInput(body, bookingCharge) {
  const { workSummary, parts, labourCharge, paymentMode, photos } = body || {};

  const summary = typeof workSummary === "string" ? workSummary.trim() : "";
  if (summary.length < 5 || summary.length > 2000) {
    throw new HttpError(400, "Describe the work done (5 to 2000 characters)");
  }

  const rawParts = Array.isArray(parts) ? parts : [];
  if (rawParts.length > MAX_PARTS) throw new HttpError(400, `At most ${MAX_PARTS} parts allowed`);
  const cleanParts = rawParts.map((p, i) => {
    const name = typeof p?.name === "string" ? p.name.trim() : "";
    const qty = Number(p?.qty);
    const unitPrice = Number(p?.unit_price);
    if (!name || name.length > 120) throw new HttpError(400, `Part ${i + 1}: name is required`);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      throw new HttpError(400, `Part ${i + 1}: quantity must be a whole number from 1 to 999`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000) {
      throw new HttpError(400, `Part ${i + 1}: price must be a valid amount`);
    }
    return { name, qty, unit_price: round2(unitPrice) };
  });

  const labour = Number(labourCharge ?? 0);
  if (!Number.isFinite(labour) || labour < 0 || labour > 1000000) {
    throw new HttpError(400, "Labour charge must be a valid amount");
  }

  const mode = paymentMode || "PENDING";
  if (!PAYMENT_MODES.includes(mode)) throw new HttpError(400, "Invalid payment mode");

  const rawPhotos = Array.isArray(photos) ? photos : [];
  if (rawPhotos.length > MAX_PHOTOS) throw new HttpError(400, `At most ${MAX_PHOTOS} photos allowed`);
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const allowedPrefix = cloud ? `${PHOTO_URL_PREFIX}${cloud}/` : PHOTO_URL_PREFIX;
  const cleanPhotos = rawPhotos.map((p) => {
    const url = typeof p?.url === "string" ? p.url : "";
    const label = p?.label === "before" ? "before" : "after";
    if (!url.startsWith(allowedPrefix)) throw new HttpError(400, "Photos must be uploaded through the app");
    return { url, label };
  });
  if (!cleanPhotos.some((p) => p.label === "after")) {
    throw new HttpError(400, "Add at least one 'after' photo of the finished work");
  }

  const partsTotal = round2(cleanParts.reduce((sum, p) => sum + p.qty * p.unit_price, 0));
  const totalAmount = round2(partsTotal + labour);
  const credit = DEDUCT_BOOKING_CHARGE ? Number(bookingCharge) : 0;
  const amountDue = Math.max(0, round2(totalAmount - credit));

  return {
    summary,
    parts: cleanParts,
    labour: round2(labour),
    partsTotal,
    totalAmount,
    amountDue,
    mode,
    photos: cleanPhotos,
  };
}

// Runs fn inside a transaction; maps HttpError to a clean response.
async function withTransaction(res, label, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof HttpError) {
      res.status(err.status).json({ message: err.message });
    } else {
      console.error(`${label} error:`, err);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
    return undefined;
  } finally {
    client.release();
  }
}

async function lockBooking(client, bookingId) {
  const r = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [bookingId]);
  if (r.rows.length === 0) throw new HttpError(404, "Booking not found");
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// 1. Admin/technician submits the on-site completion report
// ---------------------------------------------------------------------------
export async function submitCompletion(req, res) {
  const result = await withTransaction(res, "Submit completion", async (client) => {
    const booking = await lockBooking(client, req.params.id);
    const data = validateCompletionInput(req.body, booking.booking_charge);

    const existing = await client.query(
      `SELECT id, customer_status FROM job_completions WHERE booking_id = $1`,
      [booking.id]
    );
    const current = existing.rows[0];

    let note;
    if (booking.status === "IN_PROGRESS" && !current) {
      await client.query(
        `INSERT INTO job_completions
           (booking_id, submitted_by, work_summary, parts, labour_charge, parts_total,
            total_amount, amount_due, payment_mode, photos)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          booking.id, req.user.id, data.summary, JSON.stringify(data.parts), data.labour,
          data.partsTotal, data.totalAmount, data.amountDue, data.mode, JSON.stringify(data.photos),
        ]
      );
      note = "Completion report submitted";
    } else if (booking.status === "PENDING_APPROVAL" && current?.customer_status === "DISPUTED") {
      // Customer raised an issue earlier - admin fixes the report and resubmits it.
      await client.query(
        `UPDATE job_completions
         SET submitted_by = $2, work_summary = $3, parts = $4::jsonb, labour_charge = $5,
             parts_total = $6, total_amount = $7, amount_due = $8, payment_mode = $9,
             photos = $10::jsonb, customer_status = 'PENDING', customer_note = NULL,
             responded_at = NULL, updated_at = now()
         WHERE booking_id = $1`,
        [
          booking.id, req.user.id, data.summary, JSON.stringify(data.parts), data.labour,
          data.partsTotal, data.totalAmount, data.amountDue, data.mode, JSON.stringify(data.photos),
        ]
      );
      note = "Completion report corrected and resubmitted";
    } else {
      throw new HttpError(
        409,
        booking.status === "PENDING_APPROVAL"
          ? "This report is already waiting for the customer's approval"
          : `A completion report can't be submitted while the booking is ${booking.status}`
      );
    }

    await client.query(
      `UPDATE bookings SET status = 'PENDING_APPROVAL', final_price = $2, updated_at = now() WHERE id = $1`,
      [booking.id, data.totalAmount]
    );
    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note) VALUES ($1, 'PENDING_APPROVAL', $2, $3)`,
      [booking.id, req.user.id, note]
    );

    return { status: "PENDING_APPROVAL", totalAmount: data.totalAmount, amountDue: data.amountDue };
  });

  if (result) res.status(201).json(result);
}

// ---------------------------------------------------------------------------
// 2. Read the report (customer who owns the booking, or admin)
// ---------------------------------------------------------------------------
export async function getCompletionForBooking(req, res) {
  try {
    const { id } = req.params;
    const b = await pool.query(
      `SELECT b.id, b.status, b.customer_id, b.booking_charge, b.slot_date, s.name AS service_name
       FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.id = $1`,
      [id]
    );
    const booking = b.rows[0];
    if (!booking || (req.user.role !== "admin" && booking.customer_id !== req.user.id)) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const c = await pool.query(`SELECT * FROM job_completions WHERE booking_id = $1`, [id]);
    if (c.rows.length === 0) {
      return res.status(404).json({ message: "No completion report for this booking yet" });
    }

    const w = await pool.query(
      `SELECT id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(expires_on, 'YYYY-MM-DD') AS expires_on,
              (expires_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS active
       FROM warranties WHERE booking_id = $1`,
      [id]
    );

    res.json({
      booking: {
        id: booking.id,
        status: booking.status,
        serviceName: booking.service_name,
        bookingCharge: booking.booking_charge,
        slotDate: booking.slot_date,
      },
      completion: c.rows[0],
      warranty: w.rows[0] || null,
    });
  } catch (err) {
    console.error("Get completion error:", err);
    res.status(500).json({ message: "Couldn't load the job report right now" });
  }
}

// ---------------------------------------------------------------------------
// 3. Approval -> COMPLETED + warranty record. Shared by the customer and by
//    admin ("approve on the customer's behalf", e.g. approved verbally).
// ---------------------------------------------------------------------------
async function finalizeApproval(client, bookingId, actingUserId, byAdmin) {
  const booking = await lockBooking(client, bookingId);
  if (booking.status !== "PENDING_APPROVAL") {
    throw new HttpError(409, "This job isn't waiting for approval");
  }
  const c = await client.query(`SELECT * FROM job_completions WHERE booking_id = $1`, [booking.id]);
  const completion = c.rows[0];
  if (!completion) throw new HttpError(409, "No completion report to approve yet");
  if (completion.customer_status !== "PENDING") {
    throw new HttpError(
      409,
      completion.customer_status === "DISPUTED"
        ? "An issue was raised - the report must be corrected and resubmitted first"
        : "This report was already approved"
    );
  }

  await client.query(
    `UPDATE job_completions SET customer_status = 'APPROVED', responded_at = now(),
            approved_by_admin = $2, updated_at = now() WHERE id = $1`,
    [completion.id, byAdmin]
  );
  await client.query(`UPDATE bookings SET status = 'COMPLETED', updated_at = now() WHERE id = $1`, [booking.id]);
  await client.query(
    `INSERT INTO booking_status_history (booking_id, status, changed_by, note) VALUES ($1, 'COMPLETED', $2, $3)`,
    [booking.id, actingUserId, byAdmin ? "Approved by admin on the customer's behalf" : "Approved by customer"]
  );

  // Warranty starts the day the customer approves the work (India date).
  const svc = await client.query(`SELECT warranty_days FROM services WHERE id = $1`, [booking.service_id]);
  const days = svc.rows[0]?.warranty_days || 0;
  let warranty = null;
  if (days > 0) {
    const w = await client.query(
      `INSERT INTO warranties (booking_id, completion_id, customer_id, service_id, starts_on, expires_on)
       VALUES ($1, $2, $3, $4, (now() AT TIME ZONE 'Asia/Kolkata')::date,
               (now() AT TIME ZONE 'Asia/Kolkata')::date + $5::int)
       ON CONFLICT (booking_id) DO NOTHING
       RETURNING id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(expires_on, 'YYYY-MM-DD') AS expires_on`,
      [booking.id, completion.id, booking.customer_id, booking.service_id, days]
    );
    warranty = w.rows[0] || null;
  }
  return { status: "COMPLETED", warranty };
}

export async function approveCompletion(req, res) {
  const result = await withTransaction(res, "Approve completion", async (client) => {
    const own = await client.query(`SELECT customer_id FROM bookings WHERE id = $1`, [req.params.id]);
    if (!own.rows[0] || own.rows[0].customer_id !== req.user.id) {
      throw new HttpError(404, "Booking not found");
    }
    return finalizeApproval(client, req.params.id, req.user.id, false);
  });
  if (result) res.json(result);
}

export async function adminApproveCompletion(req, res) {
  const result = await withTransaction(res, "Admin approve completion", (client) =>
    finalizeApproval(client, req.params.id, req.user.id, true)
  );
  if (result) res.json(result);
}

// ---------------------------------------------------------------------------
// 4. Customer raises an issue - booking stays PENDING_APPROVAL, report becomes
//    DISPUTED until admin corrects and resubmits it.
// ---------------------------------------------------------------------------
export async function disputeCompletion(req, res) {
  const result = await withTransaction(res, "Dispute completion", async (client) => {
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (note.length < 5 || note.length > 500) {
      throw new HttpError(400, "Please describe the issue (5 to 500 characters)");
    }

    const booking = await lockBooking(client, req.params.id);
    if (booking.customer_id !== req.user.id) throw new HttpError(404, "Booking not found");
    if (booking.status !== "PENDING_APPROVAL") throw new HttpError(409, "This job isn't waiting for approval");

    const upd = await client.query(
      `UPDATE job_completions SET customer_status = 'DISPUTED', customer_note = $2,
              responded_at = now(), updated_at = now()
       WHERE booking_id = $1 AND customer_status = 'PENDING' RETURNING id`,
      [booking.id, note]
    );
    if (upd.rows.length === 0) throw new HttpError(409, "This report can't be disputed right now");

    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note) VALUES ($1, 'PENDING_APPROVAL', $2, $3)`,
      [booking.id, req.user.id, `Customer raised an issue: ${note}`]
    );
    return { status: "DISPUTED" };
  });
  if (result) res.json(result);
}

// ---------------------------------------------------------------------------
// 5. Warranties
// ---------------------------------------------------------------------------
const WARRANTY_SELECT = `
  SELECT w.id, w.booking_id, s.name AS service_name,
         to_char(w.starts_on, 'YYYY-MM-DD') AS starts_on,
         to_char(w.expires_on, 'YYYY-MM-DD') AS expires_on,
         (w.expires_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS active,
         u.name AS customer_name, u.phone AS customer_phone,
         jc.work_summary, jc.parts
  FROM warranties w
  JOIN services s ON s.id = w.service_id
  JOIN users u ON u.id = w.customer_id
  JOIN job_completions jc ON jc.id = w.completion_id`;

export async function listMyWarranties(req, res) {
  try {
    const r = await pool.query(`${WARRANTY_SELECT} WHERE w.customer_id = $1 ORDER BY w.expires_on DESC`, [
      req.user.id,
    ]);
    res.json({ warranties: r.rows });
  } catch (err) {
    console.error("List warranties error:", err);
    res.status(500).json({ message: "Couldn't load your warranties right now" });
  }
}

// Admin: look up a customer's warranties by phone number (warranty claim call).
export async function adminLookupWarranties(req, res) {
  try {
    const digits = String(req.query.phone || "").replace(/\D/g, "").slice(-10);
    if (digits.length < 6) {
      return res.status(400).json({ message: "Enter at least 6 digits of the phone number" });
    }
    const r = await pool.query(`${WARRANTY_SELECT} WHERE u.phone LIKE $1 ORDER BY w.expires_on DESC LIMIT 50`, [
      `%${digits}`,
    ]);
    res.json({ warranties: r.rows });
  } catch (err) {
    console.error("Warranty lookup error:", err);
    res.status(500).json({ message: "Couldn't look up warranties right now" });
  }
} */



  import { pool } from "../config/db.js";
import { logActivity } from "../utils/activity.js";
import { getTechnicianForUser } from "../utils/technicianContext.js";
import { DEDUCT_BOOKING_CHARGE } from "../utils/policy.js"; // business setting lives in utils/policy.js

const MAX_PARTS = 30;
const MAX_PHOTOS = 8;
const PHOTO_URL_PREFIX = "https://res.cloudinary.com/";
const PAYMENT_MODES = ["CASH", "UPI", "PENDING"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Validation: never trust the client. Totals are recomputed on the server.
// ---------------------------------------------------------------------------
function validateCompletionInput(body, bookingCharge) {
  const { workSummary, parts, labourCharge, paymentMode, photos } = body || {};

  const summary = typeof workSummary === "string" ? workSummary.trim() : "";
  if (summary.length < 5 || summary.length > 2000) {
    throw new HttpError(400, "Describe the work done (5 to 2000 characters)");
  }

  const rawParts = Array.isArray(parts) ? parts : [];
  if (rawParts.length > MAX_PARTS) throw new HttpError(400, `At most ${MAX_PARTS} parts allowed`);
  const cleanParts = rawParts.map((p, i) => {
    const name = typeof p?.name === "string" ? p.name.trim() : "";
    const qty = Number(p?.qty);
    const unitPrice = Number(p?.unit_price);
    if (!name || name.length > 120) throw new HttpError(400, `Part ${i + 1}: name is required`);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      throw new HttpError(400, `Part ${i + 1}: quantity must be a whole number from 1 to 999`);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000) {
      throw new HttpError(400, `Part ${i + 1}: price must be a valid amount`);
    }
    return { name, qty, unit_price: round2(unitPrice) };
  });

  const labour = Number(labourCharge ?? 0);
  if (!Number.isFinite(labour) || labour < 0 || labour > 1000000) {
    throw new HttpError(400, "Labour charge must be a valid amount");
  }

  const mode = paymentMode || "PENDING";
  if (!PAYMENT_MODES.includes(mode)) throw new HttpError(400, "Invalid payment mode");

  const rawPhotos = Array.isArray(photos) ? photos : [];
  if (rawPhotos.length > MAX_PHOTOS) throw new HttpError(400, `At most ${MAX_PHOTOS} photos allowed`);
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const allowedPrefix = cloud ? `${PHOTO_URL_PREFIX}${cloud}/` : PHOTO_URL_PREFIX;
  const cleanPhotos = rawPhotos.map((p) => {
    const url = typeof p?.url === "string" ? p.url : "";
    const label = p?.label === "before" ? "before" : "after";
    if (!url.startsWith(allowedPrefix)) throw new HttpError(400, "Photos must be uploaded through the app");
    return { url, label };
  });
  if (!cleanPhotos.some((p) => p.label === "after")) {
    throw new HttpError(400, "Add at least one 'after' photo of the finished work");
  }

  const partsTotal = round2(cleanParts.reduce((sum, p) => sum + p.qty * p.unit_price, 0));
  const totalAmount = round2(partsTotal + labour);
  const credit = DEDUCT_BOOKING_CHARGE ? Number(bookingCharge) : 0;
  const amountDue = Math.max(0, round2(totalAmount - credit));

  return {
    summary,
    parts: cleanParts,
    labour: round2(labour),
    partsTotal,
    totalAmount,
    amountDue,
    mode,
    photos: cleanPhotos,
  };
}

// Runs fn inside a transaction; maps HttpError to a clean response.
async function withTransaction(res, label, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof HttpError) {
      res.status(err.status).json({ message: err.message });
    } else {
      console.error(`${label} error:`, err);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
    return undefined;
  } finally {
    client.release();
  }
}

async function lockBooking(client, bookingId) {
  const r = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [bookingId]);
  if (r.rows.length === 0) throw new HttpError(404, "Booking not found");
  return r.rows[0];
}

// "#15 (AC Installation) for Ravi" - used in activity sentences
async function jobLabel(client, booking) {
  const r = await client.query(
    `SELECT u.name AS customer_name, s.name AS service_name
     FROM users u, services s WHERE u.id = $1 AND s.id = $2`,
    [booking.customer_id, booking.service_id]
  );
  const x = r.rows[0] || {};
  return { text: `#${booking.id} (${x.service_name}) for ${x.customer_name}`, customerName: x.customer_name };
}

// A technician may only touch bookings assigned to THEM. Admin may touch any.
async function assertCanSubmit(client, booking, user) {
  if (user.role === "admin") return;
  const tech = await getTechnicianForUser(client, user.id);
  if (!tech || !tech.is_active || booking.technician_id !== tech.id) {
    throw new HttpError(404, "Booking not found");
  }
}

// ---------------------------------------------------------------------------
// 1. Admin/technician submits the on-site completion report
// ---------------------------------------------------------------------------
export async function submitCompletion(req, res) {
  const result = await withTransaction(res, "Submit completion", async (client) => {
    const booking = await lockBooking(client, req.params.id);
    await assertCanSubmit(client, booking, req.user);
    const data = validateCompletionInput(req.body, booking.booking_charge);

    const existing = await client.query(
      `SELECT id, customer_status FROM job_completions WHERE booking_id = $1`,
      [booking.id]
    );
    const current = existing.rows[0];

    let note;
    if (booking.status === "IN_PROGRESS" && !current) {
      await client.query(
        `INSERT INTO job_completions
           (booking_id, submitted_by, work_summary, parts, labour_charge, parts_total,
            total_amount, amount_due, payment_mode, photos)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          booking.id, req.user.id, data.summary, JSON.stringify(data.parts), data.labour,
          data.partsTotal, data.totalAmount, data.amountDue, data.mode, JSON.stringify(data.photos),
        ]
      );
      note = "Completion report submitted";
    } else if (booking.status === "PENDING_APPROVAL" && current?.customer_status === "DISPUTED") {
      // Customer raised an issue earlier - admin fixes the report and resubmits it.
      await client.query(
        `UPDATE job_completions
         SET submitted_by = $2, work_summary = $3, parts = $4::jsonb, labour_charge = $5,
             parts_total = $6, total_amount = $7, amount_due = $8, payment_mode = $9,
             photos = $10::jsonb, customer_status = 'PENDING', customer_note = NULL,
             responded_at = NULL, updated_at = now()
         WHERE booking_id = $1`,
        [
          booking.id, req.user.id, data.summary, JSON.stringify(data.parts), data.labour,
          data.partsTotal, data.totalAmount, data.amountDue, data.mode, JSON.stringify(data.photos),
        ]
      );
      note = "Completion report corrected and resubmitted";
    } else {
      throw new HttpError(
        409,
        booking.status === "PENDING_APPROVAL"
          ? "This report is already waiting for the customer's approval"
          : `A completion report can't be submitted while the booking is ${booking.status}`
      );
    }

    await client.query(
      `UPDATE bookings SET status = 'PENDING_APPROVAL', final_price = $2, updated_at = now() WHERE id = $1`,
      [booking.id, data.totalAmount]
    );
    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note) VALUES ($1, 'PENDING_APPROVAL', $2, $3)`,
      [booking.id, req.user.id, note]
    );

    const label = await jobLabel(client, booking);
    await logActivity(client, {
      actor: { id: req.user.id, role: req.user.role },
      bookingId: booking.id,
      action: current ? "completion_resubmitted" : "completion_submitted",
      summary: `${req.user.role === "admin" ? "Admin" : "Technician"} ${current ? "corrected and resubmitted" : "submitted"} the job report for ${label.text}: total ₹${data.totalAmount}, ${data.parts.length} part(s), ${data.photos.length} photo(s)`,
      meta: { totalAmount: data.totalAmount, amountDue: data.amountDue, paymentMode: data.mode },
    });

    return { status: "PENDING_APPROVAL", totalAmount: data.totalAmount, amountDue: data.amountDue };
  });

  if (result) res.status(201).json(result);
}

// ---------------------------------------------------------------------------
// 2. Read the report (customer who owns the booking, or admin)
// ---------------------------------------------------------------------------
export async function getCompletionForBooking(req, res) {
  try {
    const { id } = req.params;
    const b = await pool.query(
      `SELECT b.id, b.status, b.customer_id, b.technician_id, b.booking_charge, b.slot_date, s.name AS service_name
       FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.id = $1`,
      [id]
    );
    const booking = b.rows[0];
    let allowed = false;
    if (booking) {
      if (req.user.role === "admin") allowed = true;
      else if (req.user.role === "technician") {
        const tech = await getTechnicianForUser(pool, req.user.id);
        allowed = !!tech && booking.technician_id === tech.id;
      } else allowed = booking.customer_id === req.user.id;
    }
    if (!allowed) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const c = await pool.query(`SELECT * FROM job_completions WHERE booking_id = $1`, [id]);
    if (c.rows.length === 0) {
      return res.status(404).json({ message: "No completion report for this booking yet" });
    }

    const w = await pool.query(
      `SELECT id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(expires_on, 'YYYY-MM-DD') AS expires_on,
              (expires_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS active
       FROM warranties WHERE booking_id = $1`,
      [id]
    );

    res.json({
      booking: {
        id: booking.id,
        status: booking.status,
        serviceName: booking.service_name,
        bookingCharge: booking.booking_charge,
        slotDate: booking.slot_date,
      },
      completion: c.rows[0],
      warranty: w.rows[0] || null,
    });
  } catch (err) {
    console.error("Get completion error:", err);
    res.status(500).json({ message: "Couldn't load the job report right now" });
  }
}

// ---------------------------------------------------------------------------
// 3. Approval -> COMPLETED + warranty record. Shared by the customer and by
//    admin ("approve on the customer's behalf", e.g. approved verbally).
// ---------------------------------------------------------------------------
async function finalizeApproval(client, bookingId, actingUserId, byAdmin) {
  const booking = await lockBooking(client, bookingId);
  if (booking.status !== "PENDING_APPROVAL") {
    throw new HttpError(409, "This job isn't waiting for approval");
  }
  const c = await client.query(`SELECT * FROM job_completions WHERE booking_id = $1`, [booking.id]);
  const completion = c.rows[0];
  if (!completion) throw new HttpError(409, "No completion report to approve yet");
  if (completion.customer_status !== "PENDING") {
    throw new HttpError(
      409,
      completion.customer_status === "DISPUTED"
        ? "An issue was raised - the report must be corrected and resubmitted first"
        : "This report was already approved"
    );
  }

  await client.query(
    `UPDATE job_completions SET customer_status = 'APPROVED', responded_at = now(),
            approved_by_admin = $2, updated_at = now() WHERE id = $1`,
    [completion.id, byAdmin]
  );
  await client.query(`UPDATE bookings SET status = 'COMPLETED', updated_at = now() WHERE id = $1`, [booking.id]);
  await client.query(
    `INSERT INTO booking_status_history (booking_id, status, changed_by, note) VALUES ($1, 'COMPLETED', $2, $3)`,
    [booking.id, actingUserId, byAdmin ? "Approved by admin on the customer's behalf" : "Approved by customer"]
  );
  const label = await jobLabel(client, booking);
  await logActivity(client, {
    actor: { id: actingUserId, role: byAdmin ? "admin" : "customer" },
    bookingId: booking.id,
    action: byAdmin ? "completion_approved_by_admin" : "completion_approved",
    summary: byAdmin
      ? `Admin approved ${label.text} on the customer's behalf. Job completed, total ₹${completion.total_amount}`
      : `${label.customerName} approved the work on ${label.text}. Job completed, total ₹${completion.total_amount}`,
    meta: { totalAmount: Number(completion.total_amount), byAdmin },
  });

  // Warranty starts the day the customer approves the work (India date).
  const svc = await client.query(`SELECT warranty_days FROM services WHERE id = $1`, [booking.service_id]);
  const days = svc.rows[0]?.warranty_days || 0;
  let warranty = null;
  if (days > 0) {
    const w = await client.query(
      `INSERT INTO warranties (booking_id, completion_id, customer_id, service_id, starts_on, expires_on)
       VALUES ($1, $2, $3, $4, (now() AT TIME ZONE 'Asia/Kolkata')::date,
               (now() AT TIME ZONE 'Asia/Kolkata')::date + $5::int)
       ON CONFLICT (booking_id) DO NOTHING
       RETURNING id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(expires_on, 'YYYY-MM-DD') AS expires_on`,
      [booking.id, completion.id, booking.customer_id, booking.service_id, days]
    );
    warranty = w.rows[0] || null;
  }
  return { status: "COMPLETED", warranty };
}

export async function approveCompletion(req, res) {
  const result = await withTransaction(res, "Approve completion", async (client) => {
    const own = await client.query(`SELECT customer_id FROM bookings WHERE id = $1`, [req.params.id]);
    if (!own.rows[0] || own.rows[0].customer_id !== req.user.id) {
      throw new HttpError(404, "Booking not found");
    }
    return finalizeApproval(client, req.params.id, req.user.id, false);
  });
  if (result) res.json(result);
}

export async function adminApproveCompletion(req, res) {
  const result = await withTransaction(res, "Admin approve completion", (client) =>
    finalizeApproval(client, req.params.id, req.user.id, true)
  );
  if (result) res.json(result);
}

// ---------------------------------------------------------------------------
// 4. Customer raises an issue - booking stays PENDING_APPROVAL, report becomes
//    DISPUTED until admin corrects and resubmits it.
// ---------------------------------------------------------------------------
export async function disputeCompletion(req, res) {
  const result = await withTransaction(res, "Dispute completion", async (client) => {
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (note.length < 5 || note.length > 500) {
      throw new HttpError(400, "Please describe the issue (5 to 500 characters)");
    }

    const booking = await lockBooking(client, req.params.id);
    if (booking.customer_id !== req.user.id) throw new HttpError(404, "Booking not found");
    if (booking.status !== "PENDING_APPROVAL") throw new HttpError(409, "This job isn't waiting for approval");

    const upd = await client.query(
      `UPDATE job_completions SET customer_status = 'DISPUTED', customer_note = $2,
              responded_at = now(), updated_at = now()
       WHERE booking_id = $1 AND customer_status = 'PENDING' RETURNING id`,
      [booking.id, note]
    );
    if (upd.rows.length === 0) throw new HttpError(409, "This report can't be disputed right now");

    await client.query(
      `INSERT INTO booking_status_history (booking_id, status, changed_by, note) VALUES ($1, 'PENDING_APPROVAL', $2, $3)`,
      [booking.id, req.user.id, `Customer raised an issue: ${note}`]
    );
    const label = await jobLabel(client, booking);
    await logActivity(client, {
      actor: { id: req.user.id, role: "customer" },
      bookingId: booking.id,
      action: "completion_disputed",
      summary: `${label.customerName} raised an issue on ${label.text}: "${note}"`,
      meta: { note },
      needsAttention: true,
    });
    return { status: "DISPUTED" };
  });
  if (result) res.json(result);
}

// ---------------------------------------------------------------------------
// 5. Warranties
// ---------------------------------------------------------------------------
const WARRANTY_SELECT = `
  SELECT w.id, w.booking_id, s.name AS service_name,
         to_char(w.starts_on, 'YYYY-MM-DD') AS starts_on,
         to_char(w.expires_on, 'YYYY-MM-DD') AS expires_on,
         (w.expires_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS active,
         u.name AS customer_name, u.phone AS customer_phone,
         jc.work_summary, jc.parts
  FROM warranties w
  JOIN services s ON s.id = w.service_id
  JOIN users u ON u.id = w.customer_id
  JOIN job_completions jc ON jc.id = w.completion_id`;

export async function listMyWarranties(req, res) {
  try {
    const r = await pool.query(`${WARRANTY_SELECT} WHERE w.customer_id = $1 ORDER BY w.expires_on DESC`, [
      req.user.id,
    ]);
    res.json({ warranties: r.rows });
  } catch (err) {
    console.error("List warranties error:", err);
    res.status(500).json({ message: "Couldn't load your warranties right now" });
  }
}

// Admin: look up a customer's warranties by phone number (warranty claim call).
export async function adminLookupWarranties(req, res) {
  try {
    const digits = String(req.query.phone || "").replace(/\D/g, "").slice(-10);
    if (digits.length < 6) {
      return res.status(400).json({ message: "Enter at least 6 digits of the phone number" });
    }
    const r = await pool.query(`${WARRANTY_SELECT} WHERE u.phone LIKE $1 ORDER BY w.expires_on DESC LIMIT 50`, [
      `%${digits}`,
    ]);
    res.json({ warranties: r.rows });
  } catch (err) {
    console.error("Warranty lookup error:", err);
    res.status(500).json({ message: "Couldn't look up warranties right now" });
  }
}