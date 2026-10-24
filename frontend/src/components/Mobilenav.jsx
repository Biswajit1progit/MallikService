import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/authcontext.jsx";
import { disablePush, enablePush, getPushStatus } from "../utils/push.js";

// Bottom bar for CUSTOMERS on phones (hidden from 768px up, where the normal header is used).
// Tabs: Home, Book, My bookings, Account. The notification bell stays in the top-right of each page.

const ICONS = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />,
  book: <><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="9" /></>,
  list: <><path d="M8 7h12M8 12h12M8 17h12" /><path d="M4 7h.01M4 12h.01M4 17h.01" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20c.8-4 3.7-6 7.5-6s6.7 2 7.5 6" /></>,
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// Pages where the bar makes sense. Login, signup and the public tracking page stay clean.
const SHOW_ON = ["/", "/book", "/bookings", "/policies", "/invoice"];

export default function MobileNav() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(false);
  const [pushStatus, setPushStatus] = useState("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // close the sheet whenever the page changes
  useEffect(() => setSheet(false), [pathname]);

  useEffect(() => {
    if (!sheet) return undefined;
    getPushStatus().then(setPushStatus);
    const onKey = (e) => e.key === "Escape" && setSheet(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  const visible = user?.role === "customer" && SHOW_ON.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
  if (!visible) return null;

  const active = {
    home: pathname === "/",
    book: pathname === "/book",
    bookings: pathname.startsWith("/bookings") || pathname.startsWith("/invoice"),
    account: sheet,
  };

  async function togglePush() {
    setError("");
    setBusy(true);
    try {
      if (pushStatus === "on") await disablePush();
      else await enablePush();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Couldn't change phone alerts");
    } finally {
      setPushStatus(await getPushStatus());
      setBusy(false);
    }
  }

  async function handleLogout() {
    setSheet(false);
    await logout();
    navigate("/");
  }

  const tab = (key, to, icon, label) => (
    <Link
      to={to}
      aria-current={active[key] ? "page" : undefined}
      className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium transition-colors ${active[key] ? "text-brand-accent" : "text-white/55"}`}
    >
      <Icon name={icon} />
      {label}
    </Link>
  );

  const pushLabel = {
    on: "On",
    off: "Off",
    blocked: "Blocked in browser",
    "needs-install": "Add to Home Screen first",
    unsupported: "Not supported",
  }[pushStatus];

  return (
    <div className="md:hidden">
      {/* room so the last bit of every page is not hidden behind the bar */}
      <div className="bg-ink" style={{ height: "calc(3.75rem + env(safe-area-inset-bottom))" }} />

      <nav
        aria-label="Main"
        className="fixed bottom-0 inset-x-0 z-40 flex border-t border-white/10 bg-ink/95 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tab("home", "/", "home", "Home")}
        {tab("book", "/book", "book", "Book")}
        {tab("bookings", "/bookings", "list", "My bookings")}
        <button
          type="button"
          onClick={() => setSheet((s) => !s)}
          aria-expanded={sheet}
          className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium transition-colors ${active.account ? "text-brand-accent" : "text-white/55"}`}
        >
          <Icon name="user" />
          Account
        </button>
      </nav>

      {sheet && (
        <>
          <button aria-label="Close" onClick={() => setSheet(false)} className="fixed inset-0 z-40 bg-black/60" />
          <div
            role="dialog"
            aria-label="Account"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-white/10 bg-ink px-5 pt-4"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-4">
              <div className="font-display font-semibold text-lg leading-tight">{user.name || "Your account"}</div>
              <div className="text-xs text-white/50 break-all">{user.email}</div>
            </div>

            <div className="rounded-xl border border-white/10 divide-y divide-white/10 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div>
                  <div className="text-sm font-medium">Phone alerts</div>
                  <div className="text-xs text-white/50">{pushLabel}</div>
                </div>
                {(pushStatus === "on" || pushStatus === "off") && (
                  <button
                    onClick={togglePush}
                    disabled={busy}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${pushStatus === "on" ? "border border-white/15 bg-white/5" : "bg-brand-accent"}`}
                  >
                    {busy ? "Please wait" : pushStatus === "on" ? "Turn off" : "Turn on"}
                  </button>
                )}
              </div>
              <Link to="/policies" className="flex items-center justify-between px-4 py-3.5 text-sm font-medium">
                Policies and warranty
                <span className="text-white/35">›</span>
              </Link>
              <button onClick={handleLogout} className="w-full text-left px-4 py-3.5 text-sm font-medium text-red-300">
                Log out
              </button>
            </div>
            {error && <div className="mt-3 text-xs text-red-300">{error}</div>}
          </div>
        </>
      )}
    </div>
  );
}