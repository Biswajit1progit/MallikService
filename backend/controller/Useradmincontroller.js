import { pool } from "../config/db.js";
import { HttpError, sendError } from "../utils/httpError.js";
import { logActivity } from "../utils/activity.js";
import { cleanEmail } from "../utils/block.js";

// Statuses where a job is finished or never really started. Anything else is "open work".
const NOT_OPEN = ["COMPLETED", "CANCELLED", "NO_SHOW", "PENDING"];

// GET /api/admin/users?role=customer|technician|admin&status=active|removed&q=text
export async function listUsers(req, res) {
  try {
    const { role, status, q } = req.query;
    const where = [];
    const params = [NOT_OPEN];
    if (["customer", "technician", "admin"].includes(role)) {
      params.push(role);
      where.push(`u.role = $${params.length}`);
    }
    if (status === "removed") where.push(`u.removed_at IS NOT NULL`);
    else where.push(`u.removed_at IS NULL`);
    if (typeof q === "string" && q.trim()) {
      params.push(`%${q.trim().toLowerCase()}%`);
      const n = params.length;
      where.push(`(lower(u.name) LIKE $${n} OR lower(u.email) LIKE $${n} OR u.phone LIKE $${n}
                   OR lower(coalesce(u.removed_email,'')) LIKE $${n} OR coalesce(u.removed_phone,'') LIKE $${n})`);
    }
    const r = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.auth_provider, u.is_active, u.created_at,
              u.removed_at, u.removed_email, u.removed_phone, u.removed_reason,
              (SELECT count(*)::int FROM bookings b WHERE b.customer_id = u.id) AS bookings_total,
              (SELECT count(*)::int FROM bookings b WHERE b.customer_id = u.id AND b.status = 'COMPLETED') AS bookings_completed,
              ((SELECT count(*)::int FROM bookings b WHERE b.customer_id = u.id AND NOT (b.status = ANY($1)))
               + (SELECT count(*)::int FROM bookings b JOIN technicians t ON t.id = b.technician_id
                    WHERE t.user_id = u.id AND NOT (b.status = ANY($1)))) AS open_jobs,
              (SELECT max(created_at) FROM activity_log a WHERE a.actor_id = u.id) AS last_active_at,
              EXISTS (SELECT 1 FROM blocked_identities bi
                       WHERE (bi.email IS NOT NULL AND bi.email = lower(coalesce(u.removed_email, u.email)))
                          OR (bi.phone IS NOT NULL AND bi.phone = coalesce(u.removed_phone, u.phone))) AS blacklisted
       FROM users u
       WHERE ${where.join(" AND ")}
       ORDER BY u.created_at DESC
       LIMIT 300`,
      params
    );
    res.json({ users: r.rows });
  } catch (err) {
    sendError(res, err, "List users");
  }
}

// GET /api/admin/users/blocked
export async function listBlocked(req, res) {
  try {
    const r = await pool.query(
      `SELECT bi.id, bi.email, bi.phone, bi.reason, bi.created_at, u.name
       FROM blocked_identities bi LEFT JOIN users u ON u.id = bi.user_id
       ORDER BY bi.created_at DESC LIMIT 300`
    );
    res.json({ blocked: r.rows });
  } catch (err) {
    sendError(res, err, "List blocked");
  }
}

// Frees the person's email, phone and Google link so they could sign up again, and signs them out
// everywhere. The row stays (old bookings, payments and invoices still point at it).
// Returns the original email and phone. Must run inside a transaction.
async function detachAccount(client, user, adminId, reason) {
  const origEmail = user.email;
  const origPhone = user.phone;
  await client.query(
    `UPDATE users
        SET removed_at = now(), removed_by = $2, removed_reason = $3,
            removed_email = $4, removed_phone = $5,
            email = $6, phone = NULL, google_id = NULL, password_hash = NULL, is_active = false
      WHERE id = $1`,
    [user.id, adminId, reason, origEmail, origPhone, `removed-${user.id}-${Date.now()}@removed.invalid`]
  );
  await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [user.id]);
  await client.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [user.id]);
  // A technician profile stays (its jobs belong to it) but is switched off.
  await client.query(`UPDATE technicians SET is_active = false WHERE user_id = $1`, [user.id]);
  return { origEmail, origPhone };
}

async function loadTarget(client, id, adminId) {
  const userId = Number(id);
  if (!Number.isInteger(userId)) throw new HttpError(400, "Invalid user");
  const u = (await client.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
  if (!u) throw new HttpError(404, "User not found");
  if (u.role === "admin") throw new HttpError(403, "Admin accounts can't be removed here");
  if (u.id === adminId) throw new HttpError(403, "You can't remove your own account");
  return u;
}

async function assertNoOpenWork(client, u) {
  const open = (
    await client.query(
      `SELECT (SELECT count(*)::int FROM bookings b WHERE b.customer_id = $1 AND NOT (b.status = ANY($2)))
            + (SELECT count(*)::int FROM bookings b JOIN technicians t ON t.id = b.technician_id
                 WHERE t.user_id = $1 AND NOT (b.status = ANY($2))) AS n`,
      [u.id, NOT_OPEN]
    )
  ).rows[0].n;
  if (open > 0) {
    throw new HttpError(
      409,
      u.role === "technician"
        ? `${u.name} still has ${open} open job(s). Move them to another technician first.`
        : `${u.name} still has ${open} open booking(s). Cancel or finish them first.`
    );
  }
}

// POST /api/admin/users/:id/remove   { reason? }
// "Remove account": they can no longer log in, and may sign up again with the same email/phone.
export async function removeUser(req, res) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await loadTarget(client, req.params.id, req.user.id);
    if (u.removed_at) throw new HttpError(409, "This account is already removed");
    await assertNoOpenWork(client, u);
    const reason = String(req.body?.reason || "").trim().slice(0, 300) || null;
    await detachAccount(client, u, req.user.id, reason);
    await logActivity(client, {
      actor: { id: req.user.id, role: "admin" },
      action: "user_removed",
      summary: `Admin removed the ${u.role} account of ${u.name}. They can sign up again.`,
      meta: { userId: u.id },
    });
    await client.query("COMMIT");
    res.json({ message: `${u.name}'s account was removed. They can sign up again.` });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendError(res, err, "Remove user");
  } finally {
    client.release();
  }
}

// POST /api/admin/users/:id/blacklist   { reason? }
// "Delete forever": removes the account (if still active) AND blocks the email and phone for good.
export async function blacklistUser(req, res) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await loadTarget(client, req.params.id, req.user.id);
    let email = u.email;
    let phone = u.phone;
    const reason = String(req.body?.reason || "").trim().slice(0, 300) || null;
    if (u.removed_at) {
      email = u.removed_email;
      phone = u.removed_phone;
    } else {
      await assertNoOpenWork(client, u);
      await detachAccount(client, u, req.user.id, reason);
    }
    const e = cleanEmail(email) || null;
    if (e) {
      await client.query(
        `INSERT INTO blocked_identities (email, reason, user_id, created_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [e, reason, u.id, req.user.id]
      );
    }
    if (phone) {
      await client.query(
        `INSERT INTO blocked_identities (phone, reason, user_id, created_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [phone, reason, u.id, req.user.id]
      );
    }
    await logActivity(client, {
      actor: { id: req.user.id, role: "admin" },
      action: "user_blacklisted",
      summary: `Admin deleted ${u.name} forever and blocked their email and mobile number`,
      meta: { userId: u.id },
    });
    await client.query("COMMIT");
    res.json({ message: `${u.name} was deleted and their email and mobile number are blocked.` });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    sendError(res, err, "Blacklist user");
  } finally {
    client.release();
  }
}

// DELETE /api/admin/users/blocked/:id   - lift one blacklist entry
export async function unblock(req, res) {
  try {
    const r = await pool.query(`DELETE FROM blocked_identities WHERE id = $1 RETURNING id, email, phone`, [req.params.id]);
    if (!r.rows[0]) throw new HttpError(404, "Entry not found");
    res.json({ message: "Unblocked. This email or mobile number can be used again." });
  } catch (err) {
    sendError(res, err, "Unblock");
  }
}