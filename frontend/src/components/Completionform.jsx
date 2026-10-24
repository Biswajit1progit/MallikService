import { useState } from "react";
import { apiClient } from "../api/client.js";
import { uploadImage, isCloudinaryConfigured } from "../utils/Cloudinary.js";

const inputClass =
  "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors";

const emptyPart = () => ({ name: "", qty: "1", unit_price: "" });

// Technician's on-site report. `initial` is a previous report (when the customer
// raised an issue and the admin is correcting it).
export default function CompletionForm({ booking, initial, onClose, onSubmitted }) {
  const [summary, setSummary] = useState(initial?.work_summary || "");
  const [parts, setParts] = useState(
    initial?.parts?.length
      ? initial.parts.map((p) => ({ name: p.name, qty: String(p.qty), unit_price: String(p.unit_price) }))
      : []
  );
  const [labour, setLabour] = useState(initial ? String(initial.labour_charge) : "");
  const [paymentMode, setPaymentMode] = useState(initial?.payment_mode || "PENDING");
  const [photos, setPhotos] = useState(initial?.photos || []); // [{ url, label }]
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Live totals - shown to the technician so he can read the bill out to the
  // customer. The server recomputes these itself; the client value is never trusted.
  const partsTotal = parts.reduce((sum, p) => sum + (Number(p.qty) || 0) * (Number(p.unit_price) || 0), 0);
  const total = partsTotal + (Number(labour) || 0);

  function updatePart(i, field, value) {
    setParts((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }

  async function handleFiles(fileList, label) {
    setError("");
    const files = Array.from(fileList);
    if (photos.length + files.length > 8) {
      setError("You can add at most 8 photos.");
      return;
    }
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        const url = await uploadImage(file);
        setPhotos((prev) => [...prev, { url, label }]);
      } catch (err) {
        setError(err.message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (uploading > 0) {
      setError("Wait for the photos to finish uploading.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/completions/booking/${booking.id}`, {
        workSummary: summary,
        parts: parts
          .filter((p) => p.name.trim())
          .map((p) => ({ name: p.name, qty: Number(p.qty), unit_price: Number(p.unit_price || 0) })),
        labourCharge: Number(labour || 0),
        paymentMode,
        photos,
      });
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't submit the report. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true">
      <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f1d29] p-5 sm:p-6 flex flex-col gap-5"
        >
          <div className="flex justify-between items-start gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Complete job</h2>
              <p className="text-xs text-white/50 mt-0.5">
                {booking.service_name} · {booking.customer_name}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">
              ×
            </button>
          </div>

          {initial && (
            <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              The customer raised an issue. Correct the report below and resubmit it.
            </p>
          )}

          {/* Work summary */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-white/80">Work done</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="e.g. Refilled R32 gas, fixed leak at the valve, tested cooling"
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Parts */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-white/80">Parts used</label>
              <button
                type="button"
                onClick={() => setParts((p) => [...p, emptyPart()])}
                className="text-xs font-semibold text-brand-cool hover:underline"
              >
                + Add part
              </button>
            </div>
            {parts.length === 0 && <p className="text-xs text-white/40">No parts used - skip this if only labour.</p>}
            {parts.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_52px_84px_24px] gap-2 items-center">
                <input
                  value={p.name}
                  onChange={(e) => updatePart(i, "name", e.target.value)}
                  placeholder="Part name"
                  className={inputClass}
                />
                <input
                  value={p.qty}
                  onChange={(e) => updatePart(i, "qty", e.target.value)}
                  inputMode="numeric"
                  placeholder="Qty"
                  className={`${inputClass} text-center px-1`}
                />
                <input
                  value={p.unit_price}
                  onChange={(e) => updatePart(i, "unit_price", e.target.value)}
                  inputMode="decimal"
                  placeholder="₹ each"
                  className={`${inputClass} px-2`}
                />
                <button
                  type="button"
                  onClick={() => setParts((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-red-300 hover:text-red-200 text-lg leading-none"
                  aria-label="Remove part"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Labour */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-white/80">Labour charge (₹)</label>
            <input
              value={labour}
              onChange={(e) => setLabour(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={inputClass}
            />
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm space-y-1.5">
            <div className="flex justify-between text-white/60">
              <span>Parts</span>
              <span className="font-mono">₹{partsTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Labour</span>
              <span className="font-mono">₹{(Number(labour) || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold pt-1.5 border-t border-white/10">
              <span>Job total</span>
              <span className="font-mono text-brand-accent">₹{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-white/80">Payment on site</label>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={inputClass}>
              <option value="PENDING">Not collected yet</option>
              <option value="CASH">Collected - cash</option>
              <option value="UPI">Collected - UPI</option>
            </select>
          </div>

          {/* Photos */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-white/80">Photos (at least 1 "after")</label>
            {!isCloudinaryConfigured() && (
              <p className="text-xs text-red-300">
                Photo upload isn't configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to
                the frontend .env and restart.
              </p>
            )}
            <div className="flex gap-2">
              {["before", "after"].map((label) => (
                <label
                  key={label}
                  className="flex-1 text-center cursor-pointer rounded-lg border border-dashed border-white/20 hover:bg-white/5 py-2.5 text-xs font-semibold text-white/70"
                >
                  + Add {label} photo
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleFiles(e.target.files, label);
                      e.target.value = "";
                    }}
                  />
                </label>
              ))}
            </div>
            {uploading > 0 && <p className="text-xs text-white/50">Uploading {uploading} photo(s)...</p>}
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {photos.map((p, i) => (
                  <div key={p.url + i} className="relative aspect-square rounded-lg overflow-hidden border border-white/10">
                    <img src={p.url} alt={`${p.label} work`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-center py-0.5 uppercase tracking-wide">
                      {p.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-xs leading-none"
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-lg border border-white/15 text-sm text-white/70 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploading > 0}
              className="flex-1 rounded-lg bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 text-sm font-semibold py-3 transition-colors"
            >
              {submitting ? "Submitting..." : "Submit for customer approval"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}