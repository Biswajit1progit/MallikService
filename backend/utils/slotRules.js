import { HttpError } from "./httpError.js";
import { countBookingsOnDate, findNextAvailableDate } from "./availability.js";

// Used when an EXISTING booking moves to a new day/time or a new technician
// (customer/admin reschedule, admin re-assign). Same rules as creating a booking:
//   - a technician has at most max_bookings_per_day active bookings per day
//   - two bookings can't share the exact same slot for one technician
// Must run inside a transaction: the advisory lock lives until COMMIT/ROLLBACK, which
// serialises two people grabbing the last slot at the same moment.
export async function assertSlotAvailable(client, { technicianId, slotDate, slotTime, excludeBookingId }) {
  const t = await client.query(`SELECT max_bookings_per_day FROM technicians WHERE id = $1`, [technicianId]);
  if (t.rows.length === 0) throw new HttpError(404, "Technician not found");
  const maxPerDay = t.rows[0].max_bookings_per_day;

  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${technicianId}:${slotDate}`]);

  // Count the day, ignoring the booking being moved (it may already be on that day).
  const dayCount = await client.query(
    `SELECT count(*)::int AS n FROM bookings
     WHERE technician_id = $1 AND slot_date = $2 AND status NOT IN ('CANCELLED', 'NO_SHOW')
       AND id <> $3`,
    [technicianId, slotDate, excludeBookingId]
  );
  if (dayCount.rows[0].n >= maxPerDay) {
    const next = await findNextAvailableDate(client, technicianId, maxPerDay, slotDate);
    throw new HttpError(
      409,
      next
        ? `${slotDate} is fully booked. The next available date is ${next.date}.`
        : `${slotDate} is fully booked and no open dates were found in the next 30 days.`,
      { fullyBooked: true, suggestedDate: next?.date ?? null }
    );
  }

  const clash = await client.query(
    `SELECT id FROM bookings
     WHERE technician_id = $1 AND slot_date = $2 AND slot_time = $3
       AND status NOT IN ('CANCELLED', 'NO_SHOW') AND id <> $4`,
    [technicianId, slotDate, slotTime, excludeBookingId]
  );
  if (clash.rows.length > 0) {
    throw new HttpError(409, "That exact time slot is already taken. Pick another time.");
  }
}

export { countBookingsOnDate };