/* import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/authLayout.jsx";
import GoogleAuthButton from "../components/googleAuthButton.jsx";
import { apiClient } from "../api/client.js";
import { useAuth } from "../context/authcontext.jsx";

const inputClass =
  "rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-[15px] text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors";

export default function Signup() {
  const navigate = useNavigate();
  const { loginSuccess } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const { data } = await apiClient.post("/auth/signup", form);
      loginSuccess(data);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't create your account. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoogleSuccess(data) {
    loginSuccess(data);
   navigate(data.user?.needsPhone ? "/complete-profile" : "/");
  }

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-glass p-7 md:p-9">
        <span className="block font-mono text-xs tracking-[0.1em] uppercase text-brand-cool mb-2.5">
          Get started
        </span>
        <h2 className="font-display text-2xl font-semibold mb-2">Create your account</h2>
        <p className="text-sm text-white/50 mb-8 leading-relaxed">
          Takes under a minute. You'll need your phone number so your technician
          can reach you on the day of service.
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-semibold text-white/80">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={handleChange}
              required
              autoComplete="name"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-semibold text-white/80">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-semibold text-white/80">
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="10-digit mobile number"
              value={form.phone}
              onChange={handleChange}
              required
              autoComplete="tel"
              className={`${inputClass} font-mono tracking-wide`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-semibold text-white/80">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1.5 rounded-lg bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-white font-semibold text-[15px] py-3.5"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6 text-xs text-white/30">
          <span className="flex-1 h-px bg-white/10" />
          or continue with
          <span className="flex-1 h-px bg-white/10" />
        </div>

        <GoogleAuthButton
          onSuccess={handleGoogleSuccess}
          onError={() => setError("Google sign-in failed.")}
        />

        <p className="mt-7 text-sm text-white/50 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-cool font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
} */


 import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/authLayout.jsx";
import GoogleAuthButton from "../components/googleAuthButton.jsx";

import { apiClient } from "../api/client.js";
import { useAuth } from "../context/authcontext.jsx";
import { homeFor } from "../utils/roleHome.js";

const inputClass =
  "w-full rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-[15px] text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors";

export default function Signup() {
  const navigate = useNavigate();
  const { loginSuccess } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const { data } = await apiClient.post("/auth/signup", form);
      loginSuccess(data);
      navigate(homeFor(data.user));
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't create your account. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoogleSuccess(data) {
    loginSuccess(data);
    navigate(homeFor(data.user));
  }

  return (
    <AuthLayout>
      {/* Mascot animation: takes the card's width, so it scales with the screen */}
      {/* <div className="w-full mx-auto mb-4 md:mb-5">
        <MallikHero />
      </div> */}

      <div className="w-full rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-glass p-5 sm:p-7 md:p-9">
        <span className="block font-mono text-xs tracking-[0.1em] uppercase text-brand-cool mb-2.5">
          Get started
        </span>
        <h2 className="font-display text-xl sm:text-2xl font-semibold mb-2">Create your account</h2>
        <p className="text-sm text-white/50 mb-6 sm:mb-8 leading-relaxed">
          Takes under a minute. You'll need your phone number so your technician
          can reach you on the day of service.
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-semibold text-white/80">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={handleChange}
              required
              autoComplete="name"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-semibold text-white/80">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-semibold text-white/80">
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              placeholder="10-digit mobile number"
              value={form.phone}
              onChange={handleChange}
              required
              autoComplete="tel"
              className={`${inputClass} font-mono tracking-wide`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-semibold text-white/80">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1.5 rounded-lg bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-white font-semibold text-[15px] py-3.5"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6 text-xs text-white/30">
          <span className="flex-1 h-px bg-white/10" />
          or continue with
          <span className="flex-1 h-px bg-white/10" />
        </div>

        <GoogleAuthButton
          onSuccess={handleGoogleSuccess}
          onError={() => setError("Google sign-in failed.")}
        />

        <p className="mt-7 text-sm text-white/50 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-cool font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}