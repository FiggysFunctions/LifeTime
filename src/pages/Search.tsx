import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Search as SearchIcon,
  ListChecks,
  CheckSquare,
  CalendarDays,
  PiggyBank,
  Dumbbell,
  UtensilsCrossed,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import db from "../db";
import { dueLabel, timeLabel } from "../dates";
import { fmtMoney } from "../money";
import { useSettings } from "../settings";
import { PageHeader } from "../components/ui";

interface Result {
  id: string;
  title: string;
  context: string;
  to: string;
}

export default function Search() {
  const { settings } = useSettings();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const active = query.length >= 2;
  const match = (s: string | null | undefined) =>
    !!s && s.toLowerCase().includes(query);

  const lists = useLiveQuery(() => db.lists.toArray(), [], []);
  const items = useLiveQuery(() => db.items.toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);
  const bills = useLiveQuery(() => db.bills.toArray(), [], []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const meals = useLiveQuery(() => db.meals.toArray(), [], []);
  const routines = useLiveQuery(() => db.routines.toArray(), [], []);
  const workouts = useLiveQuery(() => db.workouts.toArray(), [], []);
  const cardio = useLiveQuery(() => db.cardio.toArray(), [], []);
  const habits = useLiveQuery(() => db.habits.toArray(), [], []);
  const notes = useLiveQuery(() => db.notes.toArray(), [], []);
  const occasions = useLiveQuery(() => db.occasions.toArray(), [], []);

  const listById = new Map(lists.map((l) => [l.id, l]));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const groups: { label: string; icon: LucideIcon; results: Result[] }[] =
    !active
      ? []
      : [
          {
            label: "Lists",
            icon: ListChecks,
            results: [
              ...lists
                .filter((l) => match(l.name))
                .map((l) => ({
                  id: `list-${l.id}`,
                  title: `${l.emoji} ${l.name}`,
                  context: "List",
                  to: `/lists/${l.id}`,
                })),
              ...items
                .filter((i) => match(i.text))
                .map((i) => {
                  const l = listById.get(i.listId);
                  return {
                    id: `item-${i.id}`,
                    title: i.text,
                    context: `in ${l ? `${l.emoji} ${l.name}` : "a list"}${i.done ? " · ticked off" : ""}`,
                    to: `/lists/${i.listId}`,
                  };
                }),
            ],
          },
          {
            label: "Tasks",
            icon: CheckSquare,
            results: tasks
              .filter((t) => match(t.title))
              .map((t) => ({
                id: `task-${t.id}`,
                title: t.title,
                context: t.done
                  ? "Done"
                  : t.due
                    ? `Due ${dueLabel(t.due)}`
                    : "Someday",
                to: "/tasks",
              })),
          },
          {
            label: "Calendar",
            icon: CalendarDays,
            results: [
              ...events
                .filter((e) => match(e.title))
                .map((e) => ({
                  id: `event-${e.id}`,
                  title: e.title,
                  context: `${dueLabel(e.date)}${e.time ? ` · ${timeLabel(e.time)}` : ""}`,
                  to: "/calendar",
                })),
              ...occasions
                .filter((o) => match(o.name))
                .map((o) => ({
                  id: `occ-${o.id}`,
                  title: `${o.emoji} ${o.name}`,
                  context: `Every year · ${new Date(2000, o.month - 1, o.day).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
                  to: "/calendar",
                })),
            ],
          },
          {
            label: "Budget",
            icon: PiggyBank,
            results: [
              ...bills
                .filter((b) => match(b.name))
                .map((b) => ({
                  id: `bill-${b.id}`,
                  title: `${b.emoji} ${b.name}`,
                  context: `Bill · next ${dueLabel(b.due)} · ${fmtMoney(b.amount, settings.currency)}`,
                  to: "/budget",
                })),
              ...categories
                .filter((c) => match(c.name))
                .map((c) => ({
                  id: `cat-${c.id}`,
                  title: `${c.emoji} ${c.name}`,
                  context: "Spending category",
                  to: "/budget",
                })),
              ...expenses
                .filter((e) => match(e.note))
                .map((e) => {
                  const c = catById.get(e.categoryId);
                  return {
                    id: `exp-${e.id}`,
                    title: e.note,
                    context: `${fmtMoney(e.amount, settings.currency)} · ${dueLabel(e.date)}${c ? ` · ${c.name}` : ""}`,
                    to: "/budget",
                  };
                }),
            ],
          },
          {
            label: "Meals",
            icon: UtensilsCrossed,
            results: meals
              .filter(
                (m) => match(m.name) || match(m.note) || m.ingredients.some(match)
              )
              .map((m) => ({
                id: `meal-${m.id}`,
                title: `${m.emoji} ${m.name}`,
                context: m.ingredients.slice(0, 4).join(" · ") || "Meal",
                to: "/meals",
              })),
          },
          {
            label: "Notes",
            icon: StickyNote,
            results: notes
              .filter((n) => match(n.text))
              .map((n) => ({
                id: `note-${n.id}`,
                title: n.text.split("\n")[0].trim() || "Untitled",
                context:
                  n.text.split("\n").slice(1).join(" ").trim().slice(0, 80) ||
                  "Note",
                to: "/notes",
              })),
          },
          {
            label: "Fitness",
            icon: Dumbbell,
            results: [
              ...routines
                .filter((r) => match(r.name) || r.exercises.some(match))
                .map((r) => ({
                  id: `routine-${r.id}`,
                  title: `${r.emoji} ${r.name}`,
                  context: r.exercises.slice(0, 4).join(" · ") || "Routine",
                  to: "/fitness",
                })),
              ...workouts
                .filter(
                  (w) =>
                    match(w.routineName) ||
                    w.sets.some((s) => match(s.exercise))
                )
                .map((w) => ({
                  id: `workout-${w.id}`,
                  title: w.routineName,
                  context: `Workout · ${dueLabel(w.date)} · ${w.sets.length} ${w.sets.length === 1 ? "set" : "sets"}`,
                  to: "/fitness",
                })),
              ...cardio
                .filter((c) => match(c.kind))
                .map((c) => ({
                  id: `cardio-${c.id}`,
                  title: c.kind,
                  context: `Cardio · ${dueLabel(c.date)} · ${c.mins} min`,
                  to: "/fitness",
                })),
              ...habits
                .filter((h) => match(h.name))
                .map((h) => ({
                  id: `habit-${h.id}`,
                  title: `${h.emoji} ${h.name}`,
                  context: "Habit",
                  to: "/",
                })),
            ],
          },
        ]
          .map((g) => ({ ...g, results: g.results.slice(0, 6) }))
          .filter((g) => g.results.length > 0);

  const total = groups.reduce((s, g) => s + g.results.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Search" subtitle="Everything, one box." />

      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 focus-within:border-accent">
        <SearchIcon size={17} className="shrink-0 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lists, tasks, bills, meals…"
          className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted"
        />
      </div>

      {!active && (
        <p className="py-8 text-center text-sm text-muted">
          Type at least two letters — it searches everything you've ever put
          in Lifetime, instantly.
        </p>
      )}

      {active && total === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          Nothing matches “{q.trim()}”.
        </p>
      )}

      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted">
            <g.icon size={13} /> {g.label}
          </p>
          <ul className="space-y-2">
            {g.results.map((r) => (
              <li key={r.id}>
                <Link
                  to={r.to}
                  className="block rounded-xl border border-line bg-surface px-3.5 py-3 transition-colors hover:border-accent-soft"
                >
                  <p className="truncate text-sm">{r.title}</p>
                  <p className="truncate text-xs text-muted">{r.context}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
