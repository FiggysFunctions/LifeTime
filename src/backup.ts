import db from "./db";
import { todayStr } from "./dates";

const TABLES = [
  "lists",
  "items",
  "tasks",
  "events",
  "categories",
  "expenses",
  "bills",
  "routines",
  "workouts",
  "cardio",
  "measurements",
  "activity",
  "habits",
  "habitTicks",
] as const;

const SETTINGS_KEY = "lifetime-settings";

export async function exportBackup() {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  const payload = {
    app: "lifetime",
    format: 1,
    exportedAt: new Date().toISOString(),
    settings: JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
    data,
  };
  const blob = new Blob([JSON.stringify(payload)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lifetime-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem("lifetime-last-backup", String(Date.now()));
}

// Replaces everything with the backup's contents. Throws on files that
// aren't Lifetime backups; the caller confirms with the user first.
export async function importBackup(file: File): Promise<number> {
  const payload = JSON.parse(await file.text());
  if (payload?.app !== "lifetime" || typeof payload.data !== "object")
    throw new Error("This file isn't a Lifetime backup.");

  let count = 0;
  await db.transaction(
    "rw",
    TABLES.map((t) => db.table(t)),
    async () => {
      for (const t of TABLES) {
        await db.table(t).clear();
        const rows = Array.isArray(payload.data[t]) ? payload.data[t] : [];
        if (rows.length) await db.table(t).bulkAdd(rows);
        count += rows.length;
      }
    }
  );
  if (payload.settings && typeof payload.settings === "object")
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload.settings));
  return count;
}
