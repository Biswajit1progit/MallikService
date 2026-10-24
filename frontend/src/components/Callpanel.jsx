import { useState, useEffect } from "react";
import { apiClient } from "../api/client.js";

// The confirmation-call step for a SCHEDULED visit. The technician cannot just tap
// "confirmed": he must (1) tap Call customer, which records the time on the server so the
// admin can see it, (2) talk, (3) record what happened. The server also refuses
// "Customer confirmed" if the call was shorter than MIN_SECONDS.
const MIN_SECONDS = 20; // keep the same as MIN_CALL_SECONDS in technicianController.js

const OUTCOMES = [
  { value: "CONFIRMED", label: "Customer confirmed the visit", style: "bg-brand-accent hover:bg-brand-accent-hover" },
  { value: "NO_ANSWER", label: "No answer", style: "border border-white/15 hover:bg-white/5" },
  { value: "WRONG_NUMBER", label: "Wrong number / phone off", style: "border border-white/15 hover:bg-white/5" },
  { value: "WANTS_RESCHEDULE", label: "Customer wants another day", style: "border border-white/15 hover:bg-white/5" },
];

function dueText(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, new Date())) return `today ${time}`;
  if (same(d, new Date(Date.now() + 86400000))) return `tomorrow ${time}`;
  return `${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

const LAST_RESULT_TEXT = {
  NO_ANSWER: "No answer",
  WRONG_NUMBER: "Wrong number or phone off",
  WANTS_RESCHEDULE: "Customer wants another day",
};

export default function CallPanel({ job, onChanged, onError }) {
  // A call is "open" when it was started but no result has been recorded yet.
  const callOpen = job.last_call_at && !job.last_call_outcome;
  const [startedAtMs, setStartedAtMs] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [needsNote, setNeedsNote] = useState(false);
  const [note, setNote] = useState("");

  // When the job reloads with an open call, rebuild the start time from the server's clock.
  useEffect(() => {
    if (callOpen) setStartedAtMs(Date.now() - (job.call_open_seconds || 0) * 1000);
    else setStartedAtMs(null);
  }, [callOpen, job.call_open_seconds, job.last_call_at]);

  useEffect(() => {
    if (!callOpen) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [callOpen]);

  const elapsed = startedAtMs ? Math.max(0, Math.floor((now - startedAtMs) / 1000)) : 0;
  const waitLeft = Math.max(0, MIN_SECONDS - elapsed);

  async function startCall() {
    onError("");
    setBusy(true);
    try {
      const { data } = await apiClient.post(`/technician/jobs/${job.id}/call/start`);
      await onChanged();
      // Open the phone's dialer. This must happen right after the tap.
      window.location.href = `tel:${data.phone}`;
    } catch (err) {
      onError(err.response?.data?.message || "Couldn't start the call. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function record(outcome) {
    if (outcome === "WANTS_RESCHEDULE" && !needsNote) {
      setNeedsNote(true); // ask which day first
      return;
    }
    onError("");
    setBusy(true);
    try {
      await apiClient.post(`/technician/jobs/${job.id}/call/outcome`, {
        outcome,
        note: note.trim() || undefined,
      });
      setNeedsNote(false);
      setNote("");
      await onChanged();
    } catch (err) {
      onError(err.response?.data?.message || "Couldn't save the result. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 mb-2">
      <div className="text-xs font-semibold text-white/80 mb-2">Confirmation call</div>
      {job.call_due_at && (
        <p className={`text-[11px] mb-2 ${job.call_overdue ? "text-red-300 font-semibold" : "text-white/45"}`}>
          {job.call_overdue ? "Overdue. " : ""}Customer must be called by {dueText(job.call_due_at)}
        </p>
      )}

      {!callOpen && (
        <>
          <button
            onClick={startCall}
            disabled={busy}
            className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 transition-colors"
          >
            {busy ? "Starting..." : `📞 Call ${job.customer_phone}`}
          </button>
          <p className="text-[11px] text-white/40 mt-1.5">
            Tap this to call. The shop sees that you called. After the call, record what happened.
          </p>
          {job.last_call_outcome && job.last_call_outcome !== "CONFIRMED" && (
            <p className="text-[11px] text-amber-300 mt-2">
              Last call: {LAST_RESULT_TEXT[job.last_call_outcome]} ({job.call_attempts} attempt
              {job.call_attempts === 1 ? "" : "s"}). Try again later.
            </p>
          )}
        </>
      )}

      {callOpen && (
        <>
          <p className="text-[11px] text-white/55 mb-2.5">
            Call started {elapsed}s ago. What happened on the call?
          </p>
          <div className="flex flex-col gap-2">
            {OUTCOMES.map((o) => {
              const waiting = o.value === "CONFIRMED" && waitLeft > 0;
              return (
                <button
                  key={o.value}
                  onClick={() => record(o.value)}
                  disabled={busy || waiting}
                  className={`px-4 py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors ${o.style}`}
                >
                  {waiting ? `${o.label} (wait ${waitLeft}s)` : o.label}
                </button>
              );
            })}
          </div>
          {needsNote && (
            <div className="mt-3 flex flex-col gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="Which day or time does the customer want?"
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-brand-cool"
              />
              <button
                onClick={() => record("WANTS_RESCHEDULE")}
                disabled={busy || note.trim().length < 5}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-50"
              >
                Save and tell the shop
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}