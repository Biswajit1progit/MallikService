import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../api/client.js";
import { useAuth } from "../context/authcontext.jsx";
import { useLocationSharing } from "../utils/useLocationSharing.js";
import StatusBadge from "../components/statusBadge.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import CompletionForm from "../components/Completionform.jsx";
import CallPanel from "../components/Callpanel.jsx";
import BrandName from "../components/Brandname.jsx";

// The ONE next step per status. A technician never sees a menu of every status.
const NEXT_STEP = {
  // SCHEDULED has no one-tap step: it uses <CallPanel />, which records the call first.
  CALL_CONFIRMED: { next: "ON_THE_WAY", label: "Start trip", hint: "Starts live tracking for the customer." },
  ON_THE_WAY: { next: "IN_PROGRESS", label: "I've arrived, start work" },
};

const ISSUE_TYPES = [
  { value: "CUSTOMER_UNREACHABLE", label: "Customer not reachable" },
  { value: "ADDRESS_PROBLEM", label: "Can't find the address" },
  { value: "NEED_PARTS", label: "Need parts or tools" },
  { value: "OTHER", label: "Something else" },
];

const TABS = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "history", label: "Done" },
];

const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);

export default function TechnicianDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("today");
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [completionTarget, setCompletionTarget] = useState(null); // { job, initial }
  const [noteTarget, setNoteTarget] = useState(null); // { job, mode: "noshow" | "issue" }

  const { sharingId, start: startSharing, stop: stopSharing } = useLocationSharing(setError);

  const load = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      try {
        const [j, me] = await Promise.all([
          apiClient.get(`/technician/jobs?scope=${tab}`),
          apiClient.get("/technician/me"),
        ]);
        setJobs(j.data.jobs);
        setStats(me.data.stats);
        setProfile(me.data.technician);
        setError((prev) => (prev.startsWith("Couldn't load") ? "" : prev));
      } catch (err) {
        setError(err.response?.data?.message || "Couldn't load your jobs. Pull down to try again.");
      } finally {
        setLoading(false);
      }
    },
    [tab]
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // The admin may re-assign or reschedule while the technician is out, so refresh quietly.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load(false);
    }, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function changeStatus(job, status, note, opts = {}) {
    setError("");
    setBusyId(job.id);
    try {
      const { data } = await apiClient.patch(`/technician/jobs/${job.id}/status`, { status, note });
      if (status === "ON_THE_WAY") startSharing(job.id); // the tap is the user gesture the browser needs
      if (job.status === "ON_THE_WAY" && status !== "ON_THE_WAY" && sharingId === job.id) stopSharing();
      await load(false);
      return data;
    } catch (err) {
      const msg = err.response?.data?.message || "Couldn't update this job. Try again.";
      if (opts.rethrow) throw new Error(msg); // the modal shows it next to the button
      setError(msg);
      return null;
    } finally {
      setBusyId(null);
    }
  }

  async function openFixReport(job) {
    setError("");
    try {
      const { data } = await apiClient.get(`/completions/booking/${job.id}`);
      setCompletionTarget({ job, initial: data.completion });
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load the report.");
    }
  }

  async function copyLink(job) {
    try {
      await navigator.clipboard.writeText(job.trackingUrl);
    } catch {
      window.prompt("Copy this tracking link:", job.trackingUrl);
    }
    setCopiedId(job.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function whatsapp(job) {
    const text = `Hi ${job.customer_name}, your technician is on the way! Track live here: ${job.trackingUrl}`;
    window.open(`https://wa.me/91${digits(job.customer_phone)}?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function handleLogout() {
    stopSharing();
    await logout();
    navigate("/login");
  }

  const onTheWayNotSharing = jobs.find((j) => j.status === "ON_THE_WAY" && sharingId !== j.id);

  return (
    <div className="min-h-screen bg-ink text-white relative overflow-x-clip">
      <div className="pointer-events-none fixed -top-32 left-1/4 w-72 h-72 bg-mist-a blur-3xl" />

      <header className="sticky top-0 z-30 bg-ink/85 flex justify-between items-center px-5 py-4 border-b border-white/10 backdrop-blur-md">
        <div>
          <div className="font-display font-bold text-lg leading-tight">
          <BrandName /> <span className="text-brand-accent text-sm font-normal">Technician</span>

          </div>
          <div className="text-xs text-white/50">{profile?.name || user?.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            onClick={handleLogout}
            className="px-3 py-2 rounded-lg border border-white/15 text-xs bg-white/5 hover:bg-white/10 transition-colors"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="relative z-10 px-4 sm:px-6 py-6 max-w-xl mx-auto">
        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Stat label="Jobs today" value={stats.jobs_today} />
            <Stat label="On site now" value={stats.on_site_now} color="text-brand-cool" />
            <Stat label="Done today" value={stats.done_today} color="text-brand-accent" />
          </div>
        )}

        {onTheWayNotSharing && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <p className="text-amber-200 mb-3">
              Location sharing is off, so {onTheWayNotSharing.customer_name} can't see you on the map.
            </p>
            <button
              onClick={() => startSharing(onTheWayNotSharing.id)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-100 border border-amber-500/40 hover:bg-amber-500/30"
            >
              Turn on location sharing
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-brand-accent text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-5 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-white/40 text-sm">Loading...</p>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/50">
            {tab === "today" && "No jobs for today. Enjoy the break."}
            {tab === "upcoming" && "No upcoming jobs assigned to you yet."}
            {tab === "history" && "Finished jobs will show up here."}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {jobs.map((job) => {
              const step = NEXT_STEP[job.status];
              const busy = busyId === job.id;
              const closed = ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(job.status);
              const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${job.address_lat},${job.address_lng}`;

              return (
                <div key={job.id} className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-5">
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="font-display font-semibold text-base">{job.customer_name}</div>
                      <div className="text-sm text-white/70">{job.service_name}</div>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-white/55 mb-3">
                    <span>
                      {job.slot_date} · {String(job.slot_time).slice(0, 5)}
                    </span>
                    <span>{job.distance_km} km</span>
                    {job.is_overdue && <span className="text-amber-300">Missed, ask the admin</span>}
                  </div>

                  <p className="text-sm text-white/65 mb-3">{job.address_text}</p>

                  {!closed && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {job.status !== "SCHEDULED" && (
                        <a
                          href={`tel:${job.customer_phone}`}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-brand-cool/15 text-brand-cool border border-brand-cool/30"
                        >
                          Call {job.customer_phone}
                        </a>
                      )}
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-white/15 hover:bg-white/5"
                      >
                        Directions
                      </a>
                      <a
                        href={`https://wa.me/91${digits(job.customer_phone)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30"
                      >
                        WhatsApp
                      </a>
                    </div>
                  )}

                  {job.status === "CONFIRMED" && (
                    <p className="text-xs text-white/45">Waiting for the shop to confirm the schedule.</p>
                  )}

                  {job.status === "SCHEDULED" && (
                    <CallPanel job={job} onChanged={() => load(false)} onError={setError} />
                  )}

                  {step && (
                    <div className="mb-2">
                      <button
                        onClick={() => changeStatus(job, step.next)}
                        disabled={busy}
                        className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 transition-colors"
                      >
                        {busy ? "Updating..." : step.label}
                      </button>
                      {step.hint && <p className="text-[11px] text-white/40 mt-1.5">{step.hint}</p>}
                    </div>
                  )}

                  {job.status === "ON_THE_WAY" && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {sharingId === job.id ? (
                        <button
                          onClick={stopSharing}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-brand-cool/15 text-brand-cool border border-brand-cool/30 animate-pulse"
                        >
                          ● Sharing location, tap to stop
                        </button>
                      ) : (
                        <button
                          onClick={() => startSharing(job.id)}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-white/15 hover:bg-white/5"
                        >
                          Share my location
                        </button>
                      )}
                      {job.trackingUrl && (
                        <>
                          <button
                            onClick={() => copyLink(job)}
                            className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-white/15 hover:bg-white/5"
                          >
                            {copiedId === job.id ? "✓ Copied" : "Copy tracking link"}
                          </button>
                          <button
                            onClick={() => whatsapp(job)}
                            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30"
                          >
                            Send link on WhatsApp
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setNoteTarget({ job, mode: "noshow" })}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-red-500/30 text-red-300 hover:bg-red-500/10"
                      >
                        Customer not available
                      </button>
                    </div>
                  )}

                  {job.status === "IN_PROGRESS" && (
                    <button
                      onClick={() => setCompletionTarget({ job, initial: null })}
                      className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover transition-colors"
                    >
                      Finish job and write report
                    </button>
                  )}

                  {job.status === "PENDING_APPROVAL" && (
                    <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 text-xs text-purple-200/90">
                      {job.completion_status === "DISPUTED" ? (
                        <>
                          <p className="mb-2">Customer raised an issue: "{job.completion_note}"</p>
                          <button
                            onClick={() => openFixReport(job)}
                            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30"
                          >
                            Fix report and resubmit
                          </button>
                        </>
                      ) : (
                        <p>Report sent (₹{job.completion_total}). Waiting for the customer to approve.</p>
                      )}
                    </div>
                  )}

                  {job.status === "COMPLETED" && (
                    <p className="text-xs text-green-300/90">Approved by customer · job total ₹{job.completion_total}</p>
                  )}

                  {!closed && job.status !== "CONFIRMED" && (
                    <button
                      onClick={() => setNoteTarget({ job, mode: "issue" })}
                      className="mt-3 text-xs text-white/45 hover:text-white/70 underline underline-offset-2"
                    >
                      Report a problem to the shop
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-white/30 mt-10">
          <Link to="/policies" className="hover:text-white/60 underline underline-offset-2">
            Shop policies
          </Link>
        </p>
      </main>

      {completionTarget && (
        <CompletionForm
          booking={completionTarget.job}
          initial={completionTarget.initial}
          onClose={() => setCompletionTarget(null)}
          onSubmitted={() => {
            if (sharingId === completionTarget.job.id) stopSharing();
            setCompletionTarget(null);
            load(false);
          }}
        />
      )}

      {noteTarget && (
        <NoteModal
          mode={noteTarget.mode}
          job={noteTarget.job}
          onClose={() => setNoteTarget(null)}
          onNoShow={async (note) => {
            await changeStatus(noteTarget.job, "NO_SHOW", note, { rethrow: true });
            setNoteTarget(null);
          }}
          onIssue={async (type, note) => {
            try {
              await apiClient.post(`/technician/jobs/${noteTarget.job.id}/issue`, { type, note });
              setNoteTarget(null);
              return true;
            } catch (err) {
              throw new Error(err.response?.data?.message || "Couldn't send this. Try again.");
            }
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, color = "text-white" }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="text-[11px] text-white/45 mb-1">{label}</div>
      <div className={`font-display text-xl font-bold ${color}`}>{value ?? 0}</div>
    </div>
  );
}

// One modal for both "customer not available" and "report a problem".
function NoteModal({ mode, job, onClose, onNoShow, onIssue }) {
  const [type, setType] = useState("CUSTOMER_UNREACHABLE");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const isNoShow = mode === "noshow";

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (note.trim().length < 5) {
      setErr("Write a few words about what happened.");
      return;
    }
    setSending(true);
    try {
      if (isNoShow) await onNoShow(note.trim());
      else await onIssue(type, note.trim());
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1c28] p-5 shadow-glass"
      >
        <h3 className="font-display font-semibold mb-1">
          {isNoShow ? "Customer not available" : "Report a problem"}
        </h3>
        <p className="text-xs text-white/50 mb-4">
          {job.customer_name} · {job.service_name}
        </p>

        {isNoShow ? (
          <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
            This closes the visit as a no-show. The visit charge is not refunded automatically. The shop will be told
            right away. Only use it after you reached the address and tried calling.
          </p>
        ) : (
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full mb-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-brand-cool"
          >
            {ISSUE_TYPES.map((t) => (
              <option key={t.value} value={t.value} className="bg-ink">
                {t.label}
              </option>
            ))}
          </select>
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={isNoShow ? "For example: door locked, phone switched off since 10am" : "Tell the shop what is wrong"}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-brand-cool mb-3"
        />
        {err && <p className="text-xs text-red-300 mb-3">{err}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={sending}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60 ${
              isNoShow ? "bg-red-500/80 hover:bg-red-500" : "bg-brand-accent hover:bg-brand-accent-hover"
            }`}
          >
            {sending ? "Sending..." : isNoShow ? "Mark as no-show" : "Send to shop"}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg border border-white/15 text-sm hover:bg-white/5">
            Back
          </button>
        </div>
      </form>
    </div>
  );
}