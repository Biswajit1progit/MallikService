const STATUS_STYLES = {
  PENDING: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  CONFIRMED: "bg-brand-cool/15 text-brand-cool border-brand-cool/30",
  SCHEDULED: "bg-brand-cool/15 text-brand-cool border-brand-cool/30",
  CALL_CONFIRMED: "bg-brand-cool/15 text-brand-cool border-brand-cool/30",
  ON_THE_WAY: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  IN_PROGRESS: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  PENDING_APPROVAL: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  COMPLETED: "bg-green-500/15 text-green-300 border-green-500/30",
  RESCHEDULE_NEEDED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  CANCELLED: "bg-red-500/15 text-red-300 border-red-500/30",
  NO_SHOW: "bg-red-500/15 text-red-300 border-red-500/30",
};

const STATUS_LABELS = {
  PENDING: "Pending payment",
  CONFIRMED: "Confirmed",
  SCHEDULED: "Scheduled",
  CALL_CONFIRMED: "Call confirmed",
  ON_THE_WAY: "Technician on the way",
  IN_PROGRESS: "In progress",
  PENDING_APPROVAL: "Awaiting your approval",
  COMPLETED: "Completed",
  RESCHEDULE_NEEDED: "Needs reschedule",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
};

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || "bg-white/10 text-white/60 border-white/20";
  const label = STATUS_LABELS[status] || status;

  return (
    <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full border ${style}`}>
      {label}
    </span>
  );
}