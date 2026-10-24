import { apiClient } from "../api/client.js";

// Phone alerts (Web Push). Everything here is safe to call on any browser: unsupported ones just report it.

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// iPhones only allow web alerts after "Add to Home Screen".
export function needsInstallOnIphone() {
  if (typeof window === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installed = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  return ios && !installed;
}

function keyToBytes(base64Url) {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

// "unsupported" | "needs-install" | "blocked" | "on" | "off"
export async function getPushStatus() {
  if (needsInstallOnIphone()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

async function subscribeAndSave(reg, publicKey) {
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
    } catch (err) {
      // the server's key changed since this browser subscribed: start over once
      const old = await reg.pushManager.getSubscription();
      if (!old) throw err;
      await old.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
    }
  }
  await apiClient.post("/notifications/push/subscribe", { subscription: sub.toJSON() });
}

// Called from a button tap (browsers only allow the permission prompt after a tap).
export async function enablePush() {
  if (needsInstallOnIphone()) throw new Error("On iPhone, first tap Share, then Add to Home Screen, and open the app from there.");
  if (!pushSupported()) throw new Error("This browser can't show phone alerts.");
  const { data } = await apiClient.get("/notifications/push/config");
  if (!data.enabled) throw new Error("Phone alerts are not switched on at the server yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Alerts are blocked. Allow notifications for this site in your browser settings.");
  await subscribeAndSave(await registration(), data.publicKey);
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await apiClient.post("/notifications/push/unsubscribe", { endpoint }).catch(() => {});
  }
}

// Quiet re-sync after login: if this phone already allowed alerts, make sure THIS account owns the subscription.
export async function resyncPush() {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const { data } = await apiClient.get("/notifications/push/config");
    if (!data.enabled) return;
    await subscribeAndSave(await registration(), data.publicKey);
  } catch {
    /* never bother the user with this */
  }
}