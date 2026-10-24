// Counts how many active (non-cancelled, non-no-show) bookings a technician
// already has on a given date.
export async function countBookingsOnDate(client, technicianId, date) {
  const result = await client.query(
    `SELECT count(*) AS count FROM bookings
     WHERE technician_id = $1 AND slot_date = $2
     AND status NOT IN ('CANCELLED', 'NO_SHOW')`,
    [technicianId, date]
  );
  return parseInt(result.rows[0].count, 10);
}

// Walks forward day by day from startDate until it finds a date with open
// capacity. This is what makes "day 1 full -> try day 2 -> also full -> try
// day 3" work automatically, however many days deep it needs to go.
// Capped at 30 days out as a sanity limit so this can never loop forever.
export async function findNextAvailableDate(client, technicianId, maxPerDay, startDate) {
  const MAX_DAYS_AHEAD = 30;
  const date = new Date(startDate);

  for (let i = 0; i < MAX_DAYS_AHEAD; i++) {
    const dateStr = date.toISOString().split("T")[0];
    const booked = await countBookingsOnDate(client, technicianId, dateStr);

    if (booked < maxPerDay) {
      return { date: dateStr, booked, capacity: maxPerDay };
    }

    date.setDate(date.getDate() + 1);
  }

  return null; // fully booked for the next 30 days straight - extremely unlikely, but handled
}