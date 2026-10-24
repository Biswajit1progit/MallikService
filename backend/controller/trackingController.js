import { pool } from "../config/db.js";
import { redis } from "../config/redis.js";
import { resolveTrackingToken,getActiveTokenForBooking } from "../utils/trackingToken.js";

export async function getTrackingInfo(req, res) {
  try {
    const { token } = req.params;

    const tokenRow = await resolveTrackingToken(token);
    if (!tokenRow) {
      return res.status(404).json({ message: "This tracking link has expired or is invalid" });
    }

    const bookingResult = await pool.query(
      `SELECT b.id, b.status, b.slot_date, b.slot_time, s.name AS service_name,
              a.latitude AS customer_lat, a.longitude AS customer_lng,
              t.name AS technician_name, t.phone AS technician_phone
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       JOIN customer_addresses a ON a.id = b.address_id
       LEFT JOIN technicians t ON t.id = b.technician_id
       WHERE b.id = $1`,
      [tokenRow.booking_id]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const booking = bookingResult.rows[0];

    // Pull the last known location from Redis if the technician has already
    // started sending updates - so the map isn't empty on first load,
    // waiting for the next live push to arrive over the socket.
    const cachedLocation = await redis.get(`location:${booking.id}`);

    res.json({
      bookingId: booking.id,
      status: booking.status,
      serviceName: booking.service_name,
      customerLat: booking.customer_lat,
      customerLng: booking.customer_lng,
      technicianName: booking.technician_name,
      lastKnownLocation: cachedLocation || null,
    });
  } catch (err) {
    console.error("Get tracking info error:", err);
    res.status(500).json({ message: "Couldn't load tracking info right now" });
  }
}


// Customer (owner) or admin fetches the live tracking link for an ON_THE_WAY booking.
export async function getBookingTrackingLink(req, res) {
  try {
    const { id } = req.params;
    const r = await pool.query(`SELECT customer_id, status FROM bookings WHERE id = $1`, [id]);
    const booking = r.rows[0];
    if (!booking || (req.user.role !== "admin" && booking.customer_id !== req.user.id)) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.status !== "ON_THE_WAY") {
      return res.status(409).json({ message: "Live tracking is only available while the technician is on the way" });
    }
    const token = await getActiveTokenForBooking(id);
    if (!token) return res.status(404).json({ message: "No active tracking link" });
    res.json({ trackingUrl: `${process.env.FRONTEND_URL}/track/${token}` });
  } catch (err) {
    console.error("Get tracking link error:", err);
    res.status(500).json({ message: "Couldn't load the tracking link" });
  }
}