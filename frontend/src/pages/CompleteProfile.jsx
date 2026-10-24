import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { apiClient } from "../api/client.js";
import { useAuth } from "../context/authcontext.jsx";

// One-time step for users who signed up with Google (no phone on file).
// Every booking needs a phone so the technician can call to confirm.
export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, isLoading, updateUser } = useAuth();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.phone) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const { data } = await apiClient.patch("/auth/profile", { phone });
      updateUser(data.user);
      navigate("/book", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save your number. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-glass p-7 md:p-9">
        <span className="block font-mono text-xs tracking-[0.1em] uppercase text-brand-cool mb-2.5">
          One last step
        </span>
        <h2 className="font-display text-2xl font-semibold mb-2">Add your mobile number</h2>
        <p className="text-sm text-white/50 mb-8 leading-relaxed">
          Hi {user.name?.split(" ")[0]}, our technician calls you to confirm before
          visiting. We only use this number for your bookings.
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-semibold text-white/80">
              Mobile number
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              placeholder="10-digit mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
              className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-[15px] text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors font-mono tracking-wide"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 text-white font-semibold text-[15px] py-3.5"
          >
            {saving ? "Saving..." : "Save & continue"}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}