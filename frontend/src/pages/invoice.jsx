import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../api/client.js";

const rupee = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

// A printable bill. "Print / Save as PDF" uses the browser's own print dialog, so there is
// nothing to install and the customer gets a real PDF on any phone or laptop.
export default function Invoice() {
  const { bookingId, kind } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let off = false;
    apiClient
      .get(`/invoices/booking/${bookingId}/${kind}`)
      .then(({ data }) => !off && setInv(data.invoice))
      .catch((err) => !off && setError(err.response?.data?.message || "Couldn't load this document."));
    return () => {
      off = true;
    };
  }, [bookingId, kind]);

  return (
    <div className="min-h-screen bg-neutral-200 py-6 px-3 print:bg-white print:p-0">
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 14mm; } }`}</style>

      <div className="no-print max-w-2xl mx-auto mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-sm text-neutral-700 hover:underline">← Back</button>
        {inv && (
          <button onClick={() => window.print()} className="bg-neutral-900 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            Print / Save as PDF
          </button>
        )}
      </div>

      {error && <p className="max-w-2xl mx-auto bg-white rounded-xl p-6 text-neutral-800">{error}</p>}
      {!error && !inv && <p className="max-w-2xl mx-auto text-neutral-600">Loading…</p>}

      {inv && (
        <div className="max-w-2xl mx-auto bg-white text-neutral-900 rounded-xl shadow p-6 sm:p-10 print:shadow-none print:rounded-none">
          <div className="flex justify-between gap-4 border-b border-neutral-300 pb-4">
            <div>
              <h1 className="text-xl font-bold">{inv.business.name}</h1>
              {inv.business.address && <p className="text-sm text-neutral-600 whitespace-pre-line">{inv.business.address}</p>}
              {inv.business.phone && <p className="text-sm text-neutral-600">Phone: {inv.business.phone}</p>}
              {inv.business.gstin && <p className="text-sm text-neutral-600">GSTIN: {inv.business.gstin}</p>}
            </div>
            <div className="text-right">
              <p className="text-lg font-bold uppercase tracking-wide">{inv.title}</p>
              <p className="text-sm">No. {inv.number}</p>
              <p className="text-sm text-neutral-600">{dateText(inv.issuedAt)}</p>
              <span
                className={`inline-block mt-2 text-xs font-bold px-2 py-0.5 rounded ${
                  inv.payment.status === "PAID" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}
              >
                {inv.payment.status === "PAID" ? "PAID" : "PAYMENT DUE"}
              </span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 py-4 text-sm">
            <div>
              <p className="text-xs uppercase text-neutral-500 mb-1">Billed to</p>
              <p className="font-semibold">{inv.customer.name}</p>
              {inv.customer.phone && <p>{inv.customer.phone}</p>}
              <p className="text-neutral-600">{inv.customer.address}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-neutral-500 mb-1">Service</p>
              <p className="font-semibold">{inv.booking.service}</p>
              <p>Booking #{inv.booking.id}</p>
              <p className="text-neutral-600">
                Visit: {inv.booking.date} {inv.booking.time}
                {inv.booking.technician ? ` · ${inv.booking.technician}` : ""}
              </p>
            </div>
          </div>

          {inv.workSummary && (
            <p className="text-sm bg-neutral-50 border border-neutral-200 rounded p-3 mb-4">
              <span className="font-semibold">Work done: </span>
              {inv.workSummary}
            </p>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500 text-xs uppercase">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Rate</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-2 pr-2">{l.description}</td>
                  <td className="py-2 text-right">{l.qty}</td>
                  <td className="py-2 text-right">{rupee(l.unitPrice)}</td>
                  <td className="py-2 text-right">{rupee(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 ml-auto w-full sm:w-72 text-sm space-y-1">
            {inv.subtotal != null && inv.credit > 0 && (
              <>
                <div className="flex justify-between"><span>Job total</span><span>{rupee(inv.subtotal)}</span></div>
                <div className="flex justify-between"><span>Less: booking charge paid</span><span>− {rupee(inv.credit)}</span></div>
              </>
            )}
            {inv.tax && (
              <>
                <div className="flex justify-between text-neutral-600"><span>Taxable value</span><span>{rupee(inv.tax.taxable)}</span></div>
                <div className="flex justify-between text-neutral-600"><span>CGST @ {inv.tax.rate / 2}%</span><span>{rupee(inv.tax.cgst)}</span></div>
                <div className="flex justify-between text-neutral-600"><span>SGST @ {inv.tax.rate / 2}%</span><span>{rupee(inv.tax.sgst)}</span></div>
              </>
            )}
            <div className="flex justify-between border-t border-neutral-300 pt-2 text-base font-bold">
              <span>Total</span><span>{rupee(inv.total)}</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Payment</span>
              <span>
                {inv.payment.method}
                {inv.payment.reference ? ` · ${inv.payment.reference}` : ""}
              </span>
            </div>
          </div>

          {inv.refunds?.length > 0 && (
            <div className="mt-4 text-sm bg-amber-50 border border-amber-200 rounded p-3">
              {inv.refunds.map((r, i) => (
                <p key={i}>
                  Refund of {rupee(r.amount)} {r.status === "PROCESSED" ? "issued" : "in progress"} on {dateText(r.at)}.
                </p>
              ))}
            </div>
          )}

          {inv.notes?.length > 0 && (
            <ul className="mt-5 text-xs text-neutral-600 space-y-1 list-disc pl-4">
              {inv.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          <p className="mt-6 text-center text-xs text-neutral-400">This is a computer-generated document.</p>
        </div>
      )}
    </div>
  );
}