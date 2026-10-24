import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client.js";

const STATUS_STYLE = {
  PROCESSED: "bg-green-500/15 text-green-300 border-green-500/30",
  INITIATED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  FAILED: "bg-red-500/15 text-red-300 border-red-500/30",
};
const STATUS_LABEL = { PROCESSED: "Refunded", INITIATED: "In progress", FAILED: "Failed" };

// Every refund the system has tried, with the reason. Failed ones can be retried here.
export default function AdminRefunds({ initialStatus = "" }) {
  const [status, setStatus] = useState(initialStatus);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryingId, setRetryingId] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/refunds/admin${status ? `?status=${status}` : ""}`);
      setRefunds(data.refunds);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load refunds.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function retry(r) {
    setError("");
    setNotice("");
    setRetryingId(r.id);
    try {
      await apiClient.post(`/refunds/admin/${r.id}/retry`);
      setNotice(`Refund of ₹${r.amount} to ${r.customer_name} started.`);
    } catch (err) {
      setError(err.response?.data?.message || "Retry failed.");
    } finally {
      setRetryingId(null);
      load();
    }
  }

  return (
    <section>
      <div className="flex flex-wrap gap-2 mb-5">
        {[["", "All"], ["FAILED", "Failed"], ["INITIATED", "In progress"], ["PROCESSED", "Refunded"]].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setStatus(v)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              status === v ? "bg-brand-accent text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && <div className="mb-4 text-sm text-green-300 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">{notice}</div>}
      {error && <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</div>}

      {loading ? (
        <p className="text-white/40 text-sm">Loading...</p>
      ) : refunds.length === 0 ? (
        <p className="text-white/40 text-sm">No refunds to show.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {refunds.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex justify-between items-start gap-3 mb-1.5">
                <div>
                  <div className="font-display font-semibold">
                    ₹{r.amount} · {r.customer_name}
                  </div>
                  <div className="text-xs text-white/50">
                    Booking #{r.booking_id} · {r.service_name} · {r.customer_phone}
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <p className="text-xs text-white/60">{r.reason}</p>
              {r.failure_reason && <p className="text-xs text-red-300 mt-1.5">Razorpay said: {r.failure_reason}</p>}
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[11px] text-white/35">
                  {new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · by {r.initiated_by_role}
                </span>
                {r.status === "FAILED" && (
                  <button
                    onClick={() => retry(r)}
                    disabled={retryingId === r.id}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60"
                  >
                    {retryingId === r.id ? "Retrying..." : "Retry refund"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}