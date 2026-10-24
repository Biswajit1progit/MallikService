import LoginVideo from "./loginvideo.jsx";

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[5fr_6fr] bg-ink">
      {/* Brand panel - deep navy with vent-louvre signature + ambient glow */}
      <aside className="relative overflow-hidden bg-gradient-to-br from-brand-deep to-brand-deep-2 flex flex-col justify-between gap-8 p-7 md:p-12">
        {/* Ambient cooling mist blobs */}
        <div className="pointer-events-none absolute -top-24 -left-16 w-72 h-72 bg-mist-a blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-64 h-64 bg-mist-b blur-3xl" />

        {/* Vent louvre signature pattern */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between py-10 opacity-40">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="h-px w-[130%] -ml-[15%] -skew-y-6 bg-gradient-to-r from-transparent via-brand-cool/60 to-transparent"
            />
          ))}
        </div>

        {/* TOP: intro video on every auth page (sign in + sign up), full panel width */}
        <div className="relative z-10">
          <LoginVideo />
        </div>

        {/* BOTTOM: brand text */}
        <div className="relative z-10 w-full max-w-md">
          <div className="font-mono text-xs tracking-[0.12em] uppercase text-brand-cool mb-6">
            ServiceBook
          </div>
          <h1 className="font-display text-3xl md:text-[38px] leading-[1.15] font-semibold mb-4">
            Booked in minutes.
            <br />
            On site, on time.
          </h1>
          <p className="hidden md:block text-[15px] leading-relaxed text-white/60 mb-9">
            AC repair, gas refill, and installation — a technician confirmed and
            on the way, tracked live from the moment they set off.
          </p>
          <div className="hidden md:flex items-baseline gap-2.5 pt-5 border-t border-white/15">
            <span className="font-display text-2xl font-bold text-brand-accent">70km</span>
            <span className="text-[13px] text-white/50">service radius covered</span>
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-5 py-10 md:py-10">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}