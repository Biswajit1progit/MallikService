import { useState, useEffect } from "react";
import { apiClient } from "../api/client.js";

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// Customer-facing job report. Shows what was done, the bill and the photos.
// `canRespond` adds the Approve / Raise-an-issue buttons (job awaiting approval).
export default function CompletionReview({ bookingId, canRespond, onChanged }) {
  const [report, setReport] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showIssue, setShowIssue] = useState(false);
  const [issueNote, setIssueNote] = useState("");

  async function load() {
    try {
      const { data } = await apiClient.get(`/completions/booking/${bookingId}`);
      setReport(data);
    } catch (err) {
      setLoadError(err.response?.data?.message || "Couldn't load the job report.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function approve() {
    setActionError("");
    setBusy(true);
    try {
      await apiClient.post(`/completions/booking/${bookingId}/approve`);
      await load();
      onChanged();
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't approve right now.");
    } finally {
      setBusy(false);
    }
  }

  async function raiseIssue() {
    setActionError("");
    setBusy(true);
    try {
      await apiClient.post(`/completions/booking/${bookingId}/dispute`, { note: issueNote });
      setShowIssue(false);
      await load();
      onChanged();
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't send your issue right now.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="text-xs text-red-300 mt-3">{loadError}</p>;
  if (!report) return <p className="text-xs text-white/40 mt-3">Loading report...</p>;

  const { completion: c, warranty } = report;
  const waiting = canRespond && c.customer_status === "PENDING";

  return (
    <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-4 text-sm">
      <div>
        <div className="text-xs text-white/45 mb-1">Work done</div>
        <p className="text-white/85 whitespace-pre-line">{c.work_summary}</p>
      </div>

      {c.parts.length > 0 && (
        <div>
          <div className="text-xs text-white/45 mb-1">Parts</div>
          <div className="space-y-1">
            {c.parts.map((p, i) => (
              <div key={i} className="flex justify-between gap-3 text-white/75">
                <span className="truncate">
                  {p.name} × {p.qty}
                </span>
                <span className="font-mono shrink-0">₹{(p.qty * p.unit_price).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-1.5">
        <div className="flex justify-between text-white/60">
          <span>Parts</span>
          <span className="font-mono">₹{Number(c.parts_total).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-white/60">
          <span>Labour</span>
          <span className="font-mono">₹{Number(c.labour_charge).toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold pt-1.5 border-t border-white/10">
          <span>Amount to pay on site</span>
          <span className="font-mono text-brand-accent">₹{Number(c.amount_due).toFixed(2)}</span>
        </div>
        <div className="text-xs text-white/40">
          {c.payment_mode === "PENDING" ? "Payment not recorded yet" : `Paid by ${c.payment_mode === "CASH" ? "cash" : "UPI"}`}
        </div>
      </div>

      {c.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {c.photos.map((p, i) => (
            <a
              key={i}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="relative aspect-square rounded-lg overflow-hidden border border-white/10"
            >
              <img src={p.url} alt={`${p.label} work`} className="w-full h-full object-cover" />
              <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-center py-0.5 uppercase tracking-wide">
                {p.label}
              </span>
            </a>
          ))}
        </div>
      )}

      {warranty && (
        <div className="rounded-xl border border-brand-cool/30 bg-brand-cool/10 p-4 text-brand-cool">
          🛡 Warranty {warranty.active ? "valid" : "expired"}: {formatDate(warranty.starts_on)} to{" "}
          {formatDate(warranty.expires_on)}
        </div>
      )}

      {c.customer_status === "DISPUTED" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 text-xs">
          You raised an issue: "{c.customer_note}". We'll contact you and correct the report.
        </div>
      )}

      {actionError && <p className="text-xs text-red-300">{actionError}</p>}

      {waiting && !showIssue && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-white/45 leading-relaxed">
            By approving you confirm the work is done and agree to the charges above. Your warranty starts today.
          </p>
          <div className="flex gap-3">
            <button
              onClick={approve}
              disabled={busy}
              className="flex-1 rounded-lg bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 text-sm font-semibold py-3 transition-colors"
            >
              {busy ? "Approving..." : "Approve work"}
            </button>
            <button
              onClick={() => setShowIssue(true)}
              disabled={busy}
              className="px-4 rounded-lg border border-white/15 text-sm text-white/70 hover:bg-white/5"
            >
              Raise an issue
            </button>
          </div>
        </div>
      )}

      {waiting && showIssue && (
        <div className="flex flex-col gap-2">
          <textarea
            value={issueNote}
            onChange={(e) => setIssueNote(e.target.value)}
            rows={3}
            placeholder="What doesn't look right? e.g. a part wasn't replaced, or the amount is wrong"
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-brand-cool resize-none"
          />
          <div className="flex gap-3">
            <button
              onClick={raiseIssue}
              disabled={busy}
              className="flex-1 rounded-lg bg-red-500/80 hover:bg-red-500 disabled:opacity-60 text-sm font-semibold py-2.5"
            >
              {busy ? "Sending..." : "Send issue"}
            </button>
            <button
              onClick={() => setShowIssue(false)}
              className="px-4 rounded-lg border border-white/15 text-sm text-white/70 hover:bg-white/5"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}