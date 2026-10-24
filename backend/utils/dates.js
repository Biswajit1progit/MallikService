import { HttpError } from "./httpError.js";

// Throws 400 if slotDate is not a real YYYY-MM-DD date, or is before today in India.
// Done in SQL so the "today" used is always India's, not the server's clock zone.
export async function assertValidFutureDate(db, slotDate, slotTime) {
  if (typeof slotDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
    throw new HttpError(400, "Pick a valid date");
  }
  if (typeof slotTime !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(slotTime)) {
    throw new HttpError(400, "Pick a valid time");
  }
  let past;
  try {
    const r = await db.query(
      `SELECT $1::date < (now() AT TIME ZONE 'Asia/Kolkata')::date AS past`,
      [slotDate]
    );
    past = r.rows[0].past;
  } catch {
    // Postgres rejects impossible dates such as 2026-02-31
    throw new HttpError(400, "Pick a valid date");
  }
  if (past) throw new HttpError(400, "You can't book or move a visit to a past date");
}