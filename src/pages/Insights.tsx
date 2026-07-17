import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PiggyBank, Dumbbell, Flame, CheckSquare } from "lucide-react";
import db from "../db";
import { toDateStr, todayStr, addDays, dueLabel } from "../dates";
import { fmtMoney } from "../money";
import { useSettings, type Units } from "../settings";
import { PageHeader, Card } from "../components/ui";

// Read-only trends over the data the app already holds. Everything is
// computed locally — no fetches, no waiting.

const KG_PER_LB = 0.45359237;
const round1 = (n: number) => Math.round(n * 10) / 10;
const showWeight = (kg: number, u: Units) =>
  round1(u === "metric" ? kg : kg / KG_PER_LB);
const weightUnit = (u: Units) => (u === "metric" ? "kg" : "lb");

function habitStreak(dates: Set<string>, today: string): number {
  let s = 0;
  let d = dates.has(today) ? today : addDays(today, -1);
  while (dates.has(d) && s < 1000) {
    s++;
    d = addDays(d, -1);
  }
  return s;
}

function MonthTrendCard() {
  const { settings } = useSettings();
  const today = todayStr();
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(y, m - 5 + i, 1);
    return {
      key: toDateStr(d).slice(0, 7),
      label: d.toLocaleDateString(undefined, { month: "short" }),
    };
  });
  const totals = useLiveQuery(
    async () => {
      const start = `${months[0].key}-01`;
      const list = await db.expenses
        .where("date")
        .between(start, `${months[5].key}-31`, true, true)
        .toArray();
      return months.map((mo) =>
        list
          .filter((e) => e.date.startsWith(mo.key))
          .reduce((s, e) => s + e.amount, 0)
      );
    },
    [],
    [0, 0, 0, 0, 0, 0]
  );
  const [sel, setSel] = useState(5);
  const max = Math.max(...totals, 1);

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <PiggyBank size={15} className="text-accent" /> Spending, last 6
          months
        </p>
        <p className="text-xs text-muted">
          {months[sel].label} · {fmtMoney(totals[sel], settings.currency)}
        </p>
      </div>
      <div className="flex h-24 items-end gap-2 border-b border-line pb-px">
        {months.map((mo, i) => (
          <button
            key={mo.key}
            onClick={() => setSel(i)}
            aria-label={`${mo.label}: ${fmtMoney(totals[i], settings.currency)}`}
            className="group flex h-full flex-1 items-end justify-center"
          >
            <span
              className={`w-full max-w-9 rounded-t transition-all ${
                i === sel ? "bg-accent" : "bg-accent opacity-35 group-hover:opacity-60"
              }`}
              style={{
                height: `${Math.max((totals[i] / max) * 100, totals[i] > 0 ? 3 : 0)}%`,
              }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {months.map((mo, i) => (
          <p
            key={mo.key}
            className={`flex-1 text-center text-[10px] font-medium ${
              i === sel ? "text-ink" : "text-muted"
            }`}
          >
            {mo.label}
          </p>
        ))}
      </div>
    </Card>
  );
}

function CategoryCard() {
  const { settings } = useSettings();
  const data = useLiveQuery(
    async () => {
      const ym = todayStr().slice(0, 7);
      const [expenses, categories] = await Promise.all([
        db.expenses
          .where("date")
          .between(`${ym}-01`, `${ym}-31`, true, true)
          .toArray(),
        db.categories.toArray(),
      ]);
      const byCat = new Map<string, number>();
      expenses.forEach((e) =>
        byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount)
      );
      const catById = new Map(categories.map((c) => [c.id, c]));
      return [...byCat.entries()]
        .map(([id, total]) => ({
          label: catById.get(id)
            ? `${catById.get(id)!.emoji} ${catById.get(id)!.name}`
            : "Other",
          total,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
    },
    [],
    [] as { label: string; total: number }[]
  );
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.total), 1);

  return (
    <Card>
      <p className="text-sm font-medium">Where this month's money went</p>
      <ul className="mt-3 space-y-2.5">
        {data.map((d) => (
          <li key={d.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
              <span className="shrink-0 font-medium">
                {fmtMoney(d.total, settings.currency)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(d.total / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FitnessCard() {
  const { settings } = useSettings();
  const goal = Math.min(Math.max(settings.weeklyGoal || 3, 1), 7);
  const data = useLiveQuery(
    async () => {
      const dates = new Set([
        ...(await db.workouts.toArray()).map((w) => w.date),
        ...(await db.cardio.toArray()).map((c) => c.date),
        ...(await db.activity.toArray()).map((a) => a.date),
      ]);
      const monday = addDays(todayStr(), -((new Date().getDay() + 6) % 7));
      const weeks = Array.from({ length: 8 }, (_, i) => {
        const start = addDays(monday, -7 * (7 - i));
        let n = 0;
        for (let d = 0; d < 7; d++) if (dates.has(addDays(start, d))) n++;
        return n;
      });
      const ms = await db.measurements.toArray();
      const sorted = ms.sort((a, b) => a.date.localeCompare(b.date));
      return { weeks, first: sorted[0], last: sorted[sorted.length - 1] };
    },
    [],
    { weeks: [] as number[], first: undefined, last: undefined }
  );
  if (data.weeks.every((n) => n === 0) && !data.last) return null;
  const avg =
    data.weeks.length > 0
      ? round1(data.weeks.reduce((s, n) => s + n, 0) / data.weeks.length)
      : 0;
  const u = settings.units;
  const delta =
    data.first && data.last && data.first.id !== data.last.id
      ? round1(showWeight(data.last.value, u) - showWeight(data.first.value, u))
      : null;

  return (
    <Card>
      <p className="flex items-center gap-2 text-sm font-medium">
        <Dumbbell size={15} className="text-accent" /> Active days per week
      </p>
      <div className="mt-3 flex h-16 items-end gap-1.5 border-b border-line pb-px">
        {data.weeks.map((n, i) => (
          <span
            key={i}
            title={`${n} active day${n === 1 ? "" : "s"}`}
            className={`flex-1 rounded-t ${
              n >= goal ? "bg-accent" : "bg-accent opacity-35"
            }`}
            style={{ height: `${Math.max((n / 7) * 100, n > 0 ? 6 : 0)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>8 wks ago</span>
        <span>this wk</span>
      </div>
      <p className="mt-2 text-xs text-muted">
        Averaging {avg} active {avg === 1 ? "day" : "days"} a week · goal {goal}
        {delta !== null &&
          data.last &&
          ` · weight ${delta === 0 ? "steady" : `${delta < 0 ? "↓" : "↑"} ${Math.abs(delta)} ${weightUnit(u)}`} since ${dueLabel(data.first!.date)}`}
      </p>
    </Card>
  );
}

function HabitsCard() {
  const today = todayStr();
  const data = useLiveQuery(
    async () => {
      const habits = await db.habits.orderBy("createdAt").toArray();
      if (habits.length === 0) return [];
      const ticks = await db.habitTicks.toArray();
      const cutoff = addDays(today, -29);
      return habits.map((h) => {
        const dates = new Set(
          ticks.filter((t) => t.habitId === h.id).map((t) => t.date)
        );
        let last30 = 0;
        for (let i = 0; i < 30; i++)
          if (dates.has(addDays(cutoff, i))) last30++;
        return {
          id: h.id,
          label: `${h.emoji} ${h.name}`,
          pct: Math.round((last30 / 30) * 100),
          streak: habitStreak(dates, today),
        };
      });
    },
    [],
    [] as { id: string; label: string; pct: number; streak: number }[]
  );
  if (data.length === 0) return null;

  return (
    <Card>
      <p className="flex items-center gap-2 text-sm font-medium">
        <Flame size={15} className="text-accent" /> Habits, last 30 days
      </p>
      <ul className="mt-3 space-y-2.5">
        {data.map((h) => (
          <li key={h.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{h.label}</span>
              <span className="shrink-0 text-xs text-muted">
                {h.pct}%
                {h.streak >= 2 && (
                  <span className="ml-1.5 font-medium text-accent">
                    🔥{h.streak}
                  </span>
                )}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${h.pct}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DoneCard() {
  const counts = useLiveQuery(
    async () => {
      const cutoff = Date.now() - 30 * 86_400_000;
      const dateCutoff = addDays(todayStr(), -30);
      const tasks = await db.tasks
        .filter((t) => t.done && (t.completedAt ?? 0) >= cutoff)
        .count();
      const workouts = await db.workouts
        .filter((w) => w.date >= dateCutoff)
        .count();
      const meals = await db.mealPlans
        .filter((p) => p.date >= dateCutoff && p.date <= todayStr())
        .count();
      return { tasks, workouts, meals };
    },
    [],
    { tasks: 0, workouts: 0, meals: 0 }
  );
  if (counts.tasks + counts.workouts + counts.meals === 0) return null;

  return (
    <Card>
      <p className="flex items-center gap-2 text-sm font-medium">
        <CheckSquare size={15} className="text-accent" /> Last 30 days
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        {[
          { n: counts.tasks, label: "tasks done" },
          { n: counts.workouts, label: "workouts" },
          { n: counts.meals, label: "meals planned" },
        ].map((s) => (
          <div key={s.label}>
            <p className="font-display text-2xl font-semibold text-accent">
              {s.n}
            </p>
            <p className="mt-0.5 text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Insights() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Insights"
        subtitle="What all that logging adds up to."
      />
      <DoneCard />
      <CategoryCard />
      <MonthTrendCard />
      <FitnessCard />
      <HabitsCard />
      <p className="pt-1 text-center text-xs text-muted">
        Everything here is computed on your device from your own data.
      </p>
    </div>
  );
}
