import { pool } from "../config/db.js";
import { pushEnabled } from "../utils/pushDelivery.js";
import { createNotification } from "../utils/notify.js";

const ROLE_HOME = { customer: "/bookings", technician: "/technician", admin: "/admin" };

export async function listMine(req, res) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const [list, unread] = await Promise.all([
      pool.query(
        `SELECT id, booking_id, kind, title, body, url, created_at, read_at
         FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
        [req.user.id, limit]
      ),
      pool.query(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [req.user.id]),
    ]);
    res.json({
      notifications: list.rows.map((r) => ({ ...r, id: Number(r.id) })),
      unread: unread.rows[0].n,
    });
  } catch (err) {
    console.error("List notifications error:", err);
    res.status(500).json({ message: "Couldn't load your notifications" });
  }
}

export async function markRead(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid notification" });
    const r = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ message: "Notification not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Mark notification read error:", err);
    res.status(500).json({ message: "Something went wrong" });
  }
}

export async function markAllRead(req, res) {
  try {
    await pool.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Mark all read error:", err);
    res.status(500).json({ message: "Something went wrong" });
  }
}

// The browser needs this public key to ask the phone for permission.
export function pushConfig(req, res) {
  res.json({ enabled: pushEnabled(), publicKey: pushEnabled() ? process.env.VAPID_PUBLIC_KEY : null });
}

function validSubscription(s) {
  return (
    s &&
    typeof s.endpoint === "string" &&
    /^https:\/\//.test(s.endpoint) &&
    s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys?.auth === "string" &&
    s.keys.p256dh.length < 200 &&
    s.keys.auth.length < 100
  );
}

export async function subscribePush(req, res) {
  try {
    const s = req.body?.subscription;
    if (!validSubscription(s)) return res.status(400).json({ message: "That doesn't look like a valid phone subscription" });
    // One browser = one row. If the same browser logs in as someone else, the alerts follow the new person.
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
      [req.user.id, s.endpoint, s.keys.p256dh, s.keys.auth, String(req.headers["user-agent"] || "").slice(0, 200)]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Subscribe push error:", err);
    res.status(500).json({ message: "Couldn't turn on phone alerts" });
  }
}

export async function unsubscribePush(req, res) {
  try {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== "string") return res.status(400).json({ message: "Missing endpoint" });
    await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [endpoint, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Unsubscribe push error:", err);
    res.status(500).json({ message: "Something went wrong" });
  }
}

export async function sendTest(req, res) {
  try {
    await createNotification(pool, {
      userId: req.user.id,
      kind: "system",
      title: "Alerts are on",
      body: "This is a test. You will get booking updates like this one.",
      url: ROLE_HOME[req.user.role] || "/",
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Test notification error:", err);
    res.status(500).json({ message: "Something went wrong" });
  }
}