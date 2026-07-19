import type { Recurrence } from "./db";

// Tasks store due dates as local "YYYY-MM-DD" strings, so plain string
// comparison orders them and there are no timezone surprises.

export const toDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const todayStr = () => toDateStr(new Date());

export const addDays = (dateStr: string, n: number) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + n));
};

export const addMonths = (dateStr: string, n: number) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1 + n, d);
  // Jan 31 + 1 month would overflow to Mar 3 — clamp to end of month instead
  if (dt.getDate() !== d) dt.setDate(0);
  return toDateStr(dt);
};

// Next due date after completing a recurring task or paying a bill:
// step forward from the old due date until we land past today, so an
// overdue item jumps to its next real occurrence, not a date in the past.
export function nextOccurrence(
  due: string,
  recurrence: Exclude<Recurrence, "none">
): string {
  const today = todayStr();
  let next = due;
  do {
    next =
      recurrence === "daily"
        ? addDays(next, 1)
        : recurrence === "weekly"
          ? addDays(next, 7)
          : recurrence === "monthly"
            ? addMonths(next, 1)
            : addMonths(next, 12);
  } while (next <= today);
  return next;
}

export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dueLabel(due: string): string {
  const today = todayStr();
  if (due === today) return "Today";
  if (due === addDays(today, 1)) return "Tomorrow";
  if (due === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = due.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(y === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}
