// Defines which status a booking is allowed to move to from its current status.
// Keeping this as data (not scattered if/else in the controller) makes it easy
// to see the whole lifecycle at a glance and to extend later.
export const ALLOWED_TRANSITIONS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["CALL_CONFIRMED", "RESCHEDULE_NEEDED", "CANCELLED", "NO_SHOW"],
  CALL_CONFIRMED: ["ON_THE_WAY", "CANCELLED"],
  RESCHEDULE_NEEDED: ["SCHEDULED", "CANCELLED"],
  // NO_SHOW from ON_THE_WAY = technician travelled but the customer was not there / unreachable.
  // refund_eligible is already false by then, so there is no automatic refund.
  ON_THE_WAY: ["IN_PROGRESS", "NO_SHOW"],
  IN_PROGRESS: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ["RESCHEDULE_NEEDED", "CANCELLED"],
};

// Statuses a booking can still be cancelled/rescheduled from by the customer.
// Anything at or past ON_THE_WAY is outside this list - matches the
// "even 1km, no refund" rule from the pricing plan.
export const CUSTOMER_MODIFIABLE_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "SCHEDULED",
  "CALL_CONFIRMED",
  "RESCHEDULE_NEEDED",
];

// A customer can only RESCHEDULE a booking that is already paid. A PENDING (unpaid)
// booking must be paid or cancelled - rescheduling it would skip payment.
export const CUSTOMER_RESCHEDULABLE_STATUSES = CUSTOMER_MODIFIABLE_STATUSES.filter((s) => s !== "PENDING");

export function isTransitionAllowed(fromStatus, toStatus) {
  return ALLOWED_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

// The moment a booking hits ON_THE_WAY, refund eligibility is permanently
// revoked for that booking, regardless of what happens afterward.
export function computeRefundEligible(currentRefundEligible, newStatus) {
  if (newStatus === "ON_THE_WAY") return false;
  return currentRefundEligible;
}