import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client.js";
import { payForBooking } from "../utils/razorpay.js";
import StatusBadge from "../components/StatusBadge.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import CompletionReview from "../components/CompletionReview.jsx";

// Statuses the customer is still allowed to cancel/reschedule from -
// mirrors CUSTOMER_MODIFIABLE_STATUSES on the backend, kept in sync manually.
const MODIFIABLE = ["PENDING", "CONFIRMED", "SCHEDULED", "CALL_CONFIRMED", "RESCHEDULE_NEEDED"];

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState(null); // booking id currently being rescheduled
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [payingId, setPayingId] = useState(null); // booking id currently mid-payment
  const [openReportId, setOpenReportId] = useState(null); // booking whose job report is expanded

  useEffect(() => {
    loadBookings();
  }, []);

  async function loadBookings() {
    setLoading(true);
    setLoadError("");
    try {
      const { data } = await apiClient.get("/bookings");
      setBookings(data.bookings);
    } catch (err) {
      setLoadError(err.response?.data?.message || "Couldn't load your bookings.");
    } finally {
      setLoading(false);
    }
  }

  async function openTracking(id) {
    setActionError("");
    try {
      const { data } = await apiClient.get(`/tracking/booking/${id}`);
      window.open(data.trackingUrl, "_blank");
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't open live tracking.");
    }
  }

  // The customer says: the technician marked the call as done, but nobody called me.
  async function reportNoCall(b) {
    setActionError("");
    setNotice("");
    try {
      const { data } = await apiClient.post(`/bookings/${b.id}/report-no-call`);
      setNotice(data.message || "Thanks. The shop has been told.");
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't send this. Try again.");
    }
  }

  async function handleCancel(b) {
    setActionError("");
    setNotice("");
    // Be explicit about money BEFORE the click: unpaid bookings have nothing to refund
    const paid = b.status !== "PENDING";
    const ok = window.confirm(
      paid && b.refund_eligible
        ? `Cancel this booking? Your ₹${b.booking_charge} booking charge will be refunded (usually in 5 to 7 working days).`
        : "Cancel this booking?"
    );
    if (!ok) return;
    try {
      const { data } = await apiClient.patch(`/bookings/${b.id}/cancel`, { reason: "Cancelled by customer" });
      if (data.refund?.refunded) {
        setNotice(`Booking cancelled. Your ₹${b.booking_charge} refund has started and usually arrives in 5 to 7 working days.`);
      } else if (data.refund?.failed) {
        setNotice("Booking cancelled. Your refund couldn't start automatically. Our team has been alerted and will sort it out.");
      } else {
        setNotice("Booking cancelled.");
      }
      loadBookings();
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't cancel this booking.");
    }
  }

  async function handleReschedule(id) {
    setActionError("");
    if (!newDate || !newTime) {
      setActionError("Pick a new date and time first.");
      return;
    }
    try {
      await apiClient.patch(`/bookings/${id}/reschedule`, { slotDate: newDate, slotTime: newTime });
      setRescheduleTarget(null);
      setNewDate("");
      setNewTime("");
      loadBookings();
    } catch (err) {
      setActionError(err.response?.data?.message || "Couldn't reschedule this booking.");
    }
  }

  async function handlePay(booking) {
    setActionError("");
    setPayingId(booking.id);
    payForBooking(booking, {
      onSuccess: () => {
        setPayingId(null);
        loadBookings();
      },
      onFailure: (message) => {
        setPayingId(null);
        setActionError(message);
      },
      onDismiss: () => {
        setPayingId(null);
      },
    });
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-ink text-white relative overflow-x-hidden">
      <div className="pointer-events-none fixed -top-32 left-1/4 w-72 h-72 bg-mist-a blur-3xl" />

      <header className="relative z-10 flex justify-between items-center px-5 sm:px-6 md:px-10 py-4 sm:py-5 border-b border-white/10 backdrop-blur-md">
        <Link to="/" className="font-display font-bold text-lg sm:text-xl">
          ServiceBook
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationBell />
          <Link
            to="/book"
            className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover transition-colors"
          >
            New booking
          </Link>
        </div>
      </header>

      <main className="relative z-10 px-5 sm:px-6 md:px-10 py-10 sm:py-14 max-w-3xl mx-auto">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold mb-8">My bookings</h1>

        {notice && (
          <div className="mb-6 text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
            {notice}
          </div>
        )}

        {actionError && (
          <div className="mb-6 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            {actionError}
          </div>
        )}

        {loading ? (
          <p className="text-white/40 text-sm">Loading...</p>
        ) : loadError ? (
          <p className="text-red-300 text-sm">{loadError}</p>
        ) : bookings.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-white/55 text-sm mb-4">You don't have any bookings yet.</p>
            <Link
              to="/book"
              className="inline-block px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover transition-colors"
            >
              Book your first service
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {bookings.map((b) => {
              const canModify = MODIFIABLE.includes(b.status);
              const isRescheduling = rescheduleTarget === b.id;

              return (
                <div
                  key={b.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-5 sm:p-6"
                >
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="font-display font-semibold text-base">{b.service_name}</div>
                      <div className="text-xs text-white/45 truncate mt-0.5">{b.address_text}</div>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-white/60 mb-4">
                    <span className="font-mono">
                      {b.slot_date} · {b.slot_time}
                    </span>
                    <span className="font-mono text-brand-accent">₹{b.booking_charge}</span>
                    <span className="font-mono">{b.distance_km} km</span>
                  </div>

                  {b.technician_name && b.status !== "CANCELLED" && (
                    <p className="text-xs text-white/55 mb-3">
                      🧰 Your technician: <span className="text-white/80">{b.technician_name}</span>
                      {b.technician_phone && (
                        <>
                          {" · "}
                          <a href={`tel:${b.technician_phone}`} className="text-brand-cool font-mono">
                            {b.technician_phone}
                          </a>
                        </>
                      )}
                    </p>
                  )}

                  {b.status === "SCHEDULED" && (
                    <p className="text-xs text-white/55 mb-3">
                      📞 Your technician will call you to confirm the visit. Please keep your phone nearby.
                    </p>
                  )}

                  {b.status === "CALL_CONFIRMED" && (
                    <p className="text-xs text-emerald-300 mb-3">
                      ✅ {b.technician_name || "Your technician"} confirmed your visit by phone.{" "}
                      <button
                        type="button"
                        onClick={() => reportNoCall(b)}
                        className="underline text-white/50 hover:text-white/80"
                      >
                        Nobody called me
                      </button>
                    </p>
                  )}

                  {b.refund_status && (
                    <p className={`text-xs mb-3 ${b.refund_status === "FAILED" ? "text-amber-300" : "text-emerald-300"}`}>
                      {b.refund_status === "PROCESSED" || b.refund_status === "INITIATED"
                        ? `💸 ₹${b.refund_amount} refund started. It usually reaches you in 5 to 7 working days.`
                        : "💸 Your refund is being sorted out by our team."}
                    </p>
                  )}

                  {b.status === "ON_THE_WAY" && (
                    <button
                      type="button"
                      onClick={() => openTracking(b.id)}
                      className="mb-4 rounded-lg bg-brand-cool/15 border border-brand-cool/30 text-brand-cool text-sm font-semibold px-4 py-2.5 hover:bg-brand-cool/20 transition-colors"
                    >
                      📍 Track technician live
                    </button>
                  )}

                  {!["PENDING", "RESCHEDULE_NEEDED"].includes(b.status) && (
                    <div className="flex gap-4 text-xs mb-3">
                      <Link to={`/invoice/${b.id}/receipt`} className="text-brand-cool underline">Booking receipt</Link>
                      {b.status === "COMPLETED" && b.completion_status === "APPROVED" && (
                        <Link to={`/invoice/${b.id}/final`} className="text-brand-cool underline">Final invoice</Link>
                      )}
                    </div>
                  )}

                  {b.status === "COMPLETED" && b.warranty_expires_on && (
                    <p className="text-xs text-brand-cool mb-3">🛡 Warranty until {b.warranty_expires_on}</p>
                  )}

                  {(b.status === "PENDING_APPROVAL" || b.status === "COMPLETED") && b.completion_status && (
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={() => setOpenReportId(openReportId === b.id ? null : b.id)}
                        className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
                          b.status === "PENDING_APPROVAL" && b.completion_status === "PENDING"
                            ? "bg-brand-accent hover:bg-brand-accent-hover"
                            : "border border-white/15 hover:bg-white/5 text-white/80"
                        }`}
                      >
                        {openReportId === b.id
                          ? "Hide job report"
                          : b.status === "PENDING_APPROVAL" && b.completion_status === "PENDING"
                          ? "Review & approve work"
                          : "View job report"}
                      </button>
                      {openReportId === b.id && (
                        <CompletionReview
                          bookingId={b.id}
                          canRespond={b.status === "PENDING_APPROVAL"}
                          onChanged={loadBookings}
                        />
                      )}
                    </div>
                  )}

                  {b.status === "CANCELLED" && b.cancellation_reason && (
                    <p className="text-xs text-white/40 mb-3">Reason: {b.cancellation_reason}</p>
                  )}

                  {b.status === "PENDING" && (
                    <div className="mb-3">
                      <button
                        onClick={() => handlePay(b)}
                        disabled={payingId === b.id}
                        className="text-sm font-semibold px-4 py-2 rounded-lg bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 transition-colors"
                      >
                        {payingId === b.id ? "Opening payment..." : `Pay ₹${b.booking_charge} now`}
                      </button>
                    </div>
                  )}

                  {canModify && !isRescheduling && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => setRescheduleTarget(b.id)}
                        className="text-xs font-semibold text-brand-cool hover:underline"
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={() => handleCancel(b)}
                        className="text-xs font-semibold text-red-300 hover:underline"
                      >
                        Cancel booking
                      </button>
                    </div>
                  )}

                  {isRescheduling && (
                    <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-white/10">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-white/60">New date</label>
                        <input
                          type="date"
                          min={today}
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-brand-cool [color-scheme:dark]"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-white/60">New time</label>
                        <input
                          type="time"
                          value={newTime}
                          onChange={(e) => setNewTime(e.target.value)}
                          className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-brand-cool [color-scheme:dark]"
                        />
                      </div>
                      <button
                        onClick={() => handleReschedule(b.id)}
                        className="px-4 py-2 rounded-lg bg-brand-accent hover:bg-brand-accent-hover transition-colors text-sm font-semibold"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setRescheduleTarget(null)}
                        className="px-4 py-2 rounded-lg border border-white/15 hover:bg-white/5 transition-colors text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {!canModify && b.status !== "CANCELLED" && b.status !== "COMPLETED" && (
                    <p className="text-xs text-white/35">
                      This booking can no longer be changed - the technician is already on the way.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}