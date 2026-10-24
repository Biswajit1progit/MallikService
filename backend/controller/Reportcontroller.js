import ExcelJS from "exceljs";
import { pool } from "../config/db.js";
import { ensureInvoiceNo } from "../utils/Invoiceservice.js";
import { sendError, HttpError } from "../utils/httpError.js";

const MONEY = '"₹"#,##0.00';
const MAX_DAYS = 400;
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

async function resolveRange(q) {
  let { from, to } = q;
  if (!from || !to) {
    // default: this month so far (India time)
    const r = await pool.query(
      `SELECT to_char(date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata'),'YYYY-MM-DD') AS f,
              to_char((now() AT TIME ZONE 'Asia/Kolkata')::date,'YYYY-MM-DD') AS t`
    );
    from = from || r.rows[0].f;
    to = to || r.rows[0].t;
  }
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, "Use dates like 2026-10-01");
  if (from > to) throw new HttpError(400, "'From' date must not be after 'To' date");
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_DAYS) throw new HttpError(400, `Choose a range of at most ${MAX_DAYS} days`);
  return { from, to };
}

// One row per booking in the range. This is the single source for the Bookings sheet,
// the Summary and the Technicians sheet, so the three can never disagree.
async function loadBookingRows(from, to) {
  const r = await pool.query(
    `SELECT b.id, b.status, b.booking_charge,
            to_char(b.created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS booked_on,
            to_char(b.slot_date,'YYYY-MM-DD') AS slot_date, to_char(b.slot_time,'HH24:MI') AS slot_time,
            u.name AS customer, u.phone, s.name AS service, t.name AS technician, b.technician_id,
            (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.booking_id=b.id AND p.status IN ('success','refunded')) AS paid_online,
            (SELECT COALESCE(SUM(r.amount),0) FROM refunds r WHERE r.booking_id=b.id AND r.status IN ('INITIATED','PROCESSED')) AS refunded,
            c.total_amount, c.parts_total, c.labour_charge, c.amount_due, c.payment_mode, c.customer_status,
            to_char(c.collected_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS collected_on
     FROM bookings b
     JOIN users u ON u.id=b.customer_id
     JOIN services s ON s.id=b.service_id
     LEFT JOIN technicians t ON t.id=b.technician_id
     LEFT JOIN job_completions c ON c.booking_id=b.id
     WHERE b.slot_date BETWEEN $1 AND $2 AND b.status <> 'PENDING'
     ORDER BY b.slot_date, b.slot_time, b.id`,
    [from, to]
  );
  return r.rows;
}

function styleSheet(ws, widths, moneyCols = []) {
  ws.columns = ws.columns.map((c, i) => ({ ...c, width: widths[i] || 14 }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 30;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  for (const c of moneyCols) ws.getColumn(c).numFmt = MONEY;
}

// GET /api/reports/admin/export?from=YYYY-MM-DD&to=YYYY-MM-DD   -> .xlsx download
export async function adminExport(req, res) {
  try {
    const { from, to } = await resolveRange(req.query);
    const rows = await loadBookingRows(from, to);

    // Make sure every paid / completed booking has its permanent number (oldest first).
    const inv = new Map();
    for (const r of rows) {
      const out = {};
      if (Number(r.paid_online) > 0) out.receipt = (await ensureInvoiceNo(r.id, "RECEIPT")).invoice_no;
      if (r.status === "COMPLETED" && r.customer_status === "APPROVED") out.final = (await ensureInvoiceNo(r.id, "FINAL")).invoice_no;
      inv.set(r.id, out);
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "ServiceBook";
    wb.created = new Date();

    // ---------- Bookings ----------
    const ws = wb.addWorksheet("Bookings");
    ws.columns = [
      { header: "Booking #", key: "id" }, { header: "Visit date", key: "slot_date" }, { header: "Time", key: "slot_time" },
      { header: "Customer", key: "customer" }, { header: "Phone", key: "phone" }, { header: "Service", key: "service" },
      { header: "Technician", key: "technician" }, { header: "Status", key: "status" },
      { header: "Booking charge paid online", key: "paid_online" }, { header: "Refunded", key: "refunded" },
      { header: "Parts", key: "parts_total" }, { header: "Labour", key: "labour_charge" },
      { header: "Job total", key: "total_amount" }, { header: "Billed on site", key: "amount_due" },
      { header: "Paid by", key: "mode" }, { header: "Collected on site", key: "collected" },
      { header: "Still to collect", key: "outstanding" }, { header: "Receipt no.", key: "receipt" },
      { header: "Invoice no.", key: "final" }, { header: "Booked on", key: "booked_on" },
    ];
    const t = { paid: 0, refunded: 0, billed: 0, collected: 0, outstanding: 0, completed: 0, cancelled: 0 };
    const perTech = new Map();
    for (const r of rows) {
      const billed = r.status === "COMPLETED" ? Number(r.amount_due || 0) : 0;
      const isPaid = r.status === "COMPLETED" && r.payment_mode && r.payment_mode !== "PENDING";
      const collected = isPaid ? billed : 0;
      const outstanding = r.status === "COMPLETED" && !isPaid ? billed : 0;
      t.paid += Number(r.paid_online); t.refunded += Number(r.refunded);
      t.billed += billed; t.collected += collected; t.outstanding += outstanding;
      if (r.status === "COMPLETED") t.completed++;
      if (r.status === "CANCELLED") t.cancelled++;
      const key = r.technician || "Unassigned";
      const p = perTech.get(key) || { jobs: 0, completed: 0, billed: 0, collected: 0, outstanding: 0 };
      p.jobs++;
      if (r.status === "COMPLETED") { p.completed++; p.billed += billed; p.collected += collected; p.outstanding += outstanding; }
      perTech.set(key, p);
      ws.addRow({
        id: r.id, slot_date: r.slot_date, slot_time: r.slot_time, customer: r.customer, phone: r.phone,
        service: r.service, technician: r.technician || "Unassigned", status: r.status,
        paid_online: Number(r.paid_online), refunded: Number(r.refunded),
        parts_total: r.total_amount == null ? null : Number(r.parts_total),
        labour_charge: r.total_amount == null ? null : Number(r.labour_charge),
        total_amount: r.total_amount == null ? null : Number(r.total_amount),
        amount_due: r.status === "COMPLETED" ? billed : null,
        mode: r.status === "COMPLETED" ? (isPaid ? r.payment_mode : "NOT PAID") : "",
        collected: r.status === "COMPLETED" ? collected : null,
        outstanding: r.status === "COMPLETED" ? outstanding : null,
        receipt: inv.get(r.id)?.receipt || "", final: inv.get(r.id)?.final || "", booked_on: r.booked_on,
      });
    }
    styleSheet(ws, [10, 12, 8, 20, 14, 22, 18, 16, 14, 12, 12, 12, 12, 12, 11, 14, 14, 16, 16, 17], [9, 10, 11, 12, 13, 14, 16, 17]);
    // unpaid completed jobs in red so they cannot be missed
    ws.eachRow((row, n) => {
      if (n > 1 && Number(row.getCell("outstanding").value) > 0) row.getCell("outstanding").font = { bold: true, color: { argb: "FFB91C1C" } };
    });

    // ---------- Summary ----------
    const sm = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
    wb.views = [{ activeTab: 0 }];
    sm.columns = [{ width: 44 }, { width: 18 }];
    sm.addRow(["ServiceBook: money summary"]).font = { bold: true, size: 14 };
    sm.addRow([`Visits from ${from} to ${to}`]);
    sm.addRow([]);
    const money = (label, v, bold = false) => {
      const row = sm.addRow([label, v]);
      row.getCell(2).numFmt = MONEY;
      if (bold) row.font = { bold: true };
      return row;
    };
    sm.addRow(["Bookings in range (confirmed or later)", rows.length]);
    sm.addRow(["Jobs completed", t.completed]);
    sm.addRow(["Bookings cancelled", t.cancelled]);
    sm.addRow([]);
    sm.addRow(["ONLINE (Razorpay booking charges)"]).font = { bold: true };
    money("Booking charges received", t.paid);
    money("Refunded to customers", t.refunded);
    money("Kept after refunds", t.paid - t.refunded, true);
    sm.addRow([]);
    sm.addRow(["ON SITE (completed jobs)"]).font = { bold: true };
    money("Billed", t.billed);
    money("Collected (cash / UPI)", t.collected);
    const out = money("Still to collect", t.outstanding, true);
    if (t.outstanding > 0) out.getCell(2).font = { bold: true, color: { argb: "FFB91C1C" } };
    sm.addRow([]);
    money("TOTAL RECEIVED (online kept + on site collected)", t.paid - t.refunded + t.collected, true);
    sm.addRow([]);
    sm.addRow(["Note: figures are for visits in the date range. Online amounts are what customers paid for those bookings."]).font = { italic: true, color: { argb: "FF6B7280" } };

    // ---------- Technicians ----------
    const wt = wb.addWorksheet("Technicians");
    wt.columns = [
      { header: "Technician", key: "n" }, { header: "Jobs", key: "jobs" }, { header: "Completed", key: "completed" },
      { header: "Billed on site", key: "billed" }, { header: "Collected", key: "collected" }, { header: "Still to collect", key: "outstanding" },
    ];
    for (const [n, p] of perTech) wt.addRow({ n, ...p });
    styleSheet(wt, [24, 8, 12, 16, 16, 16], [4, 5, 6]);

    // ---------- Online payments ----------
    const wp = wb.addWorksheet("Online payments");
    wp.columns = [
      { header: "Booking #", key: "booking_id" }, { header: "Paid on", key: "at" }, { header: "Amount", key: "amount" },
      { header: "Status", key: "status" }, { header: "Razorpay payment id", key: "pid" }, { header: "Razorpay order id", key: "oid" },
    ];
    const pays = await pool.query(
      `SELECT p.booking_id, to_char(p.created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS at, p.amount, p.status,
              p.razorpay_payment_id AS pid, p.razorpay_order_id AS oid
       FROM payments p WHERE p.status IN ('success','refunded')
         AND (p.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2 ORDER BY p.id`,
      [from, to]
    );
    pays.rows.forEach((p) => wp.addRow({ ...p, amount: Number(p.amount) }));
    styleSheet(wp, [10, 18, 12, 12, 28, 28], [3]);

    // ---------- Refunds ----------
    const wr = wb.addWorksheet("Refunds");
    wr.columns = [
      { header: "Refund #", key: "id" }, { header: "Booking #", key: "booking_id" }, { header: "Date", key: "at" },
      { header: "Customer", key: "customer" }, { header: "Amount", key: "amount" }, { header: "Status", key: "status" },
      { header: "By", key: "by" }, { header: "Reason", key: "reason" }, { header: "Failure reason", key: "fail" },
    ];
    const rf = await pool.query(
      `SELECT r.id, r.booking_id, to_char(r.created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS at, u.name AS customer,
              r.amount, r.status, r.initiated_by_role AS by, r.reason, r.failure_reason AS fail
       FROM refunds r JOIN bookings b ON b.id=r.booking_id JOIN users u ON u.id=b.customer_id
       WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2 ORDER BY r.id`,
      [from, to]
    );
    rf.rows.forEach((x) => wr.addRow({ ...x, amount: Number(x.amount) }));
    styleSheet(wr, [9, 10, 18, 20, 12, 12, 10, 40, 36], [5]);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="servicebook-${from}-to-${to}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    if (res.headersSent) return res.end();
    sendError(res, err, "Export");
  }
}

// GET /api/reports/admin/unpaid  -> completed jobs where the customer hasn't paid on site yet
export async function adminUnpaid(req, res) {
  try {
    const r = await pool.query(
      `SELECT b.id AS booking_id, u.name AS customer, u.phone, s.name AS service, c.amount_due,
              to_char(b.slot_date,'YYYY-MM-DD') AS slot_date, t.name AS technician
       FROM job_completions c
       JOIN bookings b ON b.id = c.booking_id
       JOIN users u ON u.id = b.customer_id
       JOIN services s ON s.id = b.service_id
       LEFT JOIN technicians t ON t.id = b.technician_id
       WHERE b.status = 'COMPLETED' AND c.payment_mode = 'PENDING'
       ORDER BY b.slot_date, b.id LIMIT 200`
    );
    res.json({ unpaid: r.rows, total: r.rows.reduce((a, x) => a + Number(x.amount_due), 0) });
  } catch (err) {
    sendError(res, err, "Unpaid list");
  }
}