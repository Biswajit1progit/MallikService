import { Link } from "react-router-dom";
import { useAuth } from "../context/authcontext.jsx";
import TechnicianIllustration from "../components/TechnicianIllustration.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import { IconSnowflake, IconWrench, IconGauge, IconTools } from "../components/ServiceIcons.jsx";

const services = [
  {
    icon: IconTools,
    title: "AC Installation & Uninstallation",
    desc: "Split & window AC fitted and tested, or safely removed.",
    meta: "30 day warranty",
  },
  {
    icon: IconGauge,
    title: "AC Location Shift",
    desc: "Moving house or room? We take your AC down and fit it at the new place.",
    meta: "30 day warranty",
  },
  {
    icon: IconSnowflake,
    title: "AC Maintenance",
    desc: "Servicing, gas filling and repair. Filter cleaning, dust flush, full check.",
    meta: "30 day warranty",
  },
  {
    icon: IconWrench,
    title: "Others",
    desc: "Washing machine, fridge and other home appliances.",
    meta: "Quoted on site",
  },
];

const steps = [
  { n: "01", title: "Book & pay deposit", desc: "Pick a service, share your address, pay a small booking charge based on distance." },
  { n: "02", title: "Technician calls you", desc: "Confirms your slot and that you're home before heading out." },
  { n: "03", title: "Track live on the way", desc: "A link shows your technician's location in real time, no app needed." },
  { n: "04", title: "Service + warranty", desc: "Work is logged with photos, and covered under warranty after you approve." },
];

export default function Home() {
  const { user, logout, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-ink text-white relative overflow-x-hidden">
      {/* Ambient cooling mist, page-wide */}
      <div className="pointer-events-none fixed -top-32 left-1/4 w-72 h-72 md:w-96 md:h-96 bg-mist-a blur-3xl" />
      <div className="pointer-events-none fixed top-[38rem] right-0 w-56 h-56 md:w-72 md:h-72 bg-mist-b blur-3xl" />

      {/* Header */}
      <header className="relative z-10 flex justify-between items-center gap-3 px-5 sm:px-6 md:px-10 py-4 sm:py-5 border-b border-white/10 backdrop-blur-md">
        <span className="font-display font-bold text-lg sm:text-xl shrink-0">ServiceBook</span>

        {isLoading ? null : user ? (
          <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
            {user.role === "technician" && (
              <Link
                to="/technician"
                className="shrink-0 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-brand-cool/15 text-brand-cool border border-brand-cool/30 hover:bg-brand-cool/25 transition-colors"
              >
                My jobs
              </Link>
            )}
            {user.role === "admin" && (
              <Link
                to="/admin"
                className="shrink-0 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-brand-cool/15 text-brand-cool border border-brand-cool/30 hover:bg-brand-cool/25 transition-colors"
              >
                Admin
              </Link>
            )}
            <NotificationBell />
            <span className={`text-xs sm:text-sm text-white/60 truncate max-w-[100px] sm:max-w-none ${user.role === "customer" ? "hidden md:inline" : ""}`}>
              {user.name || user.email}
            </span>
            <button
              onClick={logout}
              className={`shrink-0 px-3 sm:px-4 py-2 rounded-lg border border-white/15 text-xs sm:text-sm bg-white/5 hover:bg-white/10 transition-colors ${user.role === "customer" ? "hidden md:inline-flex" : ""}`}
            >
              Log out
            </button>
          </div>
        ) : (
          <div className="flex gap-2 sm:gap-2.5 shrink-0">
            <Link
              to="/login"
              className="px-3 sm:px-4 py-2 rounded-lg border border-white/15 text-xs sm:text-sm font-semibold hover:bg-white/5 transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover transition-colors"
            >
              Sign up
            </Link>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative z-10 px-5 sm:px-6 md:px-10 pt-10 sm:pt-14 md:pt-20 pb-12 sm:pb-16 max-w-6xl mx-auto grid md:grid-cols-2 gap-8 md:gap-10 items-center">
        <div>
          <span className="inline-block font-mono text-[10px] sm:text-xs tracking-[0.08em] sm:tracking-[0.1em] uppercase text-brand-cool mb-4 sm:mb-5 px-3 py-1.5 rounded-lg border border-brand-cool/30 bg-brand-cool/5 leading-relaxed">
            Trusted local AC & appliance service
          </span>
          <h1 className="font-display text-[28px] leading-[1.15] sm:text-4xl md:text-5xl sm:leading-[1.12] font-semibold mb-4 sm:mb-5">
            {user ? `Welcome, ${user.name || user.email}` : "Book an AC technician near you"}
          </h1>
          <p className="text-white/60 text-sm sm:text-base md:text-lg leading-relaxed mb-7 sm:mb-8 max-w-md">
            {user
              ? "You're signed in. Booking is coming next - for now, take a look at what we cover."
              : "AC installation, shifting, maintenance and appliance repair - a real technician confirmed by phone and tracked live on the way to your door."}
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <Link
              to={user ? (user.role === "technician" ? "/technician" : "/book") : "/signup"}
              className="text-center px-6 py-3.5 rounded-lg text-sm font-semibold bg-brand-accent hover:bg-brand-accent-hover transition-colors"
            >
              {user ? (user.role === "technician" ? "Open my jobs" : "Book now") : "Get started"}
            </Link>
            <a
              href="#services"
              className="text-center px-6 py-3.5 rounded-lg text-sm font-semibold border border-white/15 hover:bg-white/5 transition-colors"
            >
              See what we fix
            </a>
          </div>

         

          {/* Trust bar */}
          <div className="flex flex-wrap gap-x-6 sm:gap-x-8 gap-y-4 mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-white/10">
            <div>
              <div className="font-display text-lg sm:text-xl font-bold text-brand-accent">70km</div>
              <div className="text-[11px] sm:text-xs text-white/45">service radius</div>
            </div>
            <div>
              <div className="font-display text-lg sm:text-xl font-bold text-brand-cool">Live</div>
              <div className="text-[11px] sm:text-xs text-white/45">technician tracking</div>
            </div>
            <div>
              <div className="font-display text-lg sm:text-xl font-bold text-brand-cool">30 days</div>
              <div className="text-[11px] sm:text-xs text-white/45">warranty on AC work</div>
            </div>
          </div>
        </div>

        <div className="relative flex justify-center order-first md:order-last">
          <TechnicianIllustration className="w-full max-w-[240px] sm:max-w-[300px] md:max-w-[380px]" />
        </div>
      </section>

      {/* Services grid */}
      <section id="services" className="relative z-10 px-5 sm:px-6 md:px-10 py-12 sm:py-16 max-w-6xl mx-auto">
        <div className="mb-8 sm:mb-10">
          <span className="font-mono text-[10px] sm:text-xs tracking-[0.1em] uppercase text-brand-cool">
            What we cover
          </span>
          <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-semibold mt-2">Services</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {services.map(({ icon: Icon, title, desc, meta }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-5 sm:p-6 hover:border-brand-cool/40 hover:bg-white/[0.05] transition-colors"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-brand-cool/10 flex items-center justify-center mb-3.5 sm:mb-4">
                <Icon className="w-5 h-5 text-brand-cool" />
              </div>
              <h3 className="font-display font-semibold text-base sm:text-lg mb-1.5">{title}</h3>
              <p className="text-[13px] sm:text-sm text-white/55 leading-relaxed mb-3.5 sm:mb-4">{desc}</p>
              <span className="text-[11px] sm:text-xs font-mono text-brand-accent">{meta}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-5 sm:px-6 md:px-10 py-12 sm:py-16 max-w-6xl mx-auto">
        <div className="mb-8 sm:mb-10">
          <span className="font-mono text-[10px] sm:text-xs tracking-[0.1em] uppercase text-brand-cool">
            The process
          </span>
          <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-semibold mt-2">How it works</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-6 relative">
          {steps.map((step, i) => (
            <div key={step.n} className="relative">
              {i < steps.length - 1 && (
                <span className="hidden lg:block absolute top-5 left-full w-6 h-px bg-gradient-to-r from-brand-cool/40 to-transparent" />
              )}
              <span className="font-display text-2xl sm:text-3xl font-bold text-white/10">{step.n}</span>
              <h3 className="font-display font-semibold text-sm sm:text-base mt-2 mb-1.5">{step.title}</h3>
              <p className="text-[13px] sm:text-sm text-white/55 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-5 sm:px-6 md:px-10 py-8 sm:py-10 border-t border-white/10 max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-3 text-center sm:text-left">
        <span className="font-display font-semibold">ServiceBook</span>
        <span className="text-[11px] sm:text-xs text-white/40">
          Serving addresses within 70km of our base location ·{" "}
          <Link to="/policies" className="underline hover:text-white/70">
            Booking, cancellation &amp; refund policy
          </Link>
        </span>
      </footer>
    </div>
  );
}