import db, { now, type Task, type Priority } from "./db";
import { nextOccurrence } from "./dates";

export const PRIORITY_WEIGHT: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const PRIORITY_FLAG: Record<Priority, string> = {
  high: "text-red-500 dark:text-red-400",
  medium: "text-amber-500 dark:text-amber-400",
  low: "text-sky-500 dark:text-sky-400",
};

export const PRIORITY_RING: Record<Priority, string> = {
  high: "border-red-400/70",
  medium: "border-amber-400/70",
  low: "border-line",
};

// Completing a recurring task rolls it forward instead of finishing it.
export function completeTask(task: Task) {
  if (task.recurrence !== "none" && task.due)
    return db.tasks.update(task.id, {
      due: nextOccurrence(task.due, task.recurrence),
      updatedAt: now(),
    });
  return db.tasks.update(task.id, {
    done: true,
    completedAt: now(),
    updatedAt: now(),
  });
}
