// The row of numbers at the top of the admin dashboard. Each tile jumps to the screen
// where you act on it.
/* const TILES = [
  { key: "attention", label: "Needs attention", color: "text-red-300", go: ["activity", { attention: true }] },
  { key: "awaiting_customer", label: "Awaiting customer approval", color: "text-purple-300", go: ["jobs", { status: "PENDING_APPROVAL" }] },
  { key: "disputed", label: "Customer disputes", color: "text-amber-300", go: ["jobs", { status: "PENDING_APPROVAL" }] },
  { key: "failed_refunds", label: "Failed refunds", color: "text-red-300", go: ["refunds", { status: "FAILED" }] },
  { key: "unassigned", label: "No technician yet", color: "text-brand-cool", go: ["jobs", {}] },
];

export default function AdminOverview({ overview, onNavigate }) {
  if (!overview) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
      {TILES.map((t) => {
        const n = overview[t.key] ?? 0;
        return (
          <button
            key={t.key}
            onClick={() => onNavigate(...t.go)}
            className={`text-left rounded-xl border p-3.5 transition-colors ${
              n > 0 ? "border-white/20 bg-white/[0.06] hover:bg-white/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
          >
            <div className={`font-display text-2xl font-bold ${n > 0 ? t.color : "text-white/30"}`}>{n}</div>
            <div className="text-[11px] text-white/50 leading-snug mt-1">{t.label}</div>
          </button>
        );
      })}
    </div>
  );
} */
// The row of numbers at the top of the admin dashboard. Each tile jumps to the screen
// where you act on it.
const TILES = [
  { key: "attention", label: "Needs attention", color: "text-red-300", go: ["activity", { attention: true }] },
  { key: "calls_overdue", label: "Confirmation calls overdue", color: "text-red-300", go: ["jobs", { status: "SCHEDULED" }] },
  { key: "awaiting_customer", label: "Awaiting customer approval", color: "text-purple-300", go: ["jobs", { status: "PENDING_APPROVAL" }] },
  { key: "disputed", label: "Customer disputes", color: "text-amber-300", go: ["jobs", { status: "PENDING_APPROVAL" }] },
  { key: "failed_refunds", label: "Failed refunds", color: "text-red-300", go: ["refunds", { status: "FAILED" }] },
  { key: "unassigned", label: "No technician yet", color: "text-brand-cool", go: ["jobs", {}] },
];

export default function AdminOverview({ overview, onNavigate }) {
  if (!overview) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
      {TILES.map((t) => {
        const n = overview[t.key] ?? 0;
        return (
          <button
            key={t.key}
            onClick={() => onNavigate(...t.go)}
            className={`text-left rounded-xl border p-3.5 transition-colors ${
              n > 0 ? "border-white/20 bg-white/[0.06] hover:bg-white/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
          >
            <div className={`font-display text-2xl font-bold ${n > 0 ? t.color : "text-white/30"}`}>{n}</div>
            <div className="text-[11px] text-white/50 leading-snug mt-1">{t.label}</div>
          </button>
        );
      })}
    </div>
  );
}