import db from "./db";
import { timeLabel, addDays, toDateStr, todayStr } from "./dates";
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

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem("lifetime-settings") || "{}");
  } catch {
    return {};
  }
}

// The Sunday 6pm weekly digest: a summary push computed on-device and
// scheduled like any other reminder. Refreshed every sync, so it reflects
// the last time the app was opened before Sunday evening.
export async function buildDigest() {
  const s = readSettings();
  if (s.weeklyDigest === false) return null;
  const currency = typeof s.currency === "string" && s.currency ? s.currency : "£";
  const goal = Math.min(Math.max(Number(s.weeklyGoal) || 3, 1), 7);

  const today = todayStr();
  const monday = addDays(today, -((new Date().getDay() + 6) % 7));
  const sunday = addDays(monday, 6);

  const weekSpent = (
    await db.expenses.where("date").between(monday, sunday, true, true).toArray()
  ).reduce((sum, e) => sum + e.amount, 0);

  const activeDates = new Set([
    ...(await db.workouts.toArray()).map((w) => w.date),
    ...(await db.cardio.toArray()).map((c) => c.date),
    ...(await db.activity.toArray()).map((a) => a.date),
  ]);
  let active = 0;
  for (let i = 0; i < 7; i++) if (activeDates.has(addDays(monday, i))) active++;

  const soon = addDays(today, 7);
  const billsSoon = (await db.bills.toArray()).filter((b) => b.due <= soon);
  const billsTotal = billsSoon.reduce((sum, b) => sum + b.amount, 0);
  const eventsAhead = await db.events
    .where("date")
    .between(addDays(today, 1), soon, true, true)
    .count();

  const parts = [
    `${fmtMoney(weekSpent, currency)} spent`,
    `${active}/${goal} active days`,
  ];
  if (billsSoon.length > 0)
    parts.push(
      `${billsSoon.length} ${billsSoon.length === 1 ? "bill" : "bills"} (${fmtMoney(billsTotal, currency)}) next wk`
    );
  if (eventsAhead > 0)
    parts.push(`${eventsAhead} ${eventsAhead === 1 ? "event" : "events"} ahead`);

  // next Sunday 18:00 local (or the one after if that's already passed)
  const d = new Date();
  let target = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + ((7 - d.getDay()) % 7),
    18,
    0
  );
  if (target.getTime() <= Date.now())
    target = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate() + 7,
      18,
      0
    );

  return {
    id: `digest-${toDateStr(target)}`,
    title: "Your week in Lifetime",
    body: parts.join(" · ").slice(0, 158),
    at: target.getTime(),
    url: "/",
  };
}

if (import.meta.env.DEV)
  (window as unknown as { __buildDigest: unknown }).__buildDigest = buildDigest;

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

    // Birthdays & anniversaries: a heads-up 3 days out and one on the day.
    const occasions = await db.occasions.toArray();
    const today = todayStr();
    const yearNow = Number(today.slice(0, 4));
    const occReminders = occasions.flatMap((o) => {
      let dateStr = toDateStr(new Date(yearNow, o.month - 1, o.day));
      if (dateStr < today)
        dateStr = toDateStr(new Date(yearNow + 1, o.month - 1, o.day));
      return [
        {
          id: `occ-${o.id}-pre`,
          title: `${o.emoji} ${o.name} in 3 days`,
          body: "Time to sort a card or a gift?",
          at: nineAm(addDays(dateStr, -3)),
          url: "/#/calendar",
        },
        {
          id: `occ-${o.id}-day`,
          title: `${o.emoji} ${o.name} — today!`,
          body: "",
          at: nineAm(dateStr),
          url: "/#/calendar",
        },
      ];
    });

    const digest = await buildDigest();
    const reminders = [
      ...eventReminders,
      ...billReminders,
      ...occReminders,
      ...(digest ? [digest] : []),
    ]
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
