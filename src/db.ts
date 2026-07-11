import Dexie, { type EntityTable } from "dexie";
import dexieCloud from "dexie-cloud-addon";
import { DEXIE_CLOUD_URL } from "./sync-config";

// Every record uses a string UUID and carries timestamps.
// This makes adding cross-device sync painless in a later phase.

export interface List {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
  updatedAt: number;
}

export interface ListItem {
  id: string;
  listId: string;
  text: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

export type Priority = "low" | "medium" | "high";
export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  due: string | null; // local date "YYYY-MM-DD"; null = someday
  recurrence: Recurrence;
  done: boolean;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CalEvent {
  id: string;
  title: string;
  date: string; // local date "YYYY-MM-DD"
  time: string | null; // 24h "HH:MM"; null = all-day
  reminderMins?: number | null; // minutes before start; 0 = at time, null/absent = none
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  budget: number | null; // monthly budget; null = no budget set
  createdAt: number;
  updatedAt: number;
}

export interface Expense {
  id: string;
  categoryId: string;
  amount: number; // positive, rounded to 2 decimal places
  note: string;
  date: string; // local date "YYYY-MM-DD"
  createdAt: number;
  updatedAt: number;
}

export type BillFrequency = "once" | "weekly" | "monthly" | "yearly";

export interface Bill {
  id: string;
  name: string;
  emoji: string;
  amount: number; // expected amount; editable when marking paid
  categoryId: string | null; // where payments get logged; null = auto "Bills"
  frequency: BillFrequency;
  due: string; // next due date, local "YYYY-MM-DD"
  createdAt: number;
  updatedAt: number;
}

// --- Fitness (Phase 6) ---
// All stored values are metric (kg, km); the UI converts for display.

export interface Routine {
  id: string;
  name: string;
  emoji: string;
  exercises: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkoutSet {
  exercise: string;
  weight: number | null; // kg; null = bodyweight
  reps: number;
}

export interface Workout {
  id: string;
  date: string; // local "YYYY-MM-DD"
  routineName: string; // snapshot of the routine used (or "Workout")
  sets: WorkoutSet[];
  createdAt: number;
  updatedAt: number;
}

export interface Cardio {
  id: string;
  date: string;
  kind: string; // Run, Ride, Swim, Walk…
  distanceKm: number | null;
  mins: number;
  createdAt: number;
  updatedAt: number;
}

export interface Measurement {
  id: string;
  date: string;
  kind: string; // "weight" for now; extensible later
  value: number; // kg
  createdAt: number;
  updatedAt: number;
}

export interface ActivityMark {
  id: string;
  date: string; // manual "I was active" day
  createdAt: number;
  updatedAt: number;
}

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
  updatedAt: number;
}

export interface HabitTick {
  id: string;
  habitId: string;
  date: string; // local "YYYY-MM-DD"
  createdAt: number;
  updatedAt: number;
}

export interface Meal {
  id: string;
  name: string;
  emoji: string;
  ingredients: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MealPlan {
  id: string;
  date: string; // local "YYYY-MM-DD"
  mealId: string;
  createdAt: number;
  updatedAt: number;
}

const db = new Dexie("lifetime", { addons: [dexieCloud] }) as Dexie & {
  lists: EntityTable<List, "id">;
  items: EntityTable<ListItem, "id">;
  tasks: EntityTable<Task, "id">;
  events: EntityTable<CalEvent, "id">;
  categories: EntityTable<Category, "id">;
  expenses: EntityTable<Expense, "id">;
  bills: EntityTable<Bill, "id">;
  routines: EntityTable<Routine, "id">;
  workouts: EntityTable<Workout, "id">;
  cardio: EntityTable<Cardio, "id">;
  measurements: EntityTable<Measurement, "id">;
  activity: EntityTable<ActivityMark, "id">;
  habits: EntityTable<Habit, "id">;
  habitTicks: EntityTable<HabitTick, "id">;
  meals: EntityTable<Meal, "id">;
  mealPlans: EntityTable<MealPlan, "id">;
};

db.version(1).stores({
  lists: "id, createdAt",
  items: "id, listId, createdAt",
});

// v2 — Phase 2: tasks. `done` is a boolean so it can't be indexed;
// task counts stay small enough to filter in memory.
db.version(2).stores({
  tasks: "id, due, createdAt",
});

// v3 — Phase 3: calendar events.
db.version(3).stores({
  events: "id, date, createdAt",
});

// v4 — Phase 4: budget categories and expenses.
db.version(4).stores({
  categories: "id, createdAt",
  expenses: "id, date, categoryId, createdAt",
});

// v5 — Phase 6: fitness.
db.version(5).stores({
  routines: "id, createdAt",
  workouts: "id, date, createdAt",
  cardio: "id, date, createdAt",
  measurements: "id, date, createdAt",
  activity: "id, date, createdAt",
});

// v6 — budget rework: recurring bills & upcoming expenses.
db.version(6).stores({
  bills: "id, due, createdAt",
});

// v7 — Phase 8: daily habits.
db.version(7).stores({
  habits: "id, createdAt",
  habitTicks: "id, habitId, date, createdAt",
});

// v8 — sync: gives dexie-cloud-addon a fresh version to attach its
// internal tables to (avoids Dexie's SchemaDiff warning/workaround).
db.version(8).stores({});

// v9 — Phase 11: meal planning.
db.version(9).stores({
  meals: "id, createdAt",
  mealPlans: "id, date, mealId, createdAt",
});

// Sync is opt-in: without a database URL (or before signing in) the app
// is exactly as local-only as it always was.
if (DEXIE_CLOUD_URL) {
  db.cloud.configure({
    databaseUrl: DEXIE_CLOUD_URL,
    requireAuth: false,
  });
}

export const uid = () => crypto.randomUUID();
export const now = () => Date.now();

export default db;
