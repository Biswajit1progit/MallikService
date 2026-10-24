import { pool } from "../config/db.js";

export async function listServices(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, description, base_price, warranty_days, estimated_duration_minutes
       FROM services
       WHERE is_active = true
       ORDER BY id ASC`
    );
    res.json({ services: result.rows });
  } catch (err) {
    console.error("List services error:", err);
    res.status(500).json({ message: "Couldn't load services right now" });
  }
}

export async function getServiceById(req, res) {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, name, description, base_price, warranty_days, estimated_duration_minutes
       FROM services WHERE id = $1 AND is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.json({ service: result.rows[0] });
  } catch (err) {
    console.error("Get service error:", err);
    res.status(500).json({ message: "Couldn't load this service right now" });
  }
}