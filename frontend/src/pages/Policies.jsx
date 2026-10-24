import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client.js";

// Public page (no login). Every number comes from /api/policy, which reads the same
// database tables and constants the booking and refund code uses - so this page can
// never say something different from what actually happens.
function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 mb-5">
      <h2 className="font-display font-semibold text-lg mb-3">{title}</h2>
      <div className="text-sm text-white/70 leading-relaxed flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

export default function Policies() {
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient
      .get("/policy")
      .then(({ data }) => setPolicy(data.policy ?? data))
      .catch(() => setError("Couldn't load the policy right now. Please try again."));
  }, []);

  const r = policy?.rules;

  return (
    <div className="min-h-screen bg-ink text-white relative overflow-x-hidden">
      <div className="pointer-events-none fixed -top-32 left-1/4 w-72 h-72 bg-mist-a blur-3xl" />
      <header className="relative z-10 flex justify-between items-center px-5 sm:px-6 md:px-10 py-4 sm:py-5 border-b border-white/10 backdrop-blur-md">
        <Link to="/" className="font-display font-bold text-lg sm:text-xl">
          ServiceBook
        </Link>
        <Link to="/" className="text-sm text-brand-cool hover:underline">
          ← Home
        </Link>
      </header>

      <main className="relative z-10 px-5 sm:px-6 md:px-10 py-8 sm:py-10 max-w-2xl mx-auto">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold mb-2">Booking, cancellation &amp; refund policy</h1>
        {policy && <p className="text-xs text-white/40 mb-8 font-mono">Version {policy.version}</p>}

        {error && <p className="text-sm text-red-300">{error}</p>}
        {!policy && !error && <p className="text-white/40 text-sm">Loading...</p>}

        {policy && (
          <>
            <Section title="Booking charge">
              <p>
                You pay a small booking charge online to confirm your slot. It depends on how far you are from our
                base:
              </p>
              <ul className="flex flex-col gap-1.5 font-mono text-[13px]">
                {policy.bookingCharges.map((t) => (
                  <li key={t.fromKm} className="flex justify-between border-b border-white/5 pb-1.5">
                    <span>
                      {t.fromKm} to {t.toKm} km
                    </span>
                    <span className="text-brand-accent">₹{t.fee}</span>
                  </li>
                ))}
              </ul>
              <p>
                We serve addresses up to {policy.serviceRadiusKm} km from our base.{" "}
                {r.bookingChargeDeductedFromJob
                  ? "The final price is decided on site by the technician and you approve it. Your booking charge is then deducted from that final price, so you only pay the rest."
                  : "The booking charge is a separate visit fee. It is not deducted from your final job bill."}
              </p>
              <p>
                Your slot is held for {r.unpaidBookingExpiryMinutes} minutes while you pay. If payment isn't completed
                in that time, the booking is released.
              </p>
            </Section>

            <Section title="If you cancel">
              <p>
                <strong className="text-white">Full refund of the booking charge</strong> if you cancel any time
                before our technician starts travelling to you (before the status changes to "On the way").
              </p>
              <p>
                <strong className="text-white">No refund</strong> once the technician is on the way, because the visit
                has started and the cost of travel is already incurred. This applies even for a short distance, and
                if you are not available when the technician arrives.
              </p>
              <p>Refunds go back to the original payment method and usually take {r.refundTimeline}.</p>
            </Section>

            <Section title="If you reschedule">
              <p>
                You can move a paid booking to another date or time before the technician is on the way. A
                reschedule is <strong className="text-white">not a refund</strong>: the same booking charge simply
                moves to your new slot.
              </p>
            </Section>

            <Section title="If we cancel or reschedule">
              <p>
                If we have to cancel or move your booking, you get a{" "}
                <strong className="text-white">full refund</strong> of the booking charge, or you can keep the charge
                for a new slot. Whichever you prefer.
              </p>
            </Section>

            <Section title="Final price and approval">
              <p>
                The final cost of the work (labour and any parts) is decided on site after the technician checks the
                problem. You receive a written report with photos and the full bill, and the job is only closed
                when <strong className="text-white">you approve it</strong>. If something looks wrong you can raise an
                issue instead and we will review it with you.
              </p>
            </Section>

            <Section title="Warranty">
              <p>After you approve a job, a warranty on the work starts from that day:</p>
              <ul className="flex flex-col gap-1.5">
                {policy.warranties
                  .filter((w) => w.days > 0)
                  .map((w) => (
                    <li key={w.service} className="flex justify-between border-b border-white/5 pb-1.5">
                      <span>{w.service}</span>
                      <span className="font-mono text-[13px] text-brand-cool">{w.days} days</span>
                    </li>
                  ))}
              </ul>
              <p>You can see your warranty end date under My bookings.</p>
            </Section>

            <Section title="Problems with a refund">
              <p>
                If a refund hasn't reached you within {r.refundTimeline}, contact us with your booking number and we
                will check it with our payment provider.
              </p>
            </Section>
          </>
        )}
      </main>
    </div>
  );
}