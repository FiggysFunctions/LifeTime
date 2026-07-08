import db from "./db";
import { timeLabel } from "./dates";

// Push reminders need a server to send them while the phone is locked.
// Only reminder titles and times are uploaded — never lists, tasks or money.

const FLAG_KEY = "lifetime-reminders-on";
const DEVICE_KEY = "lifetime-device-id";

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export const pushSupported = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export type ReminderStatus = "unsupported" | "denied" | "off" | "on";

export function reminderStatus(): ReminderStatus {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return localStorage.getItem(FLAG_KEY) === "1" &&
    Notification.permission === "granted"
    ? "on"
    : "off";
}

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function getSubscription(create: boolean) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) {
    const res = await fetch("/api/vapid");
    if (!res.ok) throw new Error("server-not-ready");
    const { publicKey } = await res.json();
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(publicKey).buffer as ArrayBuffer,
    });
  }
  return sub;
}

export async function enableReminders() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("permission-" + perm);
  await getSubscription(true);
  localStorage.setItem(FLAG_KEY, "1");
  await syncReminders();
}

export async function disableReminders() {
  localStorage.removeItem(FLAG_KEY);
  try {
    const sub = await getSubscription(false);
    await sub?.unsubscribe();
  } catch {
    // already gone — fine
  }
  fetch("/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId: deviceId(), remove: true }),
  }).catch(() => {});
}

// Upload the next 60 days of reminders. Called on app start and whenever
// events change; offline failures are silent — the next call retries.
export async function syncReminders() {
  if (reminderStatus() !== "on") return;
  try {
    const sub = await getSubscription(false);
    if (!sub) return;
    const nowMs = Date.now();
    const events = await db.events.toArray();
    const reminders = events
      .filter((e) => e.time && e.reminderMins != null)
      .map((e) => {
        const [y, m, d] = e.date.split("-").map(Number);
        const [hh, mm] = e.time!.split(":").map(Number);
        const at =
          new Date(y, m - 1, d, hh, mm).getTime() - e.reminderMins! * 60_000;
        return {
          id: e.id,
          title: e.title,
          body:
            e.reminderMins === 0
              ? `Now · ${timeLabel(e.time!)}`
              : `At ${timeLabel(e.time!)}`,
          at,
        };
      })
      .filter((r) => r.at > nowMs - 60_000 && r.at < nowMs + 60 * 86_400_000)
      .sort((a, b) => a.at - b.at)
      .slice(0, 100);

    await fetch("/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: deviceId(),
        subscription: sub.toJSON(),
        reminders,
      }),
    });
  } catch {
    // offline or server not set up yet — retry on next sync
  }
}
