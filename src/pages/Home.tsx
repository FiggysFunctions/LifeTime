import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ListChecks, CheckSquare, CalendarDays, PiggyBank, Dumbbell, ArrowRight } from "lucide-react";
import db from "../db";
import { todayStr, addDays } from "../dates";
import { fmtMoney } from "../money";
import { useSettings } from "../settings";
import { PageHeader, Card, Button } from "../components/ui";

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

const modules = [
  { to: "/lists", icon: ListChecks, label: "Lists", desc: "Shopping & more" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks", desc: "Plan your day" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar", desc: "Your month" },
  { to: "/budget", icon: PiggyBank, label: "Budget", desc: "Track spending" },
  { to: "/fitness", icon: Dumbbell, label: "Fitness", desc: "Workouts & health" },
];

export default function Home() {
  const { settings } = useSettings();
  const nowDate = new Date();
  const dateLabel = nowDate.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const remaining = useLiveQuery(
    () => db.items.filter((i) => !i.done).count(),
    [],
    0
  );
  const listCount = useLiveQuery(() => db.lists.count(), [], 0);
  const tasksToday = useLiveQuery(
    () =>
      db.tasks
        .filter((t) => !t.done && t.due !== null && t.due <= todayStr())
        .count(),
    [],
    0
  );
  const eventsToday = useLiveQuery(
    () => db.events.where("date").equals(todayStr()).count(),
    [],
    0
  );
  const billsSoon = useLiveQuery(
    async () => {
      const soon = addDays(todayStr(), 7);
      const due = (await db.bills.toArray()).filter((b) => b.due <= soon);
      return {
        count: due.length,
        total: due.reduce((s, b) => s + b.amount, 0),
      };
    },
    [],
    { count: 0, total: 0 }
  );
  const spentMonth = useLiveQuery(async () => {
    const ym = todayStr().slice(0, 7);
    const list = await db.expenses
      .where("date")
      .between(`${ym}-01`, `${ym}-31`, true, true)
      .toArray();
    return list.reduce((s, e) => s + e.amount, 0);
  }, [], 0);

  const name = settings.name && settings.name !== "friend" ? `, ${settings.name}` : "";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting(nowDate.getHours())}${name}`}
        subtitle={dateLabel}
        showSettings
      />

      <DayBar />

      {!settings.name && <NamePrompt />}

      {tasksToday > 0 && (
        <Link to="/tasks" className="block">
          <Card className="flex items-center justify-between transition-colors hover:border-accent-soft">
            <div>
              <p className="font-display text-2xl font-semibold text-accent">
                {tasksToday}
              </p>
              <p className="text-sm text-muted">
                {tasksToday === 1 ? "task" : "tasks"} on today's plate
              </p>
            </div>
            <ArrowRight size={18} className="text-muted" />
          </Card>
        </Link>
      )}

      {eventsToday > 0 && (
        <Link to="/calendar" className="block">
          <Card className="flex items-center justify-between transition-colors hover:border-accent-soft">
            <div>
              <p className="font-display text-2xl font-semibold text-accent">
                {eventsToday}
              </p>
              <p className="text-sm text-muted">
                {eventsToday === 1 ? "event" : "events"} in today's calendar
              </p>
            </div>
            <ArrowRight size={18} className="text-muted" />
          </Card>
        </Link>
      )}

      {billsSoon.count > 0 && (
        <Link to="/budget" className="block">
          <Card className="flex items-center justify-between transition-colors hover:border-accent-soft">
            <div>
              <p className="font-display text-2xl font-semibold text-accent">
                {fmtMoney(billsSoon.total, settings.currency)}
              </p>
              <p className="text-sm text-muted">
                {billsSoon.count === 1 ? "bill" : "bills"} due within a week
              </p>
            </div>
            <ArrowRight size={18} className="text-muted" />
          </Card>
        </Link>
      )}

      {spentMonth > 0 && (
        <Link to="/budget" className="block">
          <Card className="flex items-center justify-between transition-colors hover:border-accent-soft">
            <div>
              <p className="font-display text-2xl font-semibold text-accent">
                {fmtMoney(spentMonth, settings.currency)}
              </p>
              <p className="text-sm text-muted">spent so far this month</p>
            </div>
            <ArrowRight size={18} className="text-muted" />
          </Card>
        </Link>
      )}

      {listCount > 0 && (
        <Link to="/lists" className="block">
          <Card className="flex items-center justify-between transition-colors hover:border-accent-soft">
            <div>
              <p className="font-display text-2xl font-semibold text-accent">
                {remaining}
              </p>
              <p className="text-sm text-muted">
                {remaining === 1 ? "item" : "items"} left across your lists
              </p>
            </div>
            <ArrowRight size={18} className="text-muted" />
          </Card>
        </Link>
      )}

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
