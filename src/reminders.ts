import db from "./db";
import { timeLabel, addDays } from "./dates";
import { fmtMoney } from "./money";

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

// 9:00 local on the given day — when bill reminders arrive.
function nineAm(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 9, 0).getTime();
}

// Upload the next 60 days of reminders (calendar events + bills). Called
// on app start and whenever either changes; offline failures are silent —
// the next call retries.
export async function syncReminders() {
  if (reminderStatus() !== "on") return;
  try {
    const sub = await getSubscription(false);
    if (!sub) return;
    const nowMs = Date.now();

    const events = await db.events.toArray();
    const eventReminders = events
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
          url: "/#/calendar",
        };
      });

    // Bills: 9am the day before it's due, or 9am on the day if that
    // moment has already passed (e.g. the bill was added late).
    let currency = "£";
    try {
      currency =
        JSON.parse(localStorage.getItem("lifetime-settings") || "{}")
          .currency || "£";
    } catch {
      // unreadable settings — keep the default
    }
    const bills = await db.bills.toArray();
    const billReminders = bills.map((b) => {
      const dayBefore = nineAm(addDays(b.due, -1));
      const at = dayBefore > nowMs ? dayBefore : nineAm(b.due);
      return {
        id: `bill-${b.id}-${b.due}`,
        title: `${b.name} due ${dayBefore > nowMs ? "tomorrow" : "today"}`,
        body: `${b.emoji} ${fmtMoney(b.amount, currency)} — tap to mark it paid`,
        at,
        url: "/#/budget",
      };
    });

    const reminders = [...eventReminders, ...billReminders]
      .filter((r) => r.at > nowMs - 60_000 && r.at < nowMs + 60 * 86_400_000)
      .sort((a, b) => a.at - b.at)
      .slice(0, 100);

    const uidStr = (db.cloud.currentUserId || "").toLowerCase();
    await fetch("/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: deviceId(),
        subscription: sub.toJSON(),
        reminders,
        // ties this device to its account so household pushes can find it
        userId: uidStr && uidStr !== "unauthorized" ? uidStr : undefined,
      }),
    });
  } catch {
    // offline or server not set up yet — retry on next sync
  }
}
