import { pool } from "../config/db.js";
import { HttpError } from "./httpError.js";
import { DEDUCT_BOOKING_CHARGE } from "./policy.js";

const KINDS = ["RECEIPT", "FINAL"];
const PREFIX = { RECEIPT: "RC", FINAL: "INV" };
const round2 = (n) => Math.round(Number(n) * 100) / 100;

// Business details come from environment variables so the owner can change them without code.
// GST is OFF unless BUSINESS_GSTIN is set. Prices are treated as GST-inclusive.
export function businessInfo() {
  const gstin = (process.env.BUSINESS_GSTIN || "").trim();
  return {
    name: process.env.BUSINESS_NAME || "ServiceBook",
    address: process.env.BUSINESS_ADDRESS || "",
    phone: process.env.BUSINESS_PHONE || "",
    email: process.env.BUSINESS_EMAIL || "",
    gstin: gstin || null,
    gstRate: gstin ? Number(process.env.GST_RATE || 18) : 0,
  };
}

function gstSplit(total, biz) {
  if (!biz.gstin || !biz.gstRate) return null;
  const taxable = round2(total / (1 + biz.gstRate / 100));
  const gst = round2(total - taxable);
  const half = round2(gst / 2);
  return { rate: biz.gstRate, taxable, cgst: half, sgst: round2(gst - half), total: round2(total) };
}

// Indian financial year, e.g. 18 Oct 2026 -> "2627", 10 Feb 2027 -> "2627"
function financialYear(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

// Gives the booking its permanent number the first time it is needed. Safe to call many times
// and from two requests at once (UNIQUE(booking_id, kind) decides the winner).
export async function ensureInvoiceNo(bookingId, kind, db = pool) {
  if (!KINDS.includes(kind)) throw new HttpError(400, "Invalid invoice type");
  const existing = await db.query(`SELECT invoice_no, issued_at FROM invoices WHERE booking_id=$1 AND kind=$2`, [bookingId, kind]);
  if (existing.rows[0]) return existing.rows[0];
  const seq = (await db.query(`SELECT nextval('invoice_no_seq') AS n`)).rows[0].n;
  const no = `${PREFIX[kind]}-${financialYear()}-${String(seq).padStart(5, "0")}`;
  await db.query(
    `INSERT INTO invoices (booking_id, kind, invoice_no) VALUES ($1,$2,$3) ON CONFLICT (booking_id, kind) DO NOTHING`,
    [bookingId, kind, no]
  );
  return (await db.query(`SELECT invoice_no, issued_at FROM invoices WHERE booking_id=$1 AND kind=$2`, [bookingId, kind])).rows[0];
}

// Everything needed to print one document. `viewer` = { id, role }.
export async function buildInvoice(bookingId, kind, viewer) {
  if (!KINDS.includes(kind)) throw new HttpError(400, "Invalid invoice type");
  const b = (
    await pool.query(
      `SELECT b.id, b.status, b.customer_id, b.booking_charge, b.distance_km,
              to_char(b.slot_date,'YYYY-MM-DD') AS slot_date, to_char(b.slot_time,'HH24:MI') AS slot_time,
              u.name AS customer_name, u.phone AS customer_phone, u.email AS customer_email,
              a.address_text, s.name AS service_name, t.name AS technician_name
       FROM bookings b
       JOIN users u ON u.id = b.customer_id
       JOIN customer_addresses a ON a.id = b.address_id
       JOIN services s ON s.id = b.service_id
       LEFT JOIN technicians t ON t.id = b.technician_id
       WHERE b.id = $1`,
      [bookingId]
    )
  ).rows[0];
  // same message for "doesn't exist" and "not yours" so ids can't be probed
  if (!b || (viewer.role !== "admin" && b.customer_id !== viewer.id)) throw new HttpError(404, "Booking not found");

  const biz = businessInfo();
  const base = {
    kind,
    business: biz,
    customer: { name: b.customer_name, phone: b.customer_phone, email: b.customer_email, address: b.address_text },
    booking: { id: b.id, service: b.service_name, technician: b.technician_name, date: b.slot_date, time: b.slot_time },
  };

  if (kind === "RECEIPT") {
    const pay = (
      await pool.query(
        `SELECT * FROM payments WHERE booking_id=$1 AND status IN ('success','refunded') ORDER BY id DESC LIMIT 1`,
        [bookingId]
      )
    ).rows[0];
    if (!pay) throw new HttpError(404, "No payment has been made for this booking");
    const refunds = (
      await pool.query(`SELECT amount, status, created_at FROM refunds WHERE booking_id=$1 AND status IN ('INITIATED','PROCESSED') ORDER BY id`, [bookingId])
    ).rows;
    const inv = await ensureInvoiceNo(bookingId, "RECEIPT");
    const amount = round2(pay.amount);
    return {
      ...base,
      number: inv.invoice_no,
      issuedAt: inv.issued_at,
      title: "Payment receipt",
      lines: [{ description: `Booking charge: ${b.service_name} (${Number(b.distance_km)} km visit)`, qty: 1, unitPrice: amount, amount }],
      total: amount,
      tax: gstSplit(amount, biz),
      payment: { method: "Online (Razorpay)", reference: pay.razorpay_payment_id, paidAt: pay.created_at, status: "PAID" },
      refunds: refunds.map((r) => ({ amount: round2(r.amount), status: r.status, at: r.created_at })),
      notes: [
        "This is the prepaid booking (visit) charge. The final bill for parts and labour is issued after the job is completed and approved.",
      ],
    };
  }

  // FINAL
  const c = (await pool.query(`SELECT * FROM job_completions WHERE booking_id=$1`, [bookingId])).rows[0];
  if (b.status !== "COMPLETED" || !c || c.customer_status !== "APPROVED") {
    throw new HttpError(409, "The invoice is available after the job is completed and approved");
  }
  const inv = await ensureInvoiceNo(bookingId, "FINAL");
  const parts = Array.isArray(c.parts) ? c.parts : [];
  const lines = parts.map((p) => ({
    description: p.name, qty: p.qty, unitPrice: round2(p.unit_price), amount: round2(p.qty * p.unit_price),
  }));
  if (Number(c.labour_charge) > 0) {
    lines.push({ description: "Labour / service charge", qty: 1, unitPrice: round2(c.labour_charge), amount: round2(c.labour_charge) });
  }
  const warranty = (await pool.query(
    `SELECT to_char(starts_on,'YYYY-MM-DD') AS starts_on, to_char(expires_on,'YYYY-MM-DD') AS expires_on FROM warranties WHERE booking_id=$1`,
    [bookingId]
  )).rows[0];
  const paidOnSite = c.payment_mode !== "PENDING";
  const credit = DEDUCT_BOOKING_CHARGE ? round2(b.booking_charge) : 0;
  const notes = [];
  if (!DEDUCT_BOOKING_CHARGE) {
    notes.push(`The booking charge of ₹${round2(b.booking_charge).toFixed(2)} was paid online and is shown on its own receipt. It is not part of this bill.`);
  }
  if (warranty) notes.push(`Warranty on this work: ${warranty.starts_on} to ${warranty.expires_on}.`);
  return {
    ...base,
    number: inv.invoice_no,
    issuedAt: inv.issued_at,
    title: biz.gstin ? "Tax invoice" : "Invoice",
    workSummary: c.work_summary,
    lines,
    subtotal: round2(c.total_amount),
    credit,
    total: round2(c.amount_due),
    tax: gstSplit(round2(c.amount_due), biz),
    payment: {
      method: c.payment_mode === "CASH" ? "Cash" : c.payment_mode === "UPI" ? "UPI" : "Not paid yet",
      status: paidOnSite ? "PAID" : "DUE",
      paidAt: c.collected_at || null,
    },
    warranty: warranty || null,
    notes,
  };
}