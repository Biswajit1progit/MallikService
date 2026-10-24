import { pool } from "../config/db.js";
import { findMatchingZone, getBookingCharge } from "../utils/distance.js";

export async function createAddress(req, res) {
  try {
    const userId = req.user.id;
    const { addressText, latitude, longitude, isDefault } = req.body;

    if (!addressText || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "Address, latitude, and longitude are required" });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: "Latitude and longitude must be valid numbers" });
    }

    const zonesResult = await pool.query(
      `SELECT * FROM service_zones WHERE is_active = true`
    );

    const match = findMatchingZone(zonesResult.rows, lat, lng);

    if (!match) {
      return res.status(422).json({
        message: "Sorry, this address is outside our service area (70km limit).",
        serviceable: false,
      });
    }

    const distanceKm = Math.round(match.distanceKm * 100) / 100; // 2 decimal places
    const bookingCharge = await getBookingCharge(pool, distanceKm);

    if (isDefault) {
      // only one default address per user
      await pool.query(
        `UPDATE customer_addresses SET is_default = false WHERE user_id = $1`,
        [userId]
      );
    }

    const result = await pool.query(
      `INSERT INTO customer_addresses (user_id, address_text, latitude, longitude, distance_km, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, address_text, latitude, longitude, distance_km, is_default, created_at`,
      [userId, addressText, lat, lng, distanceKm, !!isDefault]
    );

    res.status(201).json({
      address: result.rows[0],
      distanceKm,
      bookingCharge,
      serviceable: true,
    });
  } catch (err) {
    console.error("Create address error:", err);
    res.status(500).json({ message: "Couldn't save this address right now" });
  }
}

export async function listAddresses(req, res) {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT id, address_text, latitude, longitude, distance_km, is_default, created_at
       FROM customer_addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    res.json({ addresses: result.rows });
  } catch (err) {
    console.error("List addresses error:", err);
    res.status(500).json({ message: "Couldn't load your addresses right now" });
  }
}

export async function deleteAddress(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM customer_addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Address not found" });
    }

    res.json({ message: "Address removed" });
  } catch (err) {
    console.error("Delete address error:", err);
    res.status(500).json({ message: "Couldn't remove this address right now" });
  }
}