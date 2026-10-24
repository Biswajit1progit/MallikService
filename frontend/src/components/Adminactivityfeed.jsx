import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client.js";

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "attention", label: "Needs attention" },
  { id: "technician", label: "Technician" },
  { id: "customer", label: "Customers" },
  { id: "admin", label: "Admin" },
];

const ICONS = {
  payment_received: "💳",
  status_changed: "🔄",
  call_started: "📞",
  call_overdue: "⏰",
  call_result: "📞",
  customer_no_call: "🚩",
  assigned: "👤",
  rescheduled: "📅",
  booking_cancelled: "✖️",
  completion_submitted: "📝",
  completion_resubmitted: "📝",
  completion_approved: "✅",
  completion_approved_by_admin: "✅",
  completion_disputed: "⚠️",
  issue_reported: "🚩",
  refund_issued: "💸",
  refund_failed: "❗",
  payment_orphaned: "❗",
  technician_created: "🧰",
  technician_updated: "🧰",
};

const ROLE_STYLES = {
  technician: "bg-blue-500/15 text-blue-300",
  customer: "bg-white/10 text-white/70",
  admin: "bg-brand-cool/15 text-brand-cool",
  system: "bg-white/5 text-white/40",
};

function timeAgo(iso) {
  const sec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Everything every technician, customer and admin did, newest first. Refreshes by itself.
export default function AdminActivityFeed({ initialFilter = "all", onChanged }) {
  const [filter, setFilter] = useState(initialFilter);
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [attentionCount, setAttentionCount] = useState(0);

  const query = useCallback(
    (before) => {
      const p = new URLSearchParams({ limit: "30" });
      if (filter === "attention") p.set("attention", "1");
      else if (filter !== "all") p.set("role", filter);
      if (before) p.set("before", before);
      return `/activity/admin?${p.toString()}`;
    },
    [filter]
  );

  const load = useCallback(
    async (spinner = false) => {
      if (spinner) setLoading(true);
      try {
        const { data } = await apiClient.get(query());
        setItems(data.activities);
        setNext(data.nextBefore);
        setAttentionCount(data.attentionCount);
        setError("");
      } catch (err) {
        setError(err.response?.data?.message || "Couldn't load the activity feed.");
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(false);
    }, 20000);
    return () => clearInterval(t);
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const { data } = await apiClient.get(query(next));
      setItems((prev) => [...prev, ...data.activities]);
      setNext(data.nextBefore);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function acknowledge(id) {
    try {
      await apiClient.post(`/activity/admin/${id}/ack`);
      await load(false);
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't mark this as seen.");
    }
  }

  async function acknowledgeAll() {
    try {
      await apiClient.post("/activity/admin/ack-all");
      await load(false);
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't mark these as seen.");
    }
  }

  return (
    <section>
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.id ? "bg-brand-accent text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {f.label}
            {f.id === "attention" && attentionCount > 0 && (
              <span className="ml-1.5 inline-block min-w-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] text-center">
                {attentionCount}
              </span>
            )}
          </button>
        ))}
        {attentionCount > 0 && (
          <button onClick={acknowledgeAll} className="ml-auto text-xs text-white/50 hover:text-white underline underline-offset-2">
            Mark all seen
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</div>
      )}

      {loading ? (
        <p className="text-white/40 text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-white/40 text-sm">
          {filter === "attention" ? "Nothing needs your attention right now." : "No activity yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((a) => {
            const flagged = a.needs_attention && !a.acknowledged_at;
            return (
              <li
                key={a.id}
                className={`rounded-xl border p-3.5 flex gap-3 ${
                  flagged ? "border-red-500/30 bg-red-500/[0.07]" : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="text-lg leading-none pt-0.5" aria-hidden>
                  {ICONS[a.action] || "•"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/85 leading-snug break-words">{a.summary}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-white/40">
                    <span className={`px-2 py-0.5 rounded-full ${ROLE_STYLES[a.actor_role] || ROLE_STYLES.system}`}>
                      {a.actor_name || a.actor_role}
                    </span>
                    {a.booking_id && <span className="font-mono">#{a.booking_id}</span>}
                    <span>{timeAgo(a.created_at)}</span>
                    {flagged && (
                      <button
                        onClick={() => acknowledge(a.id)}
                        className="ml-auto text-xs font-semibold text-red-200 hover:text-white underline underline-offset-2"
                      >
                        Mark seen
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {next && !loading && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-5 w-full py-2.5 rounded-lg border border-white/15 text-sm hover:bg-white/5 disabled:opacity-60"
        >
          {loadingMore ? "Loading..." : "Load older activity"}
        </button>
      )}
    </section>
  );
}