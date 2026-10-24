import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, getAccessToken } from "../api/client.js";
import { getSocket } from "../utils/socket.js";
import { disablePush, enablePush, getPushStatus, resyncPush } from "../utils/push.js";

const KIND_DOT = {
  booking: "bg-brand-cool",
  visit: "bg-brand-accent",
  reminder: "bg-amber-400",
  approval: "bg-amber-400",
  job: "bg-emerald-400",
  payment: "bg-emerald-400",
  refund: "bg-sky-400",
  alert: "bg-red-400",
  system: "bg-white/40",
};

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const PUSH_TEXT = {
  on: "Phone alerts are on",
  off: "Get alerts on this phone",
  blocked: "Alerts are blocked in your browser settings",
  "needs-install": "On iPhone: Share, then Add to Home Screen, to get alerts",
  unsupported: "This browser can't show phone alerts",
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState("off");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [toast, setToast] = useState(null);
  const boxRef = useRef(null);
  const toastTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/notifications");
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      /* the bell is optional: stay quiet if the server is busy */
    }
  }, []);

  // first load, a slow refresh as a safety net, and a refresh whenever the tab comes back
  useEffect(() => {
    load();
    resyncPush();
    getPushStatus().then(setPushStatus);
    const timer = setInterval(load, 60000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // live alerts over the socket
  useEffect(() => {
    let socket;
    try {
      socket = getSocket();
    } catch {
      return undefined;
    }
    const join = () => socket.emit("join-user", { accessToken: getAccessToken() });
    const onNew = (n) => {
      setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, 50)));
      setUnread((u) => u + 1);
      setToast(n);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 5000);
    };
    join();
    socket.on("connect", join);
    socket.on("notification", onNew);
    return () => {
      socket.off("connect", join);
      socket.off("notification", onNew);
      clearTimeout(toastTimer.current);
    };
  }, []);

  // close on outside tap or Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openItem(n) {
    setOpen(false);
    setToast(null);
    if (!n.read_at) {
      setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p)));
      setUnread((u) => Math.max(0, u - 1));
      apiClient.patch(`/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.url) navigate(n.url);
  }

  async function readAll() {
    setItems((prev) => prev.map((p) => ({ ...p, read_at: p.read_at || new Date().toISOString() })));
    setUnread(0);
    apiClient.post("/notifications/read-all").catch(() => {});
  }

  async function togglePush() {
    setPushError("");
    setPushBusy(true);
    try {
      if (pushStatus === "on") await disablePush();
      else await enablePush();
      setPushStatus(await getPushStatus());
    } catch (err) {
      setPushError(err?.response?.data?.message || err.message || "Couldn't change phone alerts");
      setPushStatus(await getPushStatus());
    } finally {
      setPushBusy(false);
    }
  }

  const canToggle = pushStatus === "on" || pushStatus === "off";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold leading-[18px] text-center text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[4.5rem] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 z-50 rounded-2xl border border-white/10 bg-ink shadow-2xl shadow-black/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="font-display font-semibold text-sm">Notifications</div>
            {unread > 0 && (
              <button onClick={readAll} className="text-xs text-brand-cool hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[55vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-white/45">Nothing yet. Updates about your bookings will show up here.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`w-full text-left flex gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${n.read_at ? "opacity-60" : ""}`}
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read_at ? "bg-white/20" : KIND_DOT[n.kind] || "bg-brand-accent"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold truncate">{n.title}</span>
                      <span className="text-[11px] text-white/40 shrink-0">{timeAgo(n.created_at)}</span>
                    </span>
                    <span className="block text-xs text-white/65 mt-0.5 leading-snug">{n.body}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="px-4 py-3 border-t border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-white/60">{PUSH_TEXT[pushStatus]}</span>
              {canToggle && (
                <button
                  onClick={togglePush}
                  disabled={pushBusy}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                    pushStatus === "on" ? "border border-white/15 bg-white/5 hover:bg-white/10" : "bg-brand-accent hover:bg-brand-accent-hover"
                  }`}
                >
                  {pushBusy ? "Please wait" : pushStatus === "on" ? "Turn off" : "Turn on"}
                </button>
              )}
            </div>
            {pushError && <div className="mt-2 text-xs text-red-300">{pushError}</div>}
          </div>
        </div>
      )}

      {toast && !open && (
        <button
          onClick={() => openItem(toast)}
          className="fixed z-50 left-3 right-3 bottom-4 sm:left-auto sm:right-5 sm:w-80 text-left rounded-xl border border-white/10 bg-ink shadow-2xl shadow-black/50 px-4 py-3"
        >
          <div className="text-sm font-semibold">{toast.title}</div>
          <div className="text-xs text-white/65 mt-0.5 leading-snug">{toast.body}</div>
        </button>
      )}
    </div>
  );
}