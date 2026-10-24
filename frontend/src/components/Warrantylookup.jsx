import { useState } from "react";
import { apiClient } from "../api/client.js";

// Admin tool for warranty-claim calls: type the customer's phone number and see
// their warranties, what was done and whether each is still valid.
export default function WarrantyLookup() {
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(e) {
    e.preventDefault();
    setError("");
    setResults(null);
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/completions/admin/warranties?phone=${encodeURIComponent(phone)}`);
      setResults(data.warranties);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't search right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="mb-8 rounded-xl border border-white/10 bg-white/[0.03] p-4 group">
      <summary className="cursor-pointer text-sm font-semibold text-white/80 list-none flex justify-between">
        Warranty lookup
        <span className="text-white/40 group-open:rotate-180 transition-transform">⌄</span>
      </summary>
      <form onSubmit={search} className="flex gap-2 mt-4">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="Customer phone number"
          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-brand-cool font-mono"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-60 text-sm font-semibold"
        >
          {loading ? "..." : "Search"}
        </button>
      </form>
      {error && <p className="text-xs text-red-300 mt-3">{error}</p>}
      {results && results.length === 0 && <p className="text-xs text-white/45 mt-3">No warranties found for this number.</p>}
      {results && results.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {results.map((w) => (
            <div key={w.id} className="rounded-lg border border-white/10 p-3 text-sm">
              <div className="flex justify-between gap-2 mb-1">
                <span className="font-semibold">{w.service_name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    w.active
                      ? "bg-green-500/15 text-green-300 border-green-500/30"
                      : "bg-red-500/15 text-red-300 border-red-500/30"
                  }`}
                >
                  {w.active ? "Valid" : "Expired"}
                </span>
              </div>
              <div className="text-xs text-white/50">
                {w.customer_name} · {w.customer_phone}
              </div>
              <div className="text-xs font-mono text-white/60 mt-1">
                {w.starts_on} → {w.expires_on} (booking #{w.booking_id})
              </div>
              <p className="text-xs text-white/55 mt-1.5">{w.work_summary}</p>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}