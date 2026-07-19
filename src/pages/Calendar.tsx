import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { fetchFeedEvents, type FeedEvent } from "../feed";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  CalendarDays,
  Bell,
  Pencil,
} from "lucide-react";
import db, { uid, now, type Occasion } from "../db";
import { toDateStr, todayStr, timeLabel, dueLabel } from "../dates";
import { syncReminders } from "../reminders";
import { getHouseholdRealmId } from "../household";
import { notifyEventAdded } from "../notify";
import { PageHeader, Card } from "../components/ui";

const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "No reminder" },
  { value: 0, label: "At time" },
  { value: 10, label: "10 min before" },
  { value: 30, label: "30 min before" },
  { value: 60, label: "1 hr before" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function AddEventForm({ date }: { date: string }) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [reminder, setReminder] = useState<number | null>(null);

  const add = async () => {
    const t = title.trim();
    if (!t) return;
    await db.events.add({
      id: uid(),
      title: t,
      date,
      time: time || null,
      reminderMins: time ? reminder : null,
      realmId: await getHouseholdRealmId(),
      createdAt: now(),
      updatedAt: now(),
    });
    notifyEventAdded(t, `${dueLabel(date)}${time ? ` · ${timeLabel(time)}` : ""}`);
    setTitle("");
    setTime("");
    setReminder(null);
    syncReminders();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add an event…"
          enterKeyHint="done"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Event time (optional)"
          className="w-[6.5rem] shrink-0 rounded-xl border border-line bg-surface px-2 text-sm text-muted outline-none focus:border-accent focus:text-ink"
        />
        <button
          onClick={add}
          aria-label="Add event"
          className="shrink-0 rounded-xl bg-accent px-4 text-white transition-all active:scale-95 dark:text-bg"
        >
          <Plus size={20} />
        </button>
      </div>
      {time && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Bell size={13} className="text-muted" />
          {REMINDER_OPTIONS.map((o) => (
            <button
              key={String(o.value)}
              onClick={() => setReminder(o.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                reminder === o.value
                  ? "bg-accent-soft text-accent ring-1 ring-accent/50"
                  : "bg-surface-2 text-muted hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const OCCASION_EMOJI = ["🎂", "💍", "🎉", "🕯️", "🎓", "👶"];

// The next calendar date this occasion lands on (this year or next).
export function nextOccasionDate(o: { month: number; day: number }): string {
  const today = todayStr();
  const y = Number(today.slice(0, 4));
  const thisYear = toDateStr(new Date(y, o.month - 1, o.day));
  return thisYear >= today
    ? thisYear
    : toDateStr(new Date(y + 1, o.month - 1, o.day));
}

function OccasionsSection() {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎂");
  const [date, setDate] = useState("");
  const occasions = useLiveQuery(
    () => db.occasions.orderBy("createdAt").toArray(),
    [],
    [] as Occasion[]
  );

  const add = async () => {
    if (!name.trim() || !date) return;
    const [, m, d] = date.split("-").map(Number);
    const { getHouseholdRealmId } = await import("../household");
    await db.occasions.add({
      id: uid(),
      name: name.trim(),
      emoji,
      month: m,
      day: d,
      realmId: await getHouseholdRealmId(),
      createdAt: now(),
      updatedAt: now(),
    });
    const { syncReminders } = await import("../reminders");
    syncReminders();
    setName("");
    setDate("");
  };

  const sorted = [...occasions].sort((a, b) =>
    nextOccasionDate(a).localeCompare(nextOccasionDate(b))
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Birthdays & anniversaries
        </p>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-1 text-xs text-muted underline-offset-2 hover:underline"
        >
          <Pencil size={12} /> {editing ? "Done" : "Edit"}
        </button>
      </div>
      <div className="space-y-2">
        {occasions.length === 0 && !editing && (
          <p className="rounded-xl border border-dashed border-line px-3.5 py-4 text-center text-sm text-muted">
            Add birthdays and anniversaries — they repeat every year and
            remind you 3 days out and on the day.
          </p>
        )}
        {sorted.map((o) => {
          const next = nextOccasionDate(o);
          return (
            <div
              key={o.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
            >
              <span className="text-lg">{o.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{o.name}</span>
              <span
                className={`shrink-0 text-xs font-medium ${
                  next === todayStr() ? "text-accent" : "text-muted"
                }`}
              >
                {next === todayStr() ? "Today 🎉" : dueLabel(next)}
              </span>
              {editing && (
                <button
                  onClick={async () => {
                    await db.occasions.delete(o.id);
                    const { syncReminders } = await import("../reminders");
                    syncReminders();
                  }}
                  aria-label={`Delete ${o.name}`}
                  className="p-1 text-muted hover:text-red-500"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          );
        })}
        {editing && (
          <div className="space-y-2.5 rounded-xl border border-dashed border-line p-3.5">
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Who or what — e.g. Mum's birthday"
                className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date (the year is ignored)"
                className="shrink-0 rounded-xl border border-line bg-bg px-2 py-2.5 text-sm text-muted outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {OCCASION_EMOJI.map((e) => (
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
              <button
                onClick={add}
                className="ml-auto rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white dark:text-bg"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Calendar() {
  const today = todayStr();
  const [view, setView] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(today);

  const y = view.getFullYear();
  const m = view.getMonth();
  const monthStart = toDateStr(new Date(y, m, 1));
  const monthEnd = toDateStr(new Date(y, m + 1, 0));
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first offset

  const monthEvents = useLiveQuery(
    () =>
      db.events
        .where("date")
        .between(monthStart, monthEnd, true, true)
        .toArray(),
    [monthStart, monthEnd]
  );
  const dayEvents = useLiveQuery(
    () => db.events.where("date").equals(selected).toArray(),
    [selected]
  );
  const occasions = useLiveQuery(
    () => db.occasions.toArray(),
    [],
    [] as Occasion[]
  );
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  useEffect(() => {
    fetchFeedEvents().then(setFeed);
  }, []);

  const countByDay = new Map<string, number>();
  monthEvents?.forEach((e) =>
    countByDay.set(e.date, (countByDay.get(e.date) ?? 0) + 1)
  );
  // occasions land on their month/day every year
  occasions.forEach((o) => {
    if (o.month === m + 1) {
      const key = toDateStr(new Date(y, m, o.day));
      countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
    }
  });
  feed.forEach((f) =>
    countByDay.set(f.date, (countByDay.get(f.date) ?? 0) + 1)
  );
  const feedDay = feed.filter((f) => f.date === selected);
  const [, selM, selD] = selected.split("-").map(Number);
  const dayOccasions = occasions.filter(
    (o) => o.month === selM && o.day === selD
  );

  // all-day events first, then by time
  const agenda = (dayEvents ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.time ?? "").localeCompare(b.time ?? "") || a.createdAt - b.createdAt
    );

  const goMonth = (delta: number) => {
    const next = new Date(y, m + delta, 1);
    setView(next);
    // land on today when it's in the shown month, otherwise the 1st
    setSelected(
      today >= toDateStr(next) &&
        today <= toDateStr(new Date(next.getFullYear(), next.getMonth() + 1, 0))
        ? today
        : toDateStr(next)
    );
  };

  const monthLabel = view.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const [sy, sm, sd] = selected.split("-").map(Number);
  const selectedLabel = new Date(sy, sm - 1, sd).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Calendar" subtitle="Your plans, month by month." />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display font-semibold">{monthLabel}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setView(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                setSelected(today);
              }}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Today
            </button>
            <button
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <p
              key={w}
              className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted"
            >
              {w}
            </p>
          ))}
          {Array.from({ length: lead }).map((_, i) => (
            <div key={`lead-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dateStr = toDateStr(new Date(y, m, i + 1));
            const isSelected = dateStr === selected;
            const isToday = dateStr === today;
            const count = countByDay.get(dateStr) ?? 0;
            return (
              <button
                key={dateStr}
                onClick={() => setSelected(dateStr)}
                aria-label={dateStr}
                className={`relative aspect-square rounded-xl text-sm transition-colors ${
                  isSelected
                    ? "bg-accent font-semibold text-white dark:text-bg"
                    : isToday
                      ? "bg-accent-soft font-semibold text-accent"
                      : "hover:bg-surface-2"
                }`}
              >
                {i + 1}
                {count > 0 && (
                  <span className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
                    {Array.from({ length: Math.min(count, 3) }).map((_, d) => (
                      <span
                        key={d}
                        className={`h-1 w-1 rounded-full ${
                          isSelected ? "bg-white dark:bg-bg" : "bg-accent"
                        }`}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="space-y-3">
        <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
          {selected === today ? `Today — ${selectedLabel}` : selectedLabel}
        </p>

        <AddEventForm date={selected} />

        {dayOccasions.length > 0 && (
          <ul className="space-y-2">
            {dayOccasions.map((o) => (
              <li
                key={o.id}
                className="flex items-center gap-3 rounded-xl border border-accent-soft bg-surface px-3.5 py-3"
              >
                <span className="w-16 shrink-0 text-xs font-medium text-accent">
                  Every year
                </span>
                <span className="min-w-0 flex-1 break-words text-sm">
                  {o.emoji} {o.name}
                </span>
              </li>
            ))}
          </ul>
        )}

        {feedDay.length > 0 && (
          <ul className="space-y-2">
            {feedDay
              .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))
              .map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 opacity-75"
                >
                  <span className="w-16 shrink-0 text-xs font-medium text-muted">
                    {f.time ? timeLabel(f.time) : "All day"}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm">
                    {f.title}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium uppercase text-muted">
                    feed
                  </span>
                </li>
              ))}
          </ul>
        )}

        {agenda.length === 0 && dayOccasions.length === 0 && feedDay.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
            <div className="mb-3 rounded-2xl bg-accent-soft p-3 text-accent">
              <CalendarDays size={24} strokeWidth={1.75} />
            </div>
            <p className="text-sm text-muted">
              Nothing planned — add something above.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {agenda.map((e) => (
            <li
              key={e.id}
              className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <span className="w-16 shrink-0 text-xs font-medium text-accent">
                {e.time ? timeLabel(e.time) : "All day"}
              </span>
              <span className="min-w-0 flex-1 break-words text-sm">
                {e.title}
              </span>
              {e.reminderMins != null && (
                <Bell size={13} className="shrink-0 text-muted" />
              )}
              <button
                onClick={() =>
                  db.events.delete(e.id).then(() => syncReminders())
                }
                aria-label={`Delete ${e.title}`}
                className="p-1 text-muted opacity-60 transition-opacity hover:text-red-500 group-hover:opacity-100"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <OccasionsSection />
    </div>
  );
}
