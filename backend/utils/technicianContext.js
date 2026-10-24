import { pool } from "../config/db.js";

// Finds the technicians row that belongs to a logged-in user (users.id -> technicians.user_id).
export async function getTechnicianForUser(db, userId) {
  const r = await db.query(`SELECT * FROM technicians WHERE user_id = $1`, [userId]);
  return r.rows[0] || null;
}

// Express middleware: only technicians who have an ACTIVE technician profile pass.
// Puts the technicians row on req.technician so controllers never trust a client-sent id.
export async function requireTechnician(req, res, next) {
  try {
    if (req.user?.role !== "technician") {
      return res.status(403).json({ message: "Not authorized for this action" });
    }
    const tech = await getTechnicianForUser(pool, req.user.id);
    if (!tech) {
      return res.status(403).json({ message: "Your technician profile isn't set up yet. Ask the admin." });
    }
    if (!tech.is_active) {
      return res.status(403).json({ message: "Your technician account is switched off. Ask the admin." });
    }
    req.technician = tech;
    next();
  } catch (err) {
    console.error("requireTechnician error:", err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
}