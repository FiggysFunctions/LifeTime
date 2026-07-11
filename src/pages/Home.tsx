import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ListChecks,
  CheckSquare,
  CalendarDays,
  PiggyBank,
  Dumbbell,
  Trophy,
  UtensilsCrossed,
  Search,
  Flag,
  Flame,
  Check,
  Pencil,
  X,
  Download,
} from "lucide-react";
import db, { uid, now, type Habit } from "../db";
import { todayStr, addDays, timeLabel, dueLabel } from "../dates";
import { fmtMoney, parseAmount } from "../money";
import {
  completeTask,
  PRIORITY_FLAG,
  PRIORITY_RING,
  PRIORITY_WEIGHT,
} from "../actions";
import { exportBackup } from "../backup";
import { useSettings } from "../settings";
import { PageHeader, Card, Button, Chip } from "../components/ui";

function greeting(h: number) {
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Winding down";
}

function DayBar() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setPct(
        ((d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400) *
          100
      );
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {Math.round(pct)}% of today has passed — make the rest count.
      </p>
    </div>
  );
}

function NamePrompt() {
  const { update } = useSettings();
  const [value, setValue] = useState("");
  return (
    <Card className="border-accent-soft">
      <p className="text-sm font-medium">What should Lifetime call you?</p>
      <div className="mt-3 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && update({ name: value.trim() })}
          placeholder="Your name"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <Button onClick={() => value.trim() && update({ name: value.trim() })}>
          Save
        </Button>
      </div>
      <button
        onClick={() => update({ name: "friend" })}
        className="mt-2.5 text-xs text-muted underline-offset-2 hover:underline"
      >
        Skip for now
      </button>
    </Card>
  );
}

const quickInputCls =
  "min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent";

function QuickAdd() {
  const { settings } = useSettings();
  const [mode, setMode] = useState<null | "task" | "expense" | "event">(null);
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [time, setTime] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const categories = useLiveQuery(
    () => db.categories.orderBy("createdAt").toArray(),
    [],
    []
  );

  const open = (m: "task" | "expense" | "event") => {
    setMode(mode === m ? null : m);
    setText("");
    setAmount("");
    setTime("");
  };

  const addTask = async () => {
    const t = text.trim();
    if (!t) return;
    await db.tasks.add({
      id: uid(),
      title: t,
      priority: "medium",
      due: todayStr(),
      recurrence: "none",
      done: false,
      completedAt: null,
      createdAt: now(),
      updatedAt: now(),
    });
    setMode(null);
  };

  const addEvent = async () => {
    const t = text.trim();
    if (!t) return;
    await db.events.add({
      id: uid(),
      title: t,
      date: todayStr(),
      time: time || null,
      reminderMins: null,
      createdAt: now(),
      updatedAt: now(),
    });
    setMode(null);
  };

  const addExpense = async () => {
    const n = parseAmount(amount);
    const cat = categoryId || categories[0]?.id;
    if (n === null || !cat) return;
    await db.expenses.add({
      id: uid(),
      categoryId: cat,
      amount: n,
      note: text.trim(),
      date: todayStr(),
      createdAt: now(),
      updatedAt: now(),
    });
    setMode(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Chip active={mode === "task"} onClick={() => open("task")}>
          + Task
        </Chip>
        <Chip active={mode === "expense"} onClick={() => open("expense")}>
          + Expense
        </Chip>
        <Chip active={mode === "event"} onClick={() => open("event")}>
          + Event
        </Chip>
      </div>

      {mode === "task" && (
        <Card className="border-accent-soft">
          <div className="flex gap-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="Task for today — e.g. Call the bank"
              className={quickInputCls}
            />
            <Button onClick={addTask}>Add</Button>
          </div>
        </Card>
      )}

      {mode === "event" && (
        <Card className="border-accent-soft">
          <div className="flex gap-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEvent()}
              placeholder="Event today — e.g. Coffee with Sam"
              className={quickInputCls}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Event time (optional)"
              className="w-[6.5rem] shrink-0 rounded-xl border border-line bg-bg px-2 text-sm text-muted outline-none focus:border-accent focus:text-ink"
            />
            <Button onClick={addEvent}>Add</Button>
          </div>
        </Card>
      )}

      {mode === "expense" && (
        <Card className="border-accent-soft space-y-2.5">
          {categories.length === 0 ? (
            <p className="text-sm text-muted">
              Set up spending categories first — it takes one tap in{" "}
              <Link
                to="/budget"
                className="text-accent underline-offset-2 hover:underline"
              >
                Budget
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="flex w-28 shrink-0 items-center rounded-xl border border-line bg-bg focus-within:border-accent">
                  <span className="pl-3.5 text-sm font-semibold text-muted">
                    {settings.currency}
                  </span>
                  <input
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addExpense()}
                    placeholder="0.00"
                    inputMode="decimal"
                    aria-label="Amount"
                    className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted"
                  />
                </div>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addExpense()}
                  placeholder="Note (optional)"
                  className={quickInputCls}
                />
                <Button onClick={addExpense}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    active={(categoryId || categories[0].id) === c.id}
                    onClick={() => setCategoryId(c.id)}
                  >
                    {c.emoji} {c.name}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

const HABIT_EMOJI = ["💧", "📖", "🧘", "💊", "🚶", "🏃", "🌙", "🥗", "🧹", "✍️"];

const SUGGESTED_HABITS = [
  { name: "Drink water", emoji: "💧" },
  { name: "Read", emoji: "📖" },
  { name: "Stretch", emoji: "🧘" },
  { name: "Take vitamins", emoji: "💊" },
  { name: "Daily walk", emoji: "🚶" },
  { name: "Early night", emoji: "🌙" },
];

// Consecutive ticked days ending today — an unticked today doesn't break
// the streak yet, it just doesn't count.
function habitStreak(dates: Set<string>, today: string): number {
  let s = 0;
  let d = dates.has(today) ? today : addDays(today, -1);
  while (dates.has(d) && s < 1000) {
    s++;
    d = addDays(d, -1);
  }
  return s;
}

function AddHabitForm({ existing }: { existing: string[] }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("💧");
  const have = new Set(existing.map((n) => n.trim().toLowerCase()));
  const suggestions = SUGGESTED_HABITS.filter(
    (s) => !have.has(s.name.toLowerCase())
  );

  const add = async (n: string, e: string) => {
    if (!n.trim()) return;
    await db.habits.add({
      id: uid(),
      name: n.trim(),
      emoji: e,
      createdAt: now(),
      updatedAt: now(),
    });
    setName("");
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-dashed border-line p-3.5">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <Chip
              key={s.name}
              active={false}
              onClick={() => add(s.name, s.emoji)}
            >
              + {s.emoji} {s.name}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {HABIT_EMOJI.map((e) => (
          <button
            key={e}
            onClick={() => setEmoji(e)}
            aria-label={`Choose ${e}`}
            className={`rounded-lg p-1 text-base transition-colors ${
              emoji === e
                ? "bg-accent-soft ring-1 ring-accent/50"
                : "hover:bg-surface-2"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add(name, emoji)}
          placeholder="Or your own — e.g. Practise guitar"
          className={quickInputCls}
        />
        <Button onClick={() => add(name, emoji)}>Add</Button>
      </div>
    </div>
  );
}

function HabitsSection() {
  const [editing, setEditing] = useState(false);
  const habits = useLiveQuery(
    () => db.habits.orderBy("createdAt").toArray(),
    [],
    []
  );
  const ticks = useLiveQuery(() => db.habitTicks.toArray(), [], []);
  const today = todayStr();
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  const byHabit = new Map<string, Set<string>>();
  ticks.forEach((t) => {
    if (!byHabit.has(t.habitId)) byHabit.set(t.habitId, new Set());
    byHabit.get(t.habitId)!.add(t.date);
  });

  const toggle = async (habitId: string, done: boolean) => {
    if (done) {
      const t = ticks.find((x) => x.habitId === habitId && x.date === today);
      if (t) await db.habitTicks.delete(t.id);
    } else {
      await db.habitTicks.add({
        id: uid(),
        habitId,
        date: today,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  };

  const remove = async (h: Habit) => {
    await db.habitTicks.where("habitId").equals(h.id).delete();
    await db.habits.delete(h.id);
  };

  if (habits.length === 0 && !editing)
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full rounded-2xl border border-dashed border-line bg-surface px-4 py-4 text-sm text-muted transition-colors hover:border-accent-soft"
      >
        🔥 Build a daily habit — tap to add your first
      </button>
    );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Habits
        </p>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-1 text-xs text-muted underline-offset-2 hover:underline"
        >
          <Pencil size={12} /> {editing ? "Done" : "Edit"}
        </button>
      </div>
      <div className="space-y-2">
        {habits.map((h) => {
          const dates = byHabit.get(h.id) ?? new Set<string>();
          const done = dates.has(today);
          const streak = habitStreak(dates, today);
          return (
            <div
              key={h.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
            >
              <button
                onClick={() => toggle(h.id, done)}
                aria-label={`${done ? "Untick" : "Tick"} ${h.name}`}
                className={
                  done
                    ? "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-white dark:text-bg"
                    : "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-line transition-colors hover:border-accent"
                }
              >
                {done && <Check size={14} strokeWidth={3} />}
              </button>
              <span className="min-w-0 flex-1 truncate text-sm">
                {h.emoji} {h.name}
              </span>
              {editing ? (
                <button
                  onClick={() => remove(h)}
                  aria-label={`Delete ${h.name}`}
                  className="p-1 text-muted hover:text-red-500"
                >
                  <X size={16} />
                </button>
              ) : (
                <>
                  <span className="flex shrink-0 gap-1" aria-hidden="true">
                    {last7.map((d) => (
                      <span
                        key={d}
                        className={`h-1.5 w-1.5 rounded-full ${
                          dates.has(d) ? "bg-accent" : "bg-surface-2"
                        }`}
                      />
                    ))}
                  </span>
                  {streak >= 2 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent">
                      <Flame size={12} />
                      {streak}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
        {editing && <AddHabitForm existing={habits.map((h) => h.name)} />}
      </div>
    </div>
  );
}

function BackupNudge() {
  const [, force] = useState(0);
  if (!localStorage.getItem("lifetime-first-seen"))
    localStorage.setItem("lifetime-first-seen", String(Date.now()));
  const last = Math.max(
    Number(localStorage.getItem("lifetime-last-backup") || 0),
    Number(localStorage.getItem("lifetime-first-seen") || 0)
  );
  const snoozeUntil = Number(
    localStorage.getItem("lifetime-backup-snooze") || 0
  );
  if (Date.now() - last < 30 * 86_400_000 || Date.now() < snoozeUntil)
    return null;

  return (
    <Card className="border-accent-soft">
      <p className="text-sm font-medium">Time for a backup?</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        It's been over a month. Download a fresh backup file so nothing is
        lost if this device is.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          onClick={async () => {
            await exportBackup();
            force((x) => x + 1);
          }}
        >
          <span className="flex items-center gap-1.5">
            <Download size={15} /> Download backup
          </span>
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            localStorage.setItem(
              "lifetime-backup-snooze",
              String(Date.now() + 7 * 86_400_000)
            );
            force((x) => x + 1);
          }}
        >
          Not now
        </Button>
      </div>
    </Card>
  );
}

export default function Home() {
  const { settings } = useSettings();
  const nowDate = new Date();
  const today = todayStr();
  const dateLabel = nowDate.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const dueTasks = useLiveQuery(
    () =>
      db.tasks
        .filter((t) => !t.done && t.due !== null && t.due <= todayStr())
        .toArray(),
    [],
    []
  );
  const eventsToday = useLiveQuery(
    () => db.events.where("date").equals(todayStr()).toArray(),
    [],
    []
  );
  const bills = useLiveQuery(() => db.bills.toArray(), [], []);
  const openItems = useLiveQuery(
    () => db.items.filter((i) => !i.done).count(),
    [],
    0
  );
  const openTasks = useLiveQuery(
    () => db.tasks.filter((t) => !t.done).count(),
    [],
    0
  );
  const spentMonth = useLiveQuery(
    async () => {
      const ym = todayStr().slice(0, 7);
      const list = await db.expenses
        .where("date")
        .between(`${ym}-01`, `${ym}-31`, true, true)
        .toArray();
      return list.reduce((s, e) => s + e.amount, 0);
    },
    [],
    0
  );
  const mealsToday = useLiveQuery(
    async () => {
      const plans = await db.mealPlans
        .where("date")
        .equals(todayStr())
        .toArray();
      if (plans.length === 0) return [];
      const meals = await db.meals.toArray();
      const byId = new Map(meals.map((m) => [m.id, m]));
      return plans
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((p) => byId.get(p.mealId))
        .filter((m) => m !== undefined);
    },
    [],
    []
  );
  const weekActive = useLiveQuery(
    async () => {
      const monday = addDays(todayStr(), -((new Date().getDay() + 6) % 7));
      const dates = new Set([
        ...(await db.workouts.toArray()).map((w) => w.date),
        ...(await db.cardio.toArray()).map((c) => c.date),
        ...(await db.activity.toArray()).map((a) => a.date),
      ]);
      let n = 0;
      for (let i = 0; i < 7; i++) if (dates.has(addDays(monday, i))) n++;
      return n;
    },
    [],
    0
  );

  const sortedEvents = [...eventsToday].sort(
    (a, b) =>
      (a.time ?? "").localeCompare(b.time ?? "") || a.createdAt - b.createdAt
  );
  const sortedTasks = [...dueTasks].sort(
    (a, b) =>
      a.due!.localeCompare(b.due!) ||
      PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
      a.createdAt - b.createdAt
  );
  const topTasks = sortedTasks.slice(0, 6);
  const moreTasks = sortedTasks.length - topTasks.length;
  const billsDueNow = bills
    .filter((b) => b.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due));
  const billsWeekTotal = bills
    .filter((b) => b.due <= addDays(today, 7))
    .reduce((s, b) => s + b.amount, 0);

  const todayEmpty =
    sortedEvents.length === 0 &&
    sortedTasks.length === 0 &&
    billsDueNow.length === 0 &&
    mealsToday.length === 0;

  const goal = Math.min(Math.max(settings.weeklyGoal || 3, 1), 7);
  const modules = [
    {
      to: "/lists",
      icon: ListChecks,
      label: "Lists",
      desc:
        openItems > 0
          ? `${openItems} ${openItems === 1 ? "item" : "items"} to get`
          : "Shopping & more",
    },
    {
      to: "/tasks",
      icon: CheckSquare,
      label: "Tasks",
      desc: openTasks > 0 ? `${openTasks} open` : "Plan your day",
    },
    {
      to: "/calendar",
      icon: CalendarDays,
      label: "Calendar",
      desc:
        sortedEvents.length > 0 ? `${sortedEvents.length} today` : "Your month",
    },
    {
      to: "/budget",
      icon: PiggyBank,
      label: "Budget",
      desc:
        billsWeekTotal > 0
          ? `${fmtMoney(billsWeekTotal, settings.currency)} due this week`
          : spentMonth > 0
            ? `${fmtMoney(spentMonth, settings.currency)} this month`
            : "Track spending",
    },
    {
      to: "/fitness",
      icon: Dumbbell,
      label: "Fitness",
      desc:
        weekActive > 0
          ? `${weekActive} of ${goal} days this week`
          : "Workouts & health",
    },
    {
      to: "/sports",
      icon: Trophy,
      label: "Sports",
      desc: "Fixtures, no spoilers",
    },
    {
      to: "/meals",
      icon: UtensilsCrossed,
      label: "Meals",
      desc:
        mealsToday.length > 0
          ? `Tonight: ${mealsToday[0]!.name}`
          : "Plan the week",
    },
  ];

  const name =
    settings.name && settings.name !== "friend" ? `, ${settings.name}` : "";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting(nowDate.getHours())}${name}`}
        subtitle={dateLabel}
        showSettings
        action={
          <Link
            to="/search"
            aria-label="Search everything"
            className="rounded-full p-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink md:hidden"
          >
            <Search size={20} />
          </Link>
        }
      />

      <DayBar />

      {!settings.name && <NamePrompt />}

      {/* Today digest */}
      <div>
        <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
          Today
        </p>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {sortedEvents.map((e) => (
            <Link
              key={e.id}
              to="/calendar"
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="w-14 shrink-0 text-xs font-medium text-accent">
                {e.time ? timeLabel(e.time) : "All day"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
            </Link>
          ))}
          {topTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => completeTask(t)}
                aria-label={`Complete ${t.title}`}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors hover:border-accent ${PRIORITY_RING[t.priority]}`}
              />
              <Link to="/tasks" className="min-w-0 flex-1">
                <p className="truncate text-sm">{t.title}</p>
                {t.due! < today && (
                  <p className="text-xs font-medium text-red-500 dark:text-red-400">
                    {dueLabel(t.due!)}
                  </p>
                )}
              </Link>
              <Flag
                size={12}
                className={`shrink-0 ${PRIORITY_FLAG[t.priority]}`}
              />
            </div>
          ))}
          {moreTasks > 0 && (
            <Link
              to="/tasks"
              className="block px-4 py-2.5 text-xs font-medium text-accent"
            >
              +{moreTasks} more {moreTasks === 1 ? "task" : "tasks"} →
            </Link>
          )}
          {billsDueNow.map((b) => (
            <Link
              key={b.id}
              to="/budget"
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="text-lg">{b.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{b.name}</span>
              <span
                className={`shrink-0 text-xs font-medium ${
                  b.due < today
                    ? "text-red-500 dark:text-red-400"
                    : "text-muted"
                }`}
              >
                {dueLabel(b.due)}
              </span>
              <span className="shrink-0 text-sm font-medium">
                {fmtMoney(b.amount, settings.currency)}
              </span>
            </Link>
          ))}
          {mealsToday.map((m) => (
            <Link
              key={m!.id}
              to="/meals"
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <span className="text-lg">{m!.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{m!.name}</span>
              <span className="shrink-0 text-xs font-medium text-muted">
                Tonight
              </span>
            </Link>
          ))}
          {todayEmpty && (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Nothing scheduled — enjoy the space, or grab a quick add below.
            </p>
          )}
        </div>
      </div>

      <HabitsSection />

      <QuickAdd />

      <BackupNudge />

      <div className="grid grid-cols-2 gap-3">
        {modules.map((m) => (
          <Link key={m.to} to={m.to}>
            <Card className="h-full transition-colors hover:border-accent-soft">
              <div className="mb-3 inline-flex rounded-xl bg-accent-soft p-2.5 text-accent">
                <m.icon size={20} strokeWidth={2} />
              </div>
              <p className="font-medium">{m.label}</p>
              <p className="mt-0.5 text-xs text-muted">{m.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
