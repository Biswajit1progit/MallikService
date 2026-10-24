import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../api/client.js";
import { payForBooking } from "../utils/razorpay.js";
import { IconSnowflake, IconWrench, IconGauge, IconTools } from "../components/ServiceIcons.jsx";
import LocationPicker from "../components/LocationPicker.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const iconByName = {
  "AC Installation & Uninstallation": IconTools,
  "AC Location Shift": IconGauge,
  "AC Maintenance": IconSnowflake,
  Others: IconWrench,
};

export default function Book() {
  const navigate = useNavigate();

  // Step 1: service
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [selectedServiceId, setSelectedServiceId] = useState(null);

  // Step 2: address + pricing
  const [addressText, setAddressText] = useState("");
  const [point, setPoint] = useState(null); // { lat, lng } chosen on the map
  const [houseDetails, setHouseDetails] = useState(""); // flat/house no, landmark
  const [checkingAddress, setCheckingAddress] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [confirmedAddress, setConfirmedAddress] = useState(null); // { id, distanceKm, bookingCharge }

  // Step 3: slot + confirm
  const [slotDate, setSlotDate] = useState("");
  const [slotTime, setSlotTime] = useState("");
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdBooking, setCreatedBooking] = useState(null);

  // Payment
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentDone, setPaymentDone] = useState(false);

  // Availability check for the selected date
  const [availability, setAvailability] = useState(null); // { available, booked, capacity, suggestedDate }
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  useEffect(() => {
    async function loadServices() {
      try {
        const { data } = await apiClient.get("/services");
        setServices(data.services);
      } catch {
        // handled by empty-state below
      } finally {
        setServicesLoading(false);
      }
    }
    loadServices();
  }, []);

  useEffect(() => {
    if (!slotDate) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    async function checkDate() {
      setCheckingAvailability(true);
      try {
        const { data } = await apiClient.get(`/bookings/availability?date=${slotDate}`);
        if (!cancelled) setAvailability(data);
      } catch {
        if (!cancelled) setAvailability(null);
      } finally {
        if (!cancelled) setCheckingAvailability(false);
      }
    }
    checkDate();
    return () => {
      cancelled = true;
    };
  }, [slotDate]);

  function useSuggestedDate() {
    if (availability?.suggestedDate) {
      setSlotDate(availability.suggestedDate);
    }
  }

  async function handleCheckAddress(e) {
    e.preventDefault();
    setAddressError("");
    setConfirmedAddress(null);

    if (!point) {
      setAddressError("Search or tap the map to pin your location first.");
      return;
    }
    if (!addressText.trim()) {
      setAddressError("Add your address details.");
      return;
    }

    setCheckingAddress(true);
    try {
      const { data } = await apiClient.post("/addresses", {
        addressText: houseDetails.trim() ? `${houseDetails.trim()}, ${addressText}` : addressText,
        latitude: point.lat,
        longitude: point.lng,
      });
      setConfirmedAddress({
        id: data.address.id,
        addressText: data.address.address_text,
        distanceKm: data.distanceKm,
        bookingCharge: data.bookingCharge,
      });
    } catch (err) {
      if (err.response?.status === 422) {
        setAddressError(err.response.data.message);
      } else {
        setAddressError(err.response?.data?.message || "Something went wrong. Try again.");
      }
    } finally {
      setCheckingAddress(false);
    }
  }

  async function handleCreateBooking(e) {
    e.preventDefault();
    setCreateError("");

    if (!selectedServiceId || !confirmedAddress || !slotDate || !slotTime) {
      setCreateError("Complete all three steps before booking.");
      return;
    }
    if (!acceptedPolicy) {
      setCreateError("Please tick the box to accept the cancellation & refund policy.");
      return;
    }

    setCreating(true);
    try {
      const { data } = await apiClient.post("/bookings", {
        serviceId: selectedServiceId,
        addressId: confirmedAddress.id,
        slotDate,
        slotTime,
        acceptedPolicy: true,
      });
      setCreatedBooking(data.booking);
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.fullyBooked) {
        setAvailability({
          available: false,
          suggestedDate: err.response.data.suggestedDate,
        });
        setCreateError(err.response.data.message);
      } else if (err.response?.data?.code === "PHONE_REQUIRED") {
        navigate("/complete-profile");
      } else {
        setCreateError(err.response?.data?.message || "Couldn't create this booking. Try again.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handlePay() {
    setPaymentError("");
    setPaying(true);
    payForBooking(
      { id: createdBooking.id, service_name: selectedService?.name },
      {
        onSuccess: () => {
          setPaying(false);
          setPaymentDone(true);
        },
        onFailure: (message) => {
          setPaying(false);
          setPaymentError(message);
        },
        onDismiss: () => {
          setPaying(false);
          setPaymentError("Payment window closed before completing. Try again when ready.");
        },
      }
    );
  }

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const today = new Date().toISOString().split("T")[0];

  // -------------------------------------------------------------------
  // Confirmation screen - shown once the booking is actually created
  // -------------------------------------------------------------------
  if (createdBooking) {
    return (
      <div className="min-h-screen bg-ink text-white relative overflow-x-hidden">
        <div className="pointer-events-none fixed -top-32 left-1/4 w-72 h-72 bg-mist-a blur-3xl" />
        <header className="relative z-10 flex justify-between items-center px-5 sm:px-6 md:px-10 py-4 sm:py-5 border-b border-white/10">
          <Link to="/" className="font-display font-bold text-lg sm:text-xl">
            ServiceBook
          </Link>
        </header>

        <main className="relative z-10 px-5 sm:px-6 md:px-10 py-14 max-w-lg mx-auto text-center">
          <div className="w-14 h-14 rounded-full bg-brand-cool/15 border border-brand-cool/30 flex items-center justify-center mx-auto mb-6 text-2xl">
            ✓
          </div>
          <h1 className="font-display text-2xl font-semibold mb-2">Booking created</h1>
          <p className="text-white/55 text-sm mb-8">
            {paymentDone
              ? "Payment received. A technician will call to confirm before heading out."
              : "Pay the booking charge to confirm your slot."}
          </p>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-6 text-left mb-6">
            <div className="flex justify-between items-start mb-4">
              <span className="font-display font-semibold">{selectedService?.name}</span>
              <StatusBadge status={paymentDone ? "CONFIRMED" : createdBooking.status} />
            </div>
            <div className="space-y-2 text-sm text-white/60">
              <div className="flex justify-between">
                <span>Date & time</span>
                <span className="font-mono text-white/85">
                  {createdBooking.slot_date} at {createdBooking.slot_time}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Booking charge</span>
                <span className="font-mono text-brand-accent">₹{createdBooking.booking_charge}</span>
              </div>
              <div className="flex justify-between">
                <span>Distance</span>
                <span className="font-mono text-white/85">{createdBooking.distance_km} km</span>
              </div>
            </div>
          </div>

          {paymentError && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-6 text-left">
              {paymentError}
            </div>
          )}

          <p className="text-xs text-white/40 mb-6 leading-relaxed">
            Full refund if cancelled anytime before the technician starts heading your way.
            Once they're on the way, the booking charge isn't refundable.
          </p>

          {paymentDone ? (
            <button
              onClick={() => navigate("/bookings")}
              className="w-full rounded-lg bg-brand-accent hover:bg-brand-accent-hover transition-colors text-white font-semibold text-sm py-3.5"
            >
              View my bookings
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                onClick={handlePay}
                disabled={paying}
                className="w-full rounded-lg bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 transition-colors text-white font-semibold text-sm py-3.5"
              >
                {paying ? "Opening payment..." : `Pay ₹${createdBooking.booking_charge} now`}
              </button>
              <button
                onClick={() => navigate("/bookings")}
                className="w-full rounded-lg border border-white/15 hover:bg-white/5 transition-colors text-white/70 text-sm py-3"
              >
                Pay later from My Bookings
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Booking flow - 3 steps
  // -------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-ink text-white relative overflow-x-hidden">
      <div className="pointer-events-none fixed -top-32 left-1/4 w-72 h-72 md:w-96 md:h-96 bg-mist-a blur-3xl" />
      <div className="pointer-events-none fixed top-[38rem] right-0 w-56 h-56 md:w-72 md:h-72 bg-mist-b blur-3xl" />

      <header className="relative z-10 flex justify-between items-center px-5 sm:px-6 md:px-10 py-4 sm:py-5 border-b border-white/10 backdrop-blur-md">
        <Link to="/" className="font-display font-bold text-lg sm:text-xl">
          ServiceBook
        </Link>
        <Link
          to="/bookings"
          className="px-3 sm:px-4 py-2 rounded-lg border border-white/15 text-xs sm:text-sm hover:bg-white/5 transition-colors"
        >
          My bookings
        </Link>
      </header>

      <main className="relative z-10 px-5 sm:px-6 md:px-10 py-10 sm:py-14 max-w-3xl mx-auto">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold mb-2">Book a service</h1>
        <p className="text-white/55 text-sm sm:text-base mb-10">
          Three steps: pick a service, confirm your address, choose a time.
        </p>

        {/* Step 1: Service */}
        <section className="mb-10">
          <h2 className="font-mono text-xs tracking-[0.1em] uppercase text-brand-cool mb-4">
            1. Choose a service
          </h2>

          {servicesLoading ? (
            <p className="text-white/40 text-sm">Loading services...</p>
          ) : services.length === 0 ? (
            <p className="text-red-300 text-sm">
              Couldn't load services - check that your backend server is running.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {services.map((service) => {
                const Icon = iconByName[service.name] || IconTools;
                const isSelected = selectedServiceId === service.id;
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setSelectedServiceId(service.id)}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      isSelected
                        ? "border-brand-cool bg-brand-cool/10"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <Icon className="w-5 h-5 text-brand-cool mb-2.5" />
                    <div className="font-display font-semibold text-sm sm:text-base mb-1">
                      {service.name}
                    </div>
                    <div className="text-[11px] sm:text-xs text-white/55 leading-snug mb-1.5">
                      {service.description}
                    </div>
                    <div className="text-[11px] sm:text-xs text-white/40">
                      {service.warranty_days > 0
                        ? `${service.warranty_days} day warranty`
                        : "Price quoted on site"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Step 2: Address */}
        <section className="mb-10">
          <h2 className="font-mono text-xs tracking-[0.1em] uppercase text-brand-cool mb-4">
            2. Your address
          </h2>

          {confirmedAddress ? (
            <div className="rounded-xl border border-brand-cool/30 bg-brand-cool/10 p-5 flex justify-between items-center gap-4">
              <div className="min-w-0">
                <div className="text-sm text-white/85 truncate">{confirmedAddress.addressText}</div>
                <div className="text-xs text-white/50 font-mono mt-1">
                  {confirmedAddress.distanceKm} km · ₹{confirmedAddress.bookingCharge} booking charge
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmedAddress(null)}
                className="shrink-0 text-xs text-brand-cool hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleCheckAddress}
              className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-5 sm:p-6"
            >
              <div className="flex flex-col gap-4">
                <LocationPicker
                  value={point}
                  onChange={({ lat, lng, addressText: text }) => {
                    setPoint({ lat, lng });
                    if (text) setAddressText(text);
                  }}
                />

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-white/80">
                    House / flat no. & landmark
                  </label>
                  <input
                    type="text"
                    value={houseDetails}
                    onChange={(e) => setHouseDetails(e.target.value)}
                    placeholder="e.g. House 12, near Shiv Mandir"
                    className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-white/80">
                    Address (auto-filled from the map, editable)
                  </label>
                  <textarea
                    value={addressText}
                    onChange={(e) => setAddressText(e.target.value)}
                    placeholder="Pick a place on the map"
                    rows={2}
                    className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors resize-none"
                  />
                </div>

                {addressError && (
                  <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                    {addressError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={checkingAddress}
                  className="rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-60 transition-colors text-white font-semibold text-sm py-3.5"
                >
                  {checkingAddress ? "Checking..." : "Check availability & price"}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Step 3: Slot + confirm */}
        <section>
          <h2 className="font-mono text-xs tracking-[0.1em] uppercase text-brand-cool mb-4">
            3. Pick a time
          </h2>

          <form
            onSubmit={handleCreateBooking}
            className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-5 sm:p-6"
          >
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-white/80">Date</label>
                  <input
                    type="date"
                    min={today}
                    value={slotDate}
                    onChange={(e) => setSlotDate(e.target.value)}
                    className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-sm text-white outline-none focus:border-brand-cool transition-colors [color-scheme:dark]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-white/80">Time</label>
                  <input
                    type="time"
                    value={slotTime}
                    onChange={(e) => setSlotTime(e.target.value)}
                    className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-sm text-white outline-none focus:border-brand-cool transition-colors [color-scheme:dark]"
                  />
                </div>
              </div>

              {checkingAvailability && (
                <p className="text-xs text-white/40">Checking availability...</p>
              )}

              {!checkingAvailability && availability?.available === true && (
                <p className="text-xs text-brand-cool">
                  ✓ {availability.capacity - availability.booked} slot(s) left on this date
                </p>
              )}

              {!checkingAvailability && availability?.available === false && (
                <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3.5 py-3 flex flex-col gap-2">
                  <span>This date is fully booked.</span>
                  {availability.suggestedDate && (
                    <button
                      type="button"
                      onClick={useSuggestedDate}
                      className="self-start text-xs font-semibold text-brand-cool hover:underline"
                    >
                      Use next available date: {availability.suggestedDate} →
                    </button>
                  )}
                </div>
              )}

              {createError && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                  {createError}
                </div>
              )}

              {confirmedAddress && (
                <div className="text-xs text-white/60 leading-relaxed rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-3">
                  You pay <strong className="text-white">₹{confirmedAddress.bookingCharge}</strong> now to confirm your
                  slot. Cancel before the technician is on the way for a full refund. After that it isn't refundable.
                  The final price for the work is decided on site and you approve it before the job closes.
                  Your <strong className="text-white">₹{confirmedAddress.bookingCharge}</strong> booking charge is
                  then deducted from that final price.
                </div>
              )}

              <label className="flex items-start gap-2.5 text-xs text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedPolicy}
                  onChange={(e) => setAcceptedPolicy(e.target.checked)}
                  className="mt-0.5 accent-[#f97316]"
                />
                <span>
                  I have read and accept the{" "}
                  <Link to="/policies" target="_blank" className="text-brand-cool underline">
                    cancellation &amp; refund policy
                  </Link>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={creating || !selectedServiceId || !confirmedAddress || availability?.available === false}
                className="rounded-lg bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white font-semibold text-sm py-3.5"
              >
                {creating ? "Booking..." : "Confirm booking"}
              </button>

              {(!selectedServiceId || !confirmedAddress) && (
                <p className="text-xs text-white/40 text-center">
                  Complete steps 1 and 2 above to enable booking.
                </p>
              )}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}