/* import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/authLayout.jsx";
import GoogleAuthButton from "../components/googleAuthButton.jsx";
import { apiClient } from "../api/client.js";
import { useAuth } from "../context/authcontext.jsx";

export default function Login() {
  const navigate = useNavigate();
  const { loginSuccess } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] =  useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const { data } = await apiClient.post("/auth/login", form);
      loginSuccess(data);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't sign you in. Try again.");
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
          Welcome back
        </span>
        <h2 className="font-display text-2xl font-semibold mb-2">Sign in to your account</h2>
        <p className="text-sm text-white/50 mb-8 leading-relaxed">
          Book a technician, track a visit in progress, or check on a warranty claim.
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              {error}
            </div>
          )}

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
              className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-[15px] text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors"
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
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
              className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-[15px] text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1.5 rounded-lg bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-white font-semibold text-[15px] py-3.5"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
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
          New here?{" "}
          <Link to="/signup" className="text-brand-cool font-semibold hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
} */



  import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import GoogleAuthButton from "../components/GoogleAuthButton.jsx";
import { apiClient } from "../api/client.js";
import { useAuth } from "../context/authcontext.jsx";
import { homeFor } from "../utils/roleHome.js";

export default function Login() {
  const navigate = useNavigate();
  const { loginSuccess } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
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
      const { data } = await apiClient.post("/auth/login", form);
      loginSuccess(data);
      navigate(homeFor(data.user));
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't sign you in. Try again.");
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
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-glass p-7 md:p-9">
        <span className="block font-mono text-xs tracking-[0.1em] uppercase text-brand-cool mb-2.5">
          Welcome back
        </span>
        <h2 className="font-display text-2xl font-semibold mb-2">Sign in to your account</h2>
        <p className="text-sm text-white/50 mb-8 leading-relaxed">
          Book a technician, track a visit in progress, or check on a warranty claim.
        </p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
              {error}
            </div>
          )}

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
              className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-[15px] text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors"
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
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
              className="rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-[15px] text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1.5 rounded-lg bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-white font-semibold text-[15px] py-3.5"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
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
          New here?{" "}
          <Link to="/signup" className="text-brand-cool font-semibold hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}