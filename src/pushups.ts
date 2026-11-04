import db, { uid, now, type PushupChallenge, type PushupLog } from "./db";
import { addDays, addMonths, todayStr } from "./dates";
import { stopPushupNudges, syncReminders } from "./reminders";

// ---- pure calculations ----

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

export const daysBetween = (from: string, to: string) => dayNum(to) - dayNum(from);

export const totalDays = (c: PushupChallenge) =>
  daysBetween(c.startDate, c.endDate) + 1;

// One entry per day. Two offline devices can each log the same date before
// they sync; the most recent edit wins.
export function logsByDate(logs: PushupLog[]): Map<string, PushupLog> {
  const map = new Map<string, PushupLog>();
  for (const l of logs) {
    const cur = map.get(l.date);
    if (!cur || l.updatedAt > cur.updatedAt) map.set(l.date, l);
  }
  return map;
}

// Average of the sets done in the 7 days ending on `date`. Needs at least 3,
// so a couple of early sets don't pass for a trend.
export function rollingAverage(
  byDate: Map<string, PushupLog>,
  date: string
): number | null {
  const sets: number[] = [];
  for (let i = 0; i < 7; i++) {
    const log = byDate.get(addDays(date, -i));
    if (log && log.reps > 0) sets.push(log.reps);
  }
  if (sets.length < 3) return null;
  return sets.reduce((s, n) => s + n, 0) / sets.length;
}

export interface PushupStats {
  dayNumber: number; // 0 before it starts
  elapsedDays: number;
  loggedDays: number;
  totalReps: number;
  best: { reps: number; date: string } | null;
  first: { reps: number; date: string } | null;
  average: number | null;
  streak: number;
  bestStreak: number;
}

export function computeStats(
  challenge: PushupChallenge,
  logs: PushupLog[],
  today: string
): PushupStats {
  const byDate = logsByDate(
    logs.filter(
      (l) => l.date >= challenge.startDate && l.date <= challenge.endDate
    )
  );
  const did = (d: string) => (byDate.get(d)?.reps ?? 0) > 0;

  const lastDay = today < challenge.endDate ? today : challenge.endDate;
  const elapsedDays = Math.max(daysBetween(challenge.startDate, lastDay) + 1, 0);

  let totalReps = 0;
  let loggedDays = 0;
  let best: PushupStats["best"] = null;
  let first: PushupStats["first"] = null;
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < elapsedDays; i++) {
    const date = addDays(challenge.startDate, i);
    if (did(date)) {
      const reps = byDate.get(date)!.reps;
      totalReps += reps;
      loggedDays++;
      first ??= { reps, date };
      if (!best || reps > best.reps) best = { reps, date };
      run++;
      if (run > bestStreak) bestStreak = run;
    } else {
      run = 0;
    }
  }

  // today not being done yet doesn't break the streak until the day is over
  let streak = 0;
  let cursor = did(lastDay) ? lastDay : addDays(lastDay, -1);
  while (cursor >= challenge.startDate && did(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  return {
    dayNumber: today < challenge.startDate ? 0 : Math.min(elapsedDays, totalDays(challenge)),
    elapsedDays,
    loggedDays,
    totalReps,
    best,
    first,
    average: rollingAverage(byDate, lastDay),
    streak,
    bestStreak,
  };
}

// ---- actions ----

// A year from the start date, inclusive: 5 Nov 2026 runs to 4 Nov 2027.
export const yearEnd = (start: string) => addDays(addMonths(start, 12), -1);

export async function startChallenge(startDate: string) {
  await db.pushupChallenges.add({
    id: uid(),
    startDate,
    endDate: yearEnd(startDate),
    remindFrom: "09:00",
    remindTo: "21:00",
    remindEveryMins: 120,
    createdAt: now(),
    updatedAt: now(),
  });
  await syncReminders({ resetLogged: true });
}

export async function updateSchedule(
  id: string,
  patch: Partial<
    Pick<PushupChallenge, "remindFrom" | "remindTo" | "remindEveryMins">
  >
) {
  await db.pushupChallenges.update(id, { ...patch, updatedAt: now() });
  await syncReminders();
}

// Stops the challenge and its nudges. The logged reps are kept.
export async function endChallenge(id: string) {
  await db.pushupChallenges.delete(id);
  await stopPushupNudges();
}

async function dismissNudge() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const open = await reg.getNotifications({ tag: "pushups" });
    open.forEach((n) => n.close());
  } catch {
    // no service worker (e.g. dev) — nothing to dismiss
  }
}

export async function saveLog(date: string, reps: number) {
  const existing = await db.pushupLogs.where("date").equals(date).toArray();
  if (existing.length > 0) {
    const [keep, ...extra] = existing.sort((a, b) => b.updatedAt - a.updatedAt);
    await db.pushupLogs.update(keep.id, { reps, updatedAt: now() });
    if (extra.length) await db.pushupLogs.bulkDelete(extra.map((l) => l.id));
  } else {
    await db.pushupLogs.add({
      id: uid(),
      date,
      reps,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  // tells the server today is done; the nudges stop on every device
  syncReminders();
  if (date === todayStr()) dismissNudge();
}

export async function deleteLog(date: string) {
  const entries = await db.pushupLogs.where("date").equals(date).toArray();
  await db.pushupLogs.bulkDelete(entries.map((l) => l.id));
  // removing today's entry means today counts as not done again
  await syncReminders({ resetLogged: true });
}

export const parseReps = (raw: string): number | null =>
  /^\d{1,4}$/.test(raw.trim()) ? Number(raw.trim()) : null;
