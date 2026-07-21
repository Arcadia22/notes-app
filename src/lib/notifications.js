// Notification helpers for Chaos Manager PWA.

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (err) {
    console.warn("[notif] SW registration failed:", err);
    return null;
  }
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try { return await Notification.requestPermission(); }
  catch { return "unsupported"; }
}

export function getNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function sendNotification(title, body, tag = "chaos-manager") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/icon-192.png", tag, renotify: true });
    return;
  } catch {}
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, icon: "/icon-192.png", tag, renotify: true });
  } catch (err) {
    console.warn("[notif] failed:", err);
  }
}

// ── Scheduled notifications ───────────────────────────────────────────
// Pure JS setTimeout — fires once when the timer ends.
// No localStorage, no overdue check, no duplicates.

const timeoutIds = {};

export function scheduleNotification(id, title, body, fireAtMs) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (timeoutIds[id]) { clearTimeout(timeoutIds[id]); delete timeoutIds[id]; }
  const delay = Math.max(0, fireAtMs - Date.now());
  timeoutIds[id] = setTimeout(async () => {
    delete timeoutIds[id];
    await sendNotification(title, body, id);
  }, delay);
}

export function cancelScheduledNotification(id) {
  if (timeoutIds[id]) { clearTimeout(timeoutIds[id]); delete timeoutIds[id]; }
}

// No-op kept so App.jsx import doesn't break
export async function fireOverdueNotifications() {}

export function isInstalledPWA() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}
