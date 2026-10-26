import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client.js";

const when = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
const whenTime = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

const ROLE_STYLE = {
  customer: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  technician: "bg-brand-cool/15 text-brand-cool border-brand-cool/30",
  admin: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

const chip = (on) =>
  `shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
    on ? "bg-white/15 text-white" : "bg-white/5 text-white/55 hover:bg-white/10"
  }`;

// Admin: every customer and technician with their details, plus
//   Remove account        - they can't log in any more; they may sign up again (e.g. a mistaken signup)
//   Delete forever        - removes the account AND blocks their email and mobile number for good
//   Blacklist tab         - see blocked emails/numbers and lift a block
export default function AdminUsers() {
  const [view, setView] = useState("active"); // active | removed | blacklist
  const [role, setRole] = useState("all"); // all | customer | technician
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);

  // wait a moment after typing before asking the server
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "blacklist") {
        const { data } = await apiClient.get("/admin/users/blocked");
        setBlocked(data.blocked);
      } else {
        const params = new URLSearchParams({ status: view });
        if (role !== "all") params.set("role", role);
        if (query) params.set("q", query);
        const { data } = await apiClient.get(`/admin/users?${params}`);
        setUsers(data.users);
      }
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load users.");
    } finally {
      setLoading(false);
    }
  }, [view, role, query]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id, path, confirmText, askReason) {
    if (!window.confirm(confirmText)) return;
    let reason = "";
    if (askReason) {
      const r = window.prompt("Reason (optional, only you see this):", "");
      if (r === null) return;
      reason = r;
    }
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const { data } = await apiClient.post(`/admin/users/${id}/${path}`, { reason });
      setNotice(data.message);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "That didn't work. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const remove = (u) =>
    act(
      u.id,
      "remove",
      `Remove ${u.name}'s account?\n\nThey will be logged out and can't log in. Their old bookings stay in your records.\nThey CAN sign up again with the same email and mobile number.`,
      true
    );

  const wipe = (u) =>
    act(
      u.id,
      "blacklist",
      `Delete ${u.name} FOREVER?\n\nTheir account is removed and their email and mobile number are blacklisted. They can never sign up or log in again.\nOld bookings stay in your records.`,
      true
    );

  async function unblock(b) {
    if (!window.confirm(`Allow ${b.email || b.phone} to sign up again?`)) return;
    setBusyId(`b${b.id}`);
    setError("");
    setNotice("");
    try {
      const { data } = await apiClient.delete(`/admin/users/blocked/${b.id}`);
      setNotice(data.message);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't unblock.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      {/* View switch */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        <button onClick={() => setView("active")} className={chip(view === "active")}>Users</button>
        <button onClick={() => setView("removed")} className={chip(view === "removed")}>Removed</button>
        <button onClick={() => setView("blacklist")} className={chip(view === "blacklist")}>Blacklist</button>
      </div>

      {view !== "blacklist" && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or mobile"
            className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-brand-cool"
          />
          <div className="flex gap-1.5">
            {[["all", "All"], ["customer", "Customers"], ["technician", "Technicians"]].map(([id, label]) => (
              <button key={id} onClick={() => setRole(id)} className={chip(role === id)}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</div>}
      {notice && <div className="mb-4 text-sm text-green-300 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">{notice}</div>}

      {loading ? (
        <p className="text-white/40 text-sm">Loading...</p>
      ) : view === "blacklist" ? (
        blocked.length === 0 ? (
          <p className="text-white/40 text-sm">Nobody is blacklisted.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {blocked.map((b) => (
              <div key={b.id} className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold break-all">{b.email || b.phone}</div>
                  {b.name && <div className="text-xs text-white/50">{b.name}</div>}
                  {b.reason && <div className="text-xs text-white/50 mt-0.5">Reason: {b.reason}</div>}
                  <div className="text-[11px] text-white/35 mt-0.5">Blocked on {when(b.created_at)}</div>
                </div>
                <button
                  disabled={busyId === `b${b.id}`}
                  onClick={() => unblock(b)}
                  className="self-start sm:self-auto shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-green-500/30 text-green-300 hover:bg-green-500/10 disabled:opacity-50"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )
      ) : users.length === 0 ? (
        <p className="text-white/40 text-sm">{view === "removed" ? "No removed accounts." : "No users found."}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {users.map((u) => {
            const isRemoved = !!u.removed_at;
            const email = isRemoved ? u.removed_email : u.email;
            const phone = isRemoved ? u.removed_phone : u.phone;
            return (
              <div key={u.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex justify-between items-start gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="font-display font-semibold truncate">{u.name}</div>
                    <div className="text-xs text-white/60 break-all">{email}</div>
                    <div className="text-xs text-white/50 font-mono">{phone || "No mobile number"}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border capitalize ${ROLE_STYLE[u.role]}`}>{u.role}</span>
                    {u.blacklisted && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">Blacklisted</span>
                    )}
                    {!isRemoved && !u.is_active && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">Switched off</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono text-white/55 mb-3">
                  <span>joined {when(u.created_at)}</span>
                  <span>via {u.auth_provider === "google" ? "Google" : "email"}</span>
                  {u.role === "customer" && (
                    <>
                      <span>{u.bookings_total} bookings</span>
                      <span>{u.bookings_completed} completed</span>
                    </>
                  )}
                  {u.open_jobs > 0 && <span className="text-amber-300">{u.open_jobs} open</span>}
                  {u.last_active_at && <span>last active {whenTime(u.last_active_at)}</span>}
                </div>

                {isRemoved ? (
                  <div className="text-xs text-white/45 mb-3">
                    Removed on {when(u.removed_at)}
                    {u.removed_reason ? ` · ${u.removed_reason}` : ""}. {u.blacklisted ? "They can never sign up again." : "They can sign up again."}
                  </div>
                ) : null}

                {u.role !== "admin" && (!isRemoved || !u.blacklisted) && (
                  <div className="flex flex-wrap gap-2">
                    {!isRemoved && (
                      <button
                        disabled={busyId === u.id}
                        onClick={() => remove(u)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                      >
                        Remove account
                      </button>
                    )}
                    <button
                      disabled={busyId === u.id}
                      onClick={() => wipe(u)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Delete forever + blacklist
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}