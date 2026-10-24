import crypto from "crypto";
import { pool } from "../config/db.js";

const TOKEN_VALID_HOURS = 4;

// Generates a fresh tracking token for a booking. Called when a booking's
// status moves to ON_THE_WAY. Random, not guessable from the booking ID -
// that's the whole point of using a separate token instead of just putting
// the booking ID in the SMS link.
export async function createTrackingToken(bookingId) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_VALID_HOURS * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO tracking_tokens (booking_id, token, expires_at) VALUES ($1, $2, $3)`,
    [bookingId, token, expiresAt]
  );

  return token;
}

export async function resolveTrackingToken(token) {
  const result = await pool.query(
    `SELECT * FROM tracking_tokens WHERE token = $1 AND expires_at > now()`,
    [token]
  );
  return result.rows[0] || null;
}

export async function getActiveTokenForBooking(bookingId) {
  const result = await pool.query(
    `SELECT token FROM tracking_tokens WHERE booking_id = $1 AND expires_at > now()
     ORDER BY expires_at DESC LIMIT 1`,
    [bookingId]
  );
  return result.rows[0]?.token || null;
}