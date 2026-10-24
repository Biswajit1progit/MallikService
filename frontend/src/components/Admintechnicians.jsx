import { useState, useEffect } from "react";
import { apiClient } from "../api/client.js";

const inputClass =
  "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-brand-cool";

// Admin: see every technician, give one a login, switch one on/off, set the daily limit.
export default function AdminTechnicians() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const { data } = await apiClient.get("/technician/admin/list");
      setList(data.technicians);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load technicians.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function patch(id, body) {
    setError("");
    try {
      await apiClient.patch(`/technician/admin/${id}`, body);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't update this technician.");
    }
  }

  function toggleActive(t) {
    const msg = t.is_active
      ? `Switch off ${t.name}? They will be logged out and can't log in. New bookings won't be given to them.`
      : `Switch ${t.name} back on?`;
    if (window.confirm(msg)) patch(t.id, { isActive: !t.is_active });
  }

  function changeLimit(t) {
    const v = window.prompt(`How many jobs per day can ${t.name} take? (1 to 30)`, String(t.max_bookings_per_day));
    if (v === null) return;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 30) {
      setError("Enter a whole number from 1 to 30.");
      return;
    }
    patch(t.id, { maxBookingsPerDay: n });
  }

  const withoutLogin = list.filter((t) => !t.user_id);

  return (
    <section>
      {error && (
        <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</div>
      )}

      {withoutLogin.length > 0 && !showForm && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {withoutLogin.map((t) => t.name).join(", ")} has no login yet, so can't use the technician panel.
          <button onClick={() => setShowForm(true)} className="ml-2 underline font-semibold">
            Create login
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-white/40 text-sm">Loading...</p>
      ) : (
        <div className="flex flex-col gap-3 mb-5">
          {list.map((t) => (
            <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex justify-between items-start gap-3 mb-2">
                <div>
                  <div className="font-display font-semibold">{t.name}</div>
                  <div className="text-xs text-white/50 font-mono">{t.phone}</div>
                  <div className="text-xs text-white/40">{t.email || "No login yet"}</div>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    t.is_active
                      ? "bg-green-500/15 text-green-300 border-green-500/30"
                      : "bg-red-500/15 text-red-300 border-red-500/30"
                  }`}
                >
                  {t.is_active ? "Active" : "Off"}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono text-white/55 mb-3">
                <span>{t.jobs_today} today</span>
                <span>{t.on_site_now} on site</span>
                <span>{t.completed_total} completed</span>
                <span>max {t.max_bookings_per_day}/day</span>
                {t.last_active_at && <span>last active {new Date(t.last_active_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => changeLimit(t)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/15 hover:bg-white/5">
                  Daily limit
                </button>
                <button
                  onClick={() => toggleActive(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    t.is_active ? "border-red-500/30 text-red-300 hover:bg-red-500/10" : "border-green-500/30 text-green-300 hover:bg-green-500/10"
                  }`}
                >
                  {t.is_active ? "Switch off" : "Switch on"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <CreateForm
          withoutLogin={withoutLogin}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      ) : (
        <button onClick={() => setShowForm(true)} className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover">
          + Add technician login
        </button>
      )}
    </section>
  );
}

function CreateForm({ withoutLogin, onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", technicianId: withoutLogin[0]?.id ?? "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await apiClient.post("/technician/admin", {
        ...form,
        technicianId: form.technicianId === "" ? undefined : Number(form.technicianId),
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't create this login.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-white/10 bg-white/[0.04] p-4 flex flex-col gap-3">
      <h3 className="font-display font-semibold text-sm">New technician login</h3>
      {withoutLogin.length > 0 && (
        <div>
          <label className="text-xs text-white/60">Give the login to</label>
          <select value={form.technicianId} onChange={set("technicianId")} className={`${inputClass} mt-1`}>
            {withoutLogin.map((t) => (
              <option key={t.id} value={t.id} className="bg-ink">
                {t.name} (existing technician)
              </option>
            ))}
            <option value="" className="bg-ink">
              A new technician
            </option>
          </select>
        </div>
      )}
      <input className={inputClass} placeholder="Full name" value={form.name} onChange={set("name")} required />
      <input className={inputClass} type="email" placeholder="Email (used to log in)" value={form.email} onChange={set("email")} required />
      <input className={inputClass} placeholder="Mobile number (10 digits)" value={form.phone} onChange={set("phone")} required />
      <input className={inputClass} type="text" placeholder="Password (at least 8 characters)" value={form.password} onChange={set("password")} required minLength={8} />
      <p className="text-[11px] text-white/40">Tell the technician this email and password. They can open the site on their phone and log in.</p>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button disabled={saving} className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60">
          {saving ? "Creating..." : "Create login"}
        </button>
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm border border-white/15 hover:bg-white/5">
          Cancel
        </button>
      </div>
    </form>
  );
}