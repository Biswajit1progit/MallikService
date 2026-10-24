import { apiClient } from "../api/client.js";

let scriptLoadingPromise = null;

// Loads Razorpay's checkout script once, reuses it on subsequent calls
// instead of injecting the <script> tag repeatedly.
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Couldn't load the payment gateway. Check your connection."));
    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
}

// Runs the full pay flow for a booking: create order -> open Razorpay's
// checkout modal -> verify the signature on our backend -> report the result.
// Returns via callbacks rather than a plain promise, since Razorpay's modal
// is itself callback-based (the person might just close it without paying).
export async function payForBooking(booking, { onSuccess, onFailure, onDismiss }) {
  try {
    await loadRazorpayScript();

    const { data: order } = await apiClient.post("/payments/create-order", {
      bookingId: booking.id,
    });

    const razorpay = new window.Razorpay({
      key: order.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: "ServiceBook",
      description: `Booking charge - ${booking.service_name || "service"}`,
      theme: { color: "#ff8a3d" },
      handler: async (response) => {
        try {
          await apiClient.post("/payments/verify", {
            bookingId: booking.id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          onSuccess?.();
        } catch (err) {
          onFailure?.(err.response?.data?.message || "Payment succeeded but verification failed. Contact support.");
        }
      },
      modal: {
        ondismiss: () => onDismiss?.(),
      },
    });

    razorpay.on("payment.failed", (response) => {
      onFailure?.(response.error?.description || "Payment failed. Try again.");
    });

    razorpay.open();
  } catch (err) {
    onFailure?.(err.response?.data?.message || err.message || "Couldn't start payment.");
  }
}