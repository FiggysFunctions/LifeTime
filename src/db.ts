import Dexie, { type EntityTable } from "dexie";
import dexieCloud from "dexie-cloud-addon";
import { DEXIE_CLOUD_URL } from "./sync-config";

// Every record uses a string UUID and carries timestamps.
// This makes adding cross-device sync painless in a later phase.

export interface List {
  id: string;
  name: string;
  emoji: string;
  realmId?: string; // household realm when shared; absent = private
  createdAt: number;
  updatedAt: number;
}

export interface ListItem {
  id: string;
  listId: string;
  text: string;
  done: boolean;
  qty?: number; // absent = 1
  realmId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  text: string; // first line doubles as the title
  realmId?: string; // household realm when shared
  createdAt: number;
  updatedAt: number;
}

export type Priority = "low" | "medium" | "high";
export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  due: string | null; // local date "YYYY-MM-DD"; null = someday
  recurrence: Recurrence;
  done: boolean;
  completedAt: number | null;
  realmId?: string; // household realm when assigned beyond yourself
  assignedTo?: string; // household member userId; absent + realmId = anyone
  createdAt: number;
  updatedAt: number;
}

export interface CalEvent {
  id: string;
  title: string;
  date: string; // local date "YYYY-MM-DD"
  time: string | null; // 24h "HH:MM"; null = all-day
  reminderMins?: number | null; // minutes before start; 0 = at time, null/absent = none
  realmId?: string; // household realm when sharing is on
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

export type IncomeFrequency = "weekly" | "fortnightly" | "monthly" | "yearly";

export interface Income {
  id: string;
  name: string;
  emoji: string;
  amount: number;
  frequency: IncomeFrequency;
  createdAt: number;
  updatedAt: number;
}

export interface Account {
  id: string;
  name: string;
  emoji: string;
  balance: number; // manually maintained; the "what have I got" figure
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
  note?: string; // recipe link, method, cook time — freeform
  realmId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MealPlan {
  id: string;
  date: string; // local "YYYY-MM-DD"
  mealId: string; // "" for quick entries (leftovers, takeaway…)
  title?: string; // display text for quick entries
  realmId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Occasion {
  id: string;
  name: string;
  emoji: string;
  month: number; // 1-12
  day: number; // 1-31
  realmId?: string; // shared with the household by default
  createdAt: number;
  updatedAt: number;
}

export interface Goal {
  id: string;
  name: string;
  emoji: string;
  target: number;
  saved: number;
  createdAt: number;
  updatedAt: number;
}

export interface Staple {
  id: string;
  name: string; // pantry item skipped by shopping exports (matched case-insensitively)
  realmId?: string;
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
  notes: EntityTable<Note, "id">;
  staples: EntityTable<Staple, "id">;
  occasions: EntityTable<Occasion, "id">;
  goals: EntityTable<Goal, "id">;
  incomes: EntityTable<Income, "id">;
  accounts: EntityTable<Account, "id">;
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

// v10 — Phase 14: shared notes.
db.version(10).stores({
  notes: "id, createdAt, updatedAt",
});

// v11 — meals upgrade: pantry staples.
db.version(11).stores({
  staples: "id, createdAt",
});

// v12 — Phase 16: birthdays/anniversaries + savings goals.
db.version(12).stores({
  occasions: "id, createdAt",
  goals: "id, createdAt",
});

// v13 — Phase 17: income sources + savings account balances (personal).
db.version(13).stores({
  incomes: "id, createdAt",
  accounts: "id, createdAt",
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

// Dev-only handle for driving the app database from the browser console
// during verification. Never present in production builds.
if (import.meta.env.DEV) (window as unknown as { db: unknown }).db = db;

export default db;
