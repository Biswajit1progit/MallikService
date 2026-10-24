import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { apiClient, getAccessToken, setAccessToken } from "../api/client.js";
import { useAuth } from "../context/authcontext.jsx";
import { getSocket } from "../utils/socket.js";
import StatusBadge from "../components/statusBadge.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import CompletionForm from "../components/Completionform.jsx";
import WarrantyLookup from "../components/Warrantylookup.jsx";
import AdminOverview from "../components/Adminoverview.jsx";
import AdminActivityFeed from "../components/Adminactivityfeed.jsx";
import AdminTechnicians from "../components/Admintechnicians.jsx";
import AdminRefunds from "../components/Adminrefund.jsx";
import AdminReports from "../components/Adminreports.jsx";

// Single primary next-action per status - keeps the dashboard to one clear
// tap per job instead of a confusing dropdown of every possible status.
const NEXT_ACTION = {
  CONFIRMED: { next: "SCHEDULED", label: "Confirm schedule" },
  SCHEDULED: { next: "CALL_CONFIRMED", label: "Confirm call myself (override)" },
  CALL_CONFIRMED: { next: "ON_THE_WAY", label: "Start heading out" },
  ON_THE_WAY: { next: "IN_PROGRESS", label: "Mark arrived" },
  // IN_PROGRESS and PENDING_APPROVAL are handled by the completion form
  // (report -> customer approval -> warranty), not by a one-tap status change.
};


const CALL_TEXT = {
  CONFIRMED: "customer confirmed",
  NO_ANSWER: "no answer",
  WRONG_NUMBER: "wrong number / phone off",
  WANTS_RESCHEDULE: "customer wants another day",
};
// "Today 6:00 PM" / "Tomorrow 6:00 PM" / "Mon 19 Oct, 6:00 PM"
function dueLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = (x) => x.toDateString();
  const t = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (day(d) === day(t)) return `today ${time}`;
  if (day(d) === day(tomorrow)) return `tomorrow ${time}`;
  return `${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}
const timeOf = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";

const CANCELLABLE = ["PENDING", "CONFIRMED", "SCHEDULED", "CALL_CONFIRMED", "RESCHEDULE_NEEDED"];
// Same list the server uses: a job can be given to another technician until he heads out
const REASSIGNABLE = ["PENDING", "CONFIRMED", "SCHEDULED", "CALL_CONFIRMED", "RESCHEDULE_NEEDED"];

const TABS = [
  { id: "jobs", label: "Jobs" },
  { id: "activity", label: "Activity" },
  { id: "team", label: "Team" },
  { id: "refunds", label: "Refunds" },
  { id: "reports", label: "Reports" },
];

const REFUND_LABEL = {
  INITIATED: "Refund on its way",
  PROCESSED: "Refunded",
  FAILED: "Refund FAILED - open Refunds tab",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("jobs");
  const [navKey, setNavKey] = useState(0); // changes when a tile sends you to a tab, so the tab re-opens with its filter
  const [feedFilter, setFeedFilter] = useState("all");
  const [refundFilter, setRefundFilter] = useState("");
  const [overview, setOverview] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [techFilter, setTechFilter] = useState("");
  const [view, setView] = useState("today"); // "today" | "all"
  const [statusFilter, setStatusFilter] = useState("");
  const [bookings, setBookings] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");
  const [actioningId, setActioningId] = useState(null);
  const [sharingBookingId, setSharingBookingId] = useState(null);
  const [trackingLinks, setTrackingLinks] = useState({}); // { [bookingId]: url }
  const [copiedId, setCopiedId] = useState(null); // booking whose link was just copied
  const [completionTarget, setCompletionTarget] = useState(null); // { booking, initial }
  const watchIdRef = useRef(null);
  const tokenRefreshIntervalRef = useRef(null);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    loadBookings();
    loadEarnings();
  }, [view, statusFilter, techFilter]);

  // Keep the Jobs list fresh: a technician may start a call or record a result while you look.
  useEffect(() => {
    if (tab !== "jobs") return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadBookings(true);
        loadOverview();
      }
    }, 30 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, view, statusFilter, techFilter]);

  useEffect(() => {
    loadOverview();
    loadTechnicians();
    // keep the top numbers fresh while the admin leaves the page open
    const timer = setInterval(loadOverview, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // After the list loads, fetch links for any ON_THE_WAY job we don't have one for
  useEffect(() => {
    bookings
      .filter((b) => b.status === "ON_THE_WAY" && !trackingLinks[b.id])
      .forEach((b) => fetchTrackingLink(b.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  async function loadBookings(quiet = false) {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (view === "today") params.set("date", today);
      if (statusFilter) params.set("status", statusFilter);
      if (techFilter) params.set("technicianId", techFilter);
      const { data } = await apiClient.get(`/bookings/admin/all?${params.toString()}`);
      setBookings(data.bookings);
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't load bookings.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOverview() {
    try {
      const { data } = await apiClient.get("/activity/admin/overview");
      setOverview(data.overview);
    } catch {
      // the tiles are a convenience; the rest of the page works without them
    }
  }

  async function loadTechnicians() {
    try {
      const { data } = await apiClient.get("/technician/admin/list");
      setTechnicians(data.technicians);
    } catch {
      // assign dropdown simply stays empty
    }
  }

  // Overview tile -> the screen where you act on it
  function goTo(target, opts = {}) {
    setTab(target);
    if (target === "activity") setFeedFilter(opts.attention ? "attention" : "all");
    if (target === "refunds") setRefundFilter(opts.status || "");
    if (target === "jobs") {
      setView("all");
      setStatusFilter(opts.status || "");
    }
    setNavKey((k) => k + 1);
  }

  async function assignTechnician(booking, technicianId) {
    if (!technicianId) return;
    setActionError("");
    setActioningId(booking.id);
    try {
      await apiClient.patch(`/technician/admin/bookings/${booking.id}/assign`, {
        technicianId: Number(technicianId),
      });
      loadBookings();
      loadOverview();
      loadTechnicians();
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't assign this job.");
    } finally {
      setActioningId(null);
    }
  }

  async function loadEarnings() {
    try {
      const { data } = await apiClient.get("/bookings/admin/earnings");
      setEarnings(data.earnings);
    } catch {
      // non-critical if this fails, dashboard still works without it
    }
  }

  // ---- Tracking link helpers -------------------------------------------
  // The status response returns trackingUrl the moment a job goes ON_THE_WAY.
  // For jobs that were already ON_THE_WAY before a page reload, we fetch it.
  async function fetchTrackingLink(bookingId) {
    try {
      const { data } = await apiClient.get(`/tracking/booking/${bookingId}`);
      setTrackingLinks((prev) => ({ ...prev, [bookingId]: data.trackingUrl }));
    } catch {
      // no active link (expired / not generated) - the buttons just stay hidden
    }
  }

  async function copyTrackingLink(bookingId) {
    const url = trackingLinks[bookingId];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard API blocked (non-https / permissions) - fall back to a prompt
      window.prompt("Copy this tracking link:", url);
    }
    setCopiedId(bookingId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // WhatsApp click-to-chat: no API, no cost. Opens WhatsApp with the message
  // pre-filled; the technician/admin just taps send.
  function whatsappCustomer(booking) {
    const url = trackingLinks[booking.id];
    if (!url) return;
    const digits = String(booking.customer_phone || "").replace(/\D/g, "").slice(-10);
    const text = `Hi ${booking.customer_name}, your technician is on the way! Track live here: ${url}`;
    window.open(`https://wa.me/91${digits}?text=${encodeURIComponent(text)}`, "_blank");
  }

  // ---- Completion flow helpers -----------------------------------------
  function openCompletionForm(booking) {
    setActionError("");
    setCompletionTarget({ booking, initial: null });
  }

  // Customer raised an issue: load the old report so it can be corrected
  async function openCorrectionForm(booking) {
    setActionError("");
    try {
      const { data } = await apiClient.get(`/completions/booking/${booking.id}`);
      setCompletionTarget({ booking, initial: data.completion });
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't load the report.");
    }
  }

  async function approveForCustomer(booking) {
    if (!window.confirm("Approve this job on the customer's behalf? Only do this if they agreed to the work and bill.")) {
      return;
    }
    setActionError("");
    setActioningId(booking.id);
    try {
      await apiClient.post(`/completions/booking/${booking.id}/admin-approve`);
      loadBookings();
      loadOverview();
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't approve this job.");
    } finally {
      setActioningId(null);
    }
  }

  async function advanceStatus(booking) {
    const action = NEXT_ACTION[booking.status];
    if (!action) return;
    if (booking.status === "SCHEDULED" && !window.confirm(
      "Confirm this booking without a recorded call from the technician? Only do this if you spoke to the customer yourself."
    )) {
      return;
    }
    setActionError("");
    setActioningId(booking.id);
    try {
      const { data } = await apiClient.patch(`/bookings/admin/${booking.id}/status`, {
        status: action.next,
      });
      if (data.trackingUrl) {
        setTrackingLinks((prev) => ({ ...prev, [booking.id]: data.trackingUrl }));
      }
      loadBookings();
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't update this booking.");
    } finally {
      setActioningId(null);
    }
  }

  async function cancelBooking(booking) {
    setActionError("");
    setActioningId(booking.id);
    try {
      await apiClient.patch(`/bookings/admin/${booking.id}/status`, {
        status: "CANCELLED",
        note: "Cancelled by admin",
      });
      loadBookings();
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't cancel this booking.");
    } finally {
      setActioningId(null);
    }
  }

  function startSharingLocation(bookingId) {
    if (!navigator.geolocation) {
      setActionError("This device doesn't support location sharing.");
      return;
    }
    const socket = getSocket();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        socket.emit("update-location", {
          bookingId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accessToken: getAccessToken(),
        });
      },
      (err) => setActionError(`Couldn't read location: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    setSharingBookingId(bookingId);

    // Access tokens expire after 15 min - a job can easily run longer than
    // that. Refresh proactively every 10 min so location pushes never
    // silently start failing on a stale token mid-job.
    tokenRefreshIntervalRef.current = setInterval(async () => {
      try {
        const { data } = await apiClient.post("/auth/refresh");
        setAccessToken(data.accessToken);
      } catch {
        // If refresh itself fails (e.g. logged out elsewhere), location
        // pushes will start failing too - that's surfaced on the backend
        // side already via the jwt verification there.
      }
    }, 10 * 60 * 1000);
  }

  function stopSharingLocation() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (tokenRefreshIntervalRef.current !== null) {
      clearInterval(tokenRefreshIntervalRef.current);
      tokenRefreshIntervalRef.current = null;
    }
    setSharingBookingId(null);
  }

  useEffect(() => {
    // Stop sharing if the component unmounts mid-job
    return () => stopSharingLocation();
  }, []);

  if (user && user.role !== "admin") {
    return (
      <div className="min-h-screen bg-ink text-white flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-white/60 mb-4">This page is only available to admins.</p>
          <Link to="/" className="text-brand-cool hover:underline text-sm">
            ← Back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-white relative overflow-x-hidden">
      <div className="pointer-events-none fixed -top-32 left-1/4 w-72 h-72 bg-mist-a blur-3xl" />

      <header className="relative z-10 flex justify-between items-center px-5 sm:px-6 md:px-10 py-4 sm:py-5 border-b border-white/10 backdrop-blur-md">
        <Link to="/" className="font-display font-bold text-lg sm:text-xl">
          ServiceBook <span className="text-brand-accent text-sm font-normal">Admin</span>
        </Link>
        <NotificationBell />
      </header>

      <main className="relative z-10 px-5 sm:px-6 md:px-10 py-8 sm:py-10 max-w-4xl mx-auto">
        <AdminOverview overview={overview} onNavigate={goTo} />

        {/* Tabs */}
        <div className="flex gap-1.5 mb-8 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-brand-accent text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {t.label}
              {t.id === "activity" && overview?.attention > 0 && (
                <span className="ml-1.5 text-[10px] bg-red-500/80 text-white rounded-full px-1.5 py-0.5">
                  {overview.attention}
                </span>
              )}
              {t.id === "refunds" && overview?.failed_refunds > 0 && (
                <span className="ml-1.5 text-[10px] bg-red-500/80 text-white rounded-full px-1.5 py-0.5">
                  {overview.failed_refunds}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "activity" && (
          <AdminActivityFeed key={`a${navKey}`} initialFilter={feedFilter} onChanged={loadOverview} />
        )}
        {tab === "team" && <AdminTechnicians />}
        {tab === "refunds" && <AdminRefunds key={`r${navKey}`} initialStatus={refundFilter} />}
        {tab === "reports" && <AdminReports onChanged={loadOverview} />}

        {tab === "jobs" && (
        <>
        {/* Earnings summary */}
        {earnings && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-white/45 mb-1">Today</div>
              <div className="font-display text-lg font-bold text-brand-accent">₹{earnings.today}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-white/45 mb-1">This week</div>
              <div className="font-display text-lg font-bold text-brand-cool">₹{earnings.this_week}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-white/45 mb-1">Jobs today</div>
              <div className="font-display text-lg font-bold text-white">{earnings.today_count}</div>
            </div>
          </div>
        )}

        <WarrantyLookup />

        {/* View toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView("today")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              view === "today" ? "bg-brand-accent text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            Today's jobs
          </button>
          <button
            onClick={() => setView("all")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              view === "all" ? "bg-brand-accent text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            All bookings
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
        {technicians.length > 1 && (
          <select
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
            className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-cool"
          >
            <option value="">All technicians</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {view === "all" && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-cool"
          >
            <option value="">All statuses</option>
            {["PENDING", "CONFIRMED", "SCHEDULED", "CALL_CONFIRMED", "ON_THE_WAY", "IN_PROGRESS", "PENDING_APPROVAL", "COMPLETED", "CANCELLED", "NO_SHOW"].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              )
            )}
          </select>
        )}
        </div>

        {actionError && (
          <div className="mb-6 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            {actionError}
          </div>
        )}

        {loading ? (
          <p className="text-white/40 text-sm">Loading...</p>
        ) : bookings.length === 0 ? (
          <p className="text-white/40 text-sm">No bookings to show.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {bookings.map((b) => {
              const action = NEXT_ACTION[b.status];
              const canCancel = CANCELLABLE.includes(b.status);
              const isActioning = actioningId === b.id;

              return (
                <div
                  key={b.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-5"
                >
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <div>
                      <div className="font-display font-semibold">{b.customer_name}</div>
                      <a href={`tel:${b.customer_phone}`} className="text-xs text-brand-cool font-mono">
                        {b.customer_phone}
                      </a>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>

                  <div className="text-sm text-white/70 mb-1">{b.service_name}</div>
                  <div className="text-xs text-white/45 mb-3 truncate">{b.address_text}</div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3 text-xs">
                    <span className={b.technician_name ? "text-blue-300" : "text-amber-300"}>
                      🧰 {b.technician_name || "No technician yet"}
                    </span>
                    {REASSIGNABLE.includes(b.status) && technicians.filter((t) => t.is_active && t.id !== b.technician_id).length > 0 && (
                      <select
                        defaultValue=""
                        disabled={isActioning}
                        onChange={(e) => {
                          assignTechnician(b, e.target.value);
                          e.target.value = "";
                        }}
                        className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-brand-cool"
                      >
                        <option value="">{b.technician_id ? "Give to another..." : "Assign to..."}</option>
                        {technicians
                          .filter((t) => t.is_active && t.id !== b.technician_id)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    )}
                    {["SCHEDULED", "CALL_CONFIRMED"].includes(b.status) && (
                      <span
                        className={
                          b.call_overdue
                            ? "text-red-300 font-semibold"
                            : b.last_call_outcome === "CONFIRMED"
                            ? "text-emerald-300"
                            : b.last_call_outcome
                            ? "text-amber-300"
                            : b.last_call_at
                            ? "text-blue-300"
                            : "text-white/45"
                        }
                      >
                        {b.call_overdue ? "⏰ Call overdue. " : "📞 "}
                        {!b.last_call_at
                          ? "No call made yet"
                          : !b.last_call_outcome
                          ? `Call started ${timeOf(b.last_call_at)}, result not recorded`
                          : `${CALL_TEXT[b.last_call_outcome]} at ${timeOf(b.last_call_ended_at || b.last_call_at)} · ${b.call_attempts} call${b.call_attempts === 1 ? "" : "s"}`}
                        {b.last_call_note ? ` · "${b.last_call_note}"` : ""}
                        {b.status === "SCHEDULED" && b.call_due_at
                          ? b.call_overdue
                            ? ` · was due ${dueLabel(b.call_due_at)}`
                            : ` · due by ${dueLabel(b.call_due_at)}`
                          : ""}
                      </span>
                    )}
                    {["CONFIRMED", "SCHEDULED", "CALL_CONFIRMED", "ON_THE_WAY", "IN_PROGRESS", "PENDING_APPROVAL", "COMPLETED", "CANCELLED"].includes(b.status) && (
                      <Link to={`/invoice/${b.id}/receipt`} className="text-brand-cool underline">Receipt</Link>
                    )}
                    {b.status === "COMPLETED" && b.completion_status === "APPROVED" && (
                      <Link to={`/invoice/${b.id}/final`} className="text-brand-cool underline">Invoice</Link>
                    )}
                    {b.refund_status && (
                      <span className={b.refund_status === "FAILED" ? "text-red-300" : "text-emerald-300"}>
                        ₹{b.refund_amount} · {REFUND_LABEL[b.refund_status]}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono text-white/50 mb-4">
                    <span>{b.slot_date} · {b.slot_time}</span>
                    <span className="text-brand-accent">₹{b.booking_charge}</span>
                    <span>{b.distance_km} km</span>
                  </div>

                  {b.status === "PENDING_APPROVAL" && (
                    <p className="text-xs mb-3 text-purple-200/80">
                      {b.completion_status === "DISPUTED"
                        ? `Customer raised an issue: "${b.completion_note}"`
                        : `Waiting for customer approval · job total ₹${b.completion_total}`}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {action && (
                      <button
                        onClick={() => advanceStatus(b)}
                        disabled={isActioning}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 transition-colors"
                      >
                        {isActioning ? "Updating..." : action.label}
                      </button>
                    )}
                    {b.status === "ON_THE_WAY" && (
                      sharingBookingId === b.id ? (
                        <button
                          onClick={stopSharingLocation}
                          className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-cool/15 text-brand-cool border border-brand-cool/30 animate-pulse"
                        >
                          ● Sharing location - tap to stop
                        </button>
                      ) : (
                        <button
                          onClick={() => startSharingLocation(b.id)}
                          className="px-4 py-2 rounded-lg text-xs font-semibold border border-white/15 hover:bg-white/5 transition-colors"
                        >
                          Share my location
                        </button>
                      )
                    )}
                    {b.status === "ON_THE_WAY" && trackingLinks[b.id] && (
                      <>
                        <button
                          onClick={() => copyTrackingLink(b.id)}
                          className="px-4 py-2 rounded-lg text-xs font-semibold border border-white/15 hover:bg-white/5 transition-colors"
                        >
                          {copiedId === b.id ? "✓ Copied" : "Copy tracking link"}
                        </button>
                        <button
                          onClick={() => whatsappCustomer(b)}
                          className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30 hover:bg-[#25D366]/25 transition-colors"
                        >
                          WhatsApp customer
                        </button>
                      </>
                    )}
                    {b.status === "IN_PROGRESS" && (
                      <button
                        onClick={() => openCompletionForm(b)}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-accent hover:bg-brand-accent-hover transition-colors"
                      >
                        Complete job
                      </button>
                    )}
                    {b.status === "PENDING_APPROVAL" && b.completion_status === "DISPUTED" && (
                      <button
                        onClick={() => openCorrectionForm(b)}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                      >
                        Fix report & resubmit
                      </button>
                    )}
                    {b.status === "PENDING_APPROVAL" && b.completion_status === "PENDING" && (
                      <button
                        onClick={() => approveForCustomer(b)}
                        disabled={isActioning}
                        className="px-4 py-2 rounded-lg text-xs font-semibold border border-white/15 hover:bg-white/5 disabled:opacity-60 transition-colors"
                      >
                        Approve for customer
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => cancelBooking(b)}
                        disabled={isActioning}
                        className="px-4 py-2 rounded-lg text-xs font-semibold border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-60 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </>
        )}
      </main>

      {completionTarget && (
        <CompletionForm
          booking={completionTarget.booking}
          initial={completionTarget.initial}
          onClose={() => setCompletionTarget(null)}
          onSubmitted={() => {
            setCompletionTarget(null);
            loadBookings();
          }}
        />
      )}
    </div>
  );
}