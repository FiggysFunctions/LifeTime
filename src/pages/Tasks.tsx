import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  Check,
  X,
  Repeat,
  Flag,
  CheckSquare,
  Users,
  Timer,
  ListTree,
  Dices,
} from "lucide-react";
import db, { uid, now, type Task, type Priority, type Recurrence } from "../db";
import { todayStr, addDays, dueLabel } from "../dates";
import { getHouseholdRealmId } from "../household";
import { myName, notifyHousehold } from "../notify";
import { useFocus } from "../focus";
import { celebrate } from "../confetti";
import {
  completeTask,
  PRIORITY_WEIGHT,
  PRIORITY_FLAG as FLAG_COLOR,
  PRIORITY_RING as RING_COLOR,
} from "../actions";
import { PageHeader, Card, Button } from "../components/ui";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-accent-soft text-accent ring-1 ring-accent/50"
          : "bg-surface-2 text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function NewTaskForm({
  onDone,
  assignees,
}: {
  onDone: () => void;
  assignees: { id: string; label: string }[];
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [due, setDue] = useState<string | null>(todayStr());
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [assign, setAssign] = useState<string>("me"); // "me" | "anyone" | userId

  const create = async () => {
    const t = title.trim();
    if (!t) return;
    const shared = assign !== "me";
    const realmId = shared ? await getHouseholdRealmId() : undefined;
    await db.tasks.add({
      id: uid(),
      title: t,
      priority,
      // a repeating task needs a date to repeat from
      due: due ?? (recurrence !== "none" ? todayStr() : null),
      recurrence,
      done: false,
      completedAt: null,
      realmId,
      assignedTo: shared && assign !== "anyone" ? assign : undefined,
      createdAt: now(),
      updatedAt: now(),
    });
    if (realmId)
      notifyHousehold(
        `${myName()} assigned a task ${assign === "anyone" ? "to anyone" : "to you"}`,
        t,
        "/#/tasks",
        assign === "anyone" ? undefined : [assign]
      );
    onDone();
  };

  const today = todayStr();
  const tomorrow = addDays(today, 1);

  return (
    <Card className="border-accent-soft space-y-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()}
        placeholder="Task — e.g. Book dentist"
        enterKeyHint="done"
        className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
      />

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          Priority
        </p>
        <div className="flex gap-1.5">
          {(["low", "medium", "high"] as const).map((p) => (
            <Chip key={p} active={priority === p} onClick={() => setPriority(p)}>
              <span className="flex items-center gap-1">
                <Flag size={12} className={FLAG_COLOR[p]} />
                {p[0].toUpperCase() + p.slice(1)}
              </span>
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          When
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={due === today} onClick={() => setDue(today)}>
            Today
          </Chip>
          <Chip active={due === tomorrow} onClick={() => setDue(tomorrow)}>
            Tomorrow
          </Chip>
          <Chip active={due === null} onClick={() => setDue(null)}>
            Someday
          </Chip>
          <input
            type="date"
            value={due ?? ""}
            onChange={(e) => setDue(e.target.value || null)}
            aria-label="Pick a date"
            className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted outline-none focus:text-ink"
          />
        </div>
      </div>

      {assignees.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Assign to
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={assign === "me"} onClick={() => setAssign("me")}>
              Me
            </Chip>
            <Chip active={assign === "anyone"} onClick={() => setAssign("anyone")}>
              Anyone
            </Chip>
            {assignees.map((a) => (
              <Chip
                key={a.id}
                active={assign === a.id}
                onClick={() => setAssign(a.id)}
              >
                {a.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          Repeat
        </p>
        <div className="flex gap-1.5">
          {(["none", "daily", "weekly", "monthly", "yearly"] as const).map((r) => (
            <Chip key={r} active={recurrence === r} onClick={() => setRecurrence(r)}>
              {r === "none" ? "Never" : r[0].toUpperCase() + r.slice(1)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={create}>Add task</Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function TaskRow({ task, householdId }: { task: Task; householdId?: string }) {
  const { open: openFocus } = useFocus();
  const [expanded, setExpanded] = useState(false);
  const [stepText, setStepText] = useState("");
  const overdue = !task.done && task.due !== null && task.due < todayStr();
  const steps = task.steps ?? [];
  const doneSteps = steps.filter((s) => s.done).length;

  const complete = () => {
    completeTask(task);
    celebrate();
  };

  const addStep = () => {
    if (!stepText.trim()) return;
    db.tasks.update(task.id, {
      steps: [...steps, { text: stepText.trim(), done: false }],
      updatedAt: now(),
    });
    setStepText("");
  };
  const toggleStep = (i: number) => {
    const next = steps.map((s, j) => (j === i ? { ...s, done: !s.done } : s));
    if (next[i].done) celebrate();
    db.tasks.update(task.id, { steps: next, updatedAt: now() });
  };

  return (
    <li className="group rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={complete}
          aria-label={`Complete ${task.title}`}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors hover:border-accent ${RING_COLOR[task.priority]}`}
        />
        <button
          onClick={() => setExpanded(!expanded)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="break-words text-sm">{task.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
            <Flag size={11} className={FLAG_COLOR[task.priority]} />
            {task.due && (
              <span className={overdue ? "font-medium text-red-500 dark:text-red-400" : "text-muted"}>
                {dueLabel(task.due)}
              </span>
            )}
            {task.recurrence !== "none" && (
              <span className="flex items-center gap-1 text-muted">
                <Repeat size={11} /> {task.recurrence}
              </span>
            )}
            {steps.length > 0 && (
              <span className="flex items-center gap-1 text-muted">
                <ListTree size={11} /> {doneSteps}/{steps.length}
              </span>
            )}
            {!!householdId && task.realmId === householdId && (
              <span className="flex items-center gap-1 text-muted">
                <Users size={11} />
                {task.assignedTo ? task.assignedTo.split("@")[0] : "anyone"}
              </span>
            )}
          </p>
        </button>
        <button
          onClick={() => openFocus(task)}
          aria-label={`Focus on ${task.title}`}
          title="Focus"
          className="p-1.5 text-muted transition-colors hover:text-accent"
        >
          <Timer size={17} />
        </button>
        <button
          onClick={() => db.tasks.delete(task.id)}
          aria-label={`Delete ${task.title}`}
          className="p-1 text-muted opacity-60 transition-opacity hover:text-red-500 group-hover:opacity-100"
        >
          <X size={16} />
        </button>
      </div>

      {expanded && (
        <div className="mt-2.5 space-y-2 border-t border-line pt-2.5">
          {steps.length > 0 && (
            <ul className="space-y-1.5">
              {steps.map((s, i) => (
                <li key={i} className="group/step flex items-center gap-2.5">
                  <button
                    onClick={() => toggleStep(i)}
                    aria-label={`${s.done ? "Uncheck" : "Check"} ${s.text}`}
                    className={
                      s.done
                        ? "grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-white dark:text-bg"
                        : "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-line hover:border-accent"
                    }
                  >
                    {s.done && <Check size={12} strokeWidth={3} />}
                  </button>
                  <span
                    className={`min-w-0 flex-1 break-words text-sm ${s.done ? "text-muted line-through" : ""}`}
                  >
                    {s.text}
                  </span>
                  <button
                    onClick={() =>
                      db.tasks.update(task.id, {
                        steps: steps.filter((_, j) => j !== i),
                        updatedAt: now(),
                      })
                    }
                    aria-label={`Remove step ${s.text}`}
                    className="p-1 text-muted opacity-0 transition-opacity hover:text-red-500 group-hover/step:opacity-100"
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              value={stepText}
              onChange={(e) => setStepText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStep()}
              placeholder="Break it into a smaller step…"
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              onClick={addStep}
              aria-label="Add step"
              className="shrink-0 rounded-xl bg-accent-soft px-3 text-accent"
            >
              <Plus size={16} />
            </button>
          </div>
          <button
            onClick={() => openFocus(task)}
            className="flex items-center gap-1.5 text-xs font-medium text-accent"
          >
            <Timer size={13} /> Focus on this
          </button>
        </div>
      )}
    </li>
  );
}

// Ready-made recurring chores nothing else in the app nudges you about.
const UPKEEP: { title: string; recurrence: Recurrence }[] = [
  { title: "🔋 Test the smoke alarms", recurrence: "monthly" },
  { title: "🧽 Clean the range hood filter", recurrence: "monthly" },
  { title: "🛏️ Change the bed sheets", recurrence: "weekly" },
  { title: "🧹 Clear the gutters", recurrence: "yearly" },
  { title: "🚗 Book the car service", recurrence: "yearly" },
  { title: "🧯 Check first aid kit & extinguisher", recurrence: "yearly" },
];

function UpkeepPack({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  const have = new Set(tasks.map((t) => t.title.trim().toLowerCase()));
  const available = UPKEEP.filter((u) => !have.has(u.title.toLowerCase()));
  if (available.length === 0) return null;

  const add = (u: (typeof UPKEEP)[number]) =>
    db.tasks.add({
      id: uid(),
      title: u.title,
      priority: "low",
      due: todayStr(),
      recurrence: u.recurrence,
      done: false,
      completedAt: null,
      createdAt: now(),
      updatedAt: now(),
    });

  return (
    <div className="rounded-xl border border-dashed border-line p-3.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left text-sm text-muted"
      >
        <span>🏠 Home upkeep pack — ready-made recurring chores</span>
        <span className="text-xs">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {available.map((u) => (
            <Chip key={u.title} active={false} onClick={() => add(u)}>
              + {u.title} · {u.recurrence}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  tone = "text-muted",
  tasks,
  householdId,
}: {
  label: string;
  tone?: string;
  tasks: Task[];
  householdId?: string;
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <p className={`mb-2 px-1 text-xs font-medium uppercase tracking-wide ${tone}`}>
        {label} · {tasks.length}
      </p>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} householdId={householdId} />
        ))}
      </ul>
    </div>
  );
}

export default function Tasks() {
  // ?new=1 (from the app-icon shortcut) opens the form straight away
  const [params] = useSearchParams();
  const { open: openFocus } = useFocus();
  const [creating, setCreating] = useState(params.get("new") === "1");
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const householdId = useLiveQuery(() => getHouseholdRealmId(), [], undefined);
  const assignees = useLiveQuery(
    async () => {
      const rid = await getHouseholdRealmId();
      if (!rid) return [];
      const me = (db.cloud.currentUserId || "").toLowerCase();
      const realm = await db.realms.get(rid);
      const members = await db.members.where("realmId").equals(rid).toArray();
      const found = new Map<string, string>();
      const add = (raw?: string) => {
        const idStr = raw?.toLowerCase();
        if (idStr && idStr !== me && idStr !== "unauthorized")
          found.set(idStr, idStr.split("@")[0]);
      };
      add(realm?.owner);
      members.forEach((m) => add(m.userId ?? m.email));
      return [...found].map(([idStr, label]) => ({ id: idStr, label }));
    },
    [],
    [] as { id: string; label: string }[]
  );

  const today = todayStr();
  const byPlan = (a: Task, b: Task) =>
    (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
    PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
    a.createdAt - b.createdAt;

  const open = (tasks ?? []).filter((t) => !t.done).sort(byPlan);
  const overdue = open.filter((t) => t.due !== null && t.due < today);
  const dueToday = open.filter((t) => t.due === today);
  const upcoming = open.filter((t) => t.due !== null && t.due > today);
  const someday = open.filter((t) => t.due === null);
  const done = (tasks ?? [])
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const wins = (tasks ?? []).filter(
    (t) => t.done && (t.completedAt ?? 0) >= startOfToday.getTime()
  ).length;

  // "Pick one for me" — take the decision away: prefer what's overdue or due
  // today, and pick at random within that tier so it feels fresh, then drop
  // straight into focus mode.
  const pickOne = () => {
    const urgent = [...overdue, ...dueToday];
    const pool = urgent.length ? urgent : open;
    if (pool.length === 0) return;
    openFocus(pool[Math.floor(Math.random() * pool.length)]);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        subtitle={
          dueToday.length + overdue.length > 0
            ? `${dueToday.length + overdue.length} on today's plate.`
            : "Plan your day."
        }
        action={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <span className="flex items-center gap-1.5">
                <Plus size={16} /> New
              </span>
            </Button>
          )
        }
      />

      {creating && (
        <NewTaskForm onDone={() => setCreating(false)} assignees={assignees} />
      )}

      {(open.length > 0 || wins > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {open.length > 0 && (
            <>
              <button
                onClick={pickOne}
                className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white dark:text-bg"
              >
                <Dices size={16} /> Pick one for me
              </button>
              <button
                onClick={() => openFocus(null)}
                className="flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                <Timer size={16} /> Focus timer
              </button>
            </>
          )}
          {wins > 0 && (
            <span className="ml-auto text-xs font-medium text-accent">
              🎉 {wins} done today
            </span>
          )}
        </div>
      )}

      {tasks && tasks.length === 0 && !creating && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
          <div className="mb-4 rounded-2xl bg-accent-soft p-4 text-accent">
            <CheckSquare size={30} strokeWidth={1.75} />
          </div>
          <p className="font-medium">No tasks yet</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted">
            Tap New to add your first task — give it a priority, a day, and it
            can even repeat.
          </p>
        </div>
      )}

      <Section label="Overdue" tone="text-red-500 dark:text-red-400" tasks={overdue} householdId={householdId} />
      <Section label="Today" tone="text-accent" tasks={dueToday} householdId={householdId} />
      <Section label="Upcoming" tasks={upcoming} householdId={householdId} />
      <Section label="Someday" tasks={someday} householdId={householdId} />

      <UpkeepPack tasks={tasks ?? []} />

      {done.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Done · {done.length}
            </p>
            <button
              onClick={() => db.tasks.bulkDelete(done.map((t) => t.id))}
              className="text-xs text-muted underline-offset-2 hover:underline"
            >
              Clear done
            </button>
          </div>
          <ul className="space-y-2">
            {done.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 opacity-60"
              >
                <button
                  onClick={() =>
                    db.tasks.update(t.id, {
                      done: false,
                      completedAt: null,
                      updatedAt: now(),
                    })
                  }
                  aria-label={`Mark ${t.title} not done`}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-white dark:text-bg"
                >
                  <Check size={14} strokeWidth={3} />
                </button>
                <span className="min-w-0 flex-1 break-words text-sm line-through">
                  {t.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
