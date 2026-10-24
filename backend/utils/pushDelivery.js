import webpush from "web-push";
import { pool } from "../config/db.js";
import { getIO } from "./socketInstance.js";

// ---------------------------------------------------------------------------
// Sends queued notifications to people's phones/browsers (Web Push) and to any open
// page (socket). Runs every few seconds from server.js.
//
// Needs three env vars to reach phones (the bell inside the site works without them):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   -> create with:  npx web-push generate-vapid-keys
//   VAPID_SUBJECT                          -> mailto:you@example.com  (optional, defaults to BUSINESS_EMAIL)
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;
const BATCH = 50;
let configured = null;

function configure() {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || `mailto:${process.env.BUSINESS_EMAIL || "admin@example.com"}`, pub, priv);
    configured = true;
  } else {
    configured = false;
  }
  return configured;
}
export const pushEnabled = () => configure();
export const resetPushConfig = () => { configured = null; };

// tests replace the real sender through this hook
const sender = () => globalThis.__webpushSend || webpush.sendNotification.bind(webpush);

let running = false;

export async function deliverPending() {
  if (running) return 0;
  running = true;
  try {
    // Claim a batch. A claim lasts 60 s, so two server instances never send the same alert twice.
    const claimed = await pool.query(
      `UPDATE notifications SET push_attempts = push_attempts + 1, push_claimed_at = now()
       WHERE id IN (
         SELECT id FROM notifications
         WHERE push_state = 'pending'
           AND created_at > now() - interval '2 hours'
           AND (push_claimed_at IS NULL OR push_claimed_at < now() - interval '60 seconds')
         ORDER BY id LIMIT ${BATCH}
         FOR UPDATE SKIP LOCKED)
       RETURNING id, user_id, booking_id, kind, title, body, url, push_attempts, created_at`
    );
    for (const n of claimed.rows) {
      try {
        if (n.push_attempts === 1) {
          getIO()?.to(`user:${n.user_id}`).emit("notification", {
            id: Number(n.id), booking_id: n.booking_id, kind: n.kind, title: n.title, body: n.body, url: n.url, created_at: n.created_at, read_at: null,
          });
        }
        await sendOne(n);
      } catch (err) {
        console.error(`Push delivery error for notification ${n.id}:`, err.message);
      }
    }
    // Old alerts that never got sent (server was down for hours) are not worth a phone buzz any more.
    await pool.query(`UPDATE notifications SET push_state = 'skipped' WHERE push_state = 'pending' AND created_at <= now() - interval '2 hours'`);
    return claimed.rows.length;
  } catch (err) {
    console.error("deliverPending error:", err.message);
    return 0;
  } finally {
    running = false;
  }
}

async function sendOne(n) {
  const subs = (await pool.query(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, [n.user_id])).rows;
  if (!configure() || subs.length === 0) {
    await pool.query(`UPDATE notifications SET push_state = 'skipped' WHERE id = $1`, [n.id]);
    return;
  }
  const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url || "/", tag: `n-${n.id}`, id: Number(n.id) });
  let delivered = 0;
  let transient = 0;
  for (const s of subs) {
    try {
      await sender()({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high", timeout: 8000 });
      delivered++;
      await pool.query(`UPDATE push_subscriptions SET last_ok_at = now() WHERE id = $1`, [s.id]);
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        // the phone un-subscribed or the browser data was cleared: forget it
        await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]);
      } else {
        transient++;
        console.error(`Push to subscription ${s.id} failed:`, err?.statusCode || err?.message);
      }
    }
  }
  let state = "pending";
  if (delivered > 0) state = "sent";
  else if (transient === 0) state = "skipped"; // every device was gone
  else if (n.push_attempts >= MAX_ATTEMPTS) state = "failed";
  if (state !== "pending") await pool.query(`UPDATE notifications SET push_state = $2 WHERE id = $1`, [n.id, state]);
}