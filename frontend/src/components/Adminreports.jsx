import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client.js";

const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + "01";

// Money reports: Excel download + the list of jobs finished but not yet paid for.
export default function AdminReports({ onChanged }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unpaid, setUnpaid] = useState({ unpaid: [], total: 0 });
  const [savingId, setSavingId] = useState(null);

  const loadUnpaid = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/reports/admin/unpaid");
      setUnpaid(data);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load unpaid jobs.");
    }
  }, []);
  useEffect(() => {
    loadUnpaid();
  }, [loadUnpaid]);

  async function download() {
    setError("");
    setBusy(true);
    try {
      const res = await apiClient.get(`/reports/admin/export?from=${from}&to=${to}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `servicebook-${from}-to-${to}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // with responseType blob the server's JSON error arrives as a Blob
      let msg = "Download failed. Please try again.";
      try {
        msg = JSON.parse(await err.response.data.text()).message || msg;
      } catch {
        /* keep default */
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function collect(id, mode) {
    setError("");
    setSavingId(id);
    try {
      await apiClient.post(`/invoices/admin/booking/${id}/collected`, { mode });
      await loadUnpaid();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save that.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h2 className="font-display font-bold text-lg mb-1">Excel report</h2>
        <p className="text-sm text-white/55 mb-4">
          One file with Summary, Bookings, Technicians, Online payments and Refunds. Choose the visit dates.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-white/60">
            From
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="block mt-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-xs text-white/60">
            To
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
              className="block mt-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white" />
          </label>
          <button onClick={download} disabled={busy || !from || !to}
            className="bg-brand-accent text-white font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-50">
            {busy ? "Preparing…" : "Download Excel"}
          </button>
        </div>
      </section>

      <section className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h2 className="font-display font-bold text-lg mb-1">Finished but not paid yet</h2>
        <p className="text-sm text-white/55 mb-4">
          {unpaid.unpaid.length === 0
            ? "Nothing pending. Every completed job has been paid."
            : `${unpaid.unpaid.length} job(s), ₹${unpaid.total.toLocaleString("en-IN")} still to collect.`}
        </p>
        <div className="space-y-2">
          {unpaid.unpaid.map((u) => (
            <div key={u.booking_id} className="flex flex-wrap items-center justify-between gap-3 bg-white/5 rounded-xl p-3 text-sm">
              <div>
                <p className="font-semibold">#{u.booking_id} · {u.customer} <span className="text-white/45 font-normal">{u.phone}</span></p>
                <p className="text-white/55 text-xs">{u.service} · {u.slot_date}{u.technician ? ` · ${u.technician}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-red-300">₹{Number(u.amount_due).toLocaleString("en-IN")}</span>
                <Link to={`/invoice/${u.booking_id}/final`} className="text-xs text-brand-cool underline">Invoice</Link>
                {["CASH", "UPI"].map((m) => (
                  <button key={m} disabled={savingId === u.booking_id}
                    onClick={() => window.confirm(`Record ₹${u.amount_due} as received by ${m}?`) && collect(u.booking_id, m)}
                    className="text-xs bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 rounded-lg px-3 py-1.5 disabled:opacity-50">
                    Got {m === "CASH" ? "cash" : "UPI"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}