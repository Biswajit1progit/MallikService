import { pool } from "../config/db.js";

export const cleanEmail = (e) => (typeof e === "string" ? e.trim().toLowerCase() : "");

// Is this email or phone on the blacklist? Pass either or both. Returns the row or null.
// Until the v8 SQL has been run the table doesn't exist; then nobody is blocked and the site keeps working.
let tableKnown = false;
async function tableExists(db) {
  if (tableKnown) return true;
  const r = await db.query(`SELECT to_regclass('public.blocked_identities') IS NOT NULL AS ok`);
  tableKnown = r.rows[0].ok;
  return tableKnown;
}

export async function findBlocked(db, { email, phone } = {}) {
  db = db || pool;
  if (!(await tableExists(db))) return null;
  const e = cleanEmail(email) || null;
  const p = phone || null;
  if (!e && !p) return null;
  const r = await db.query(
    `SELECT id, email, phone FROM blocked_identities WHERE ($1::text IS NOT NULL AND email = $1) OR ($2::text IS NOT NULL AND phone = $2) LIMIT 1`,
    [e, p]
  );
  return r.rows[0] || null;
}

export const BLOCKED_MESSAGE =
  "This email or mobile number can't be used on our service. Please contact the shop if you think this is a mistake.";