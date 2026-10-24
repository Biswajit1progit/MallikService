// Provider-agnostic notification layer. SMS was dropped (Twilio trial / India
// DLT made it unreliable), so for now nothing is sent from here - the tracking
// link is shown in the app and shared via WhatsApp click-to-chat / phone call.
// If a provider (MSG91, WhatsApp Business API...) is added later, implement it
// inside notifyCustomer only; callers never change.
export async function notifyCustomer(/* phone, message */) {
  return { sent: false, reason: "No notification provider configured" };
}