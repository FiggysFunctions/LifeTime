import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  X,
  Dumbbell,
  Flame,
  Scale,
  Timer,
  Pencil,
  Check,
} from "lucide-react";
import db, {
  uid,
  now,
  type Routine,
  type Workout,
  type WorkoutSet,
  type Cardio,
  type Measurement,
  type ActivityMark,
} from "../db";
import { todayStr, addDays } from "../dates";
import { parseAmount, round2 } from "../money";
import { useSettings, type Units } from "../settings";
import { PageHeader, Card, Button, Chip } from "../components/ui";

// ---- units (everything is stored metric) ----
const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;
const round1 = (n: number) => Math.round(n * 10) / 10;

const weightUnit = (u: Units) => (u === "metric" ? "kg" : "lb");
const distUnit = (u: Units) => (u === "metric" ? "km" : "mi");
const showWeight = (kg: number, u: Units) =>
  round1(u === "metric" ? kg : kg / KG_PER_LB);
const showDist = (km: number, u: Units) =>
  round2(u === "metric" ? km : km / KM_PER_MI);
const toKg = (v: number, u: Units) =>
  round2(u === "metric" ? v : v * KG_PER_LB);
const toKm = (v: number, u: Units) =>
  round2(u === "metric" ? v : v * KM_PER_MI);

const dayLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

const paceLabel = (mins: number, dist: number) => {
  const secPer = (mins * 60) / dist;
  const mm = Math.floor(secPer / 60);
  const ss = Math.round(secPer % 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
};

const inputCls =
  "rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent";

// ---- this week / streak ----
function WeekCard({
  activeDates,
  manualToday,
}: {
  activeDates: Set<string>;
  manualToday: ActivityMark | undefined;
}) {
  const { settings, update } = useSettings();
  const goal = Math.min(Math.max(settings.weeklyGoal || 3, 1), 7);
  const today = todayStr();
  const monday = addDays(today, -((new Date().getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const activeThisWeek = week.filter((d) => activeDates.has(d)).length;

  // weekly-goal streak; the current week counts once the goal is met
  let streak = activeThisWeek >= goal ? 1 : 0;
  for (let k = 1; k <= 520; k++) {
    const start = addDays(monday, -7 * k);
    let n = 0;
    for (let i = 0; i < 7; i++) if (activeDates.has(addDays(start, i))) n++;
    if (n >= goal) streak++;
    else break;
  }

  const todayActive = activeDates.has(today);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">This week</p>
        <div className="flex items-center gap-1 text-xs text-muted">
          <button
            onClick={() => update({ weeklyGoal: Math.max(goal - 1, 1) })}
            aria-label="Lower weekly goal"
            className="rounded-full px-2 py-0.5 hover:bg-surface-2 hover:text-ink"
          >
            −
          </button>
          <span>Goal {goal}/wk</span>
          <button
            onClick={() => update({ weeklyGoal: Math.min(goal + 1, 7) })}
            aria-label="Raise weekly goal"
            className="rounded-full px-2 py-0.5 hover:bg-surface-2 hover:text-ink"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-3 flex justify-between">
        {week.map((d, i) => {
          const active = activeDates.has(d);
          const isToday = d === today;
          return (
            <div key={d} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-medium text-muted">
                {["M", "T", "W", "T", "F", "S", "S"][i]}
              </span>
              <span
                className={`grid h-8 w-8 place-items-center rounded-full text-white dark:text-bg ${
                  active ? "bg-accent" : "bg-surface-2"
                } ${isToday ? "ring-2 ring-accent/50" : ""}`}
              >
                {active && <Check size={14} strokeWidth={3} />}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted">
          <span
            className={
              activeThisWeek >= goal ? "font-medium text-accent" : undefined
            }
          >
            {activeThisWeek} of {goal}
          </span>{" "}
          active days
          {streak > 1 && (
            <span className="ml-2 inline-flex items-center gap-1 font-medium text-accent">
              <Flame size={12} /> {streak}-week streak
            </span>
          )}
        </p>
        {manualToday ? (
          <button
            onClick={() => db.activity.delete(manualToday.id)}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Unmark today
          </button>
        ) : (
          !todayActive && (
            <button
              onClick={() =>
                db.activity.add({
                  id: uid(),
                  date: today,
                  createdAt: now(),
                  updatedAt: now(),
                })
              }
              className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent"
            >
              I was active today
            </button>
          )
        )}
      </div>
    </Card>
  );
}

// ---- workout logging ----
type DraftExercise = { name: string; sets: { weight: number | null; reps: number }[] };

function ExerciseDraft({
  ex,
  units,
  onChange,
  onRemove,
}: {
  ex: DraftExercise;
  units: Units;
  onChange: (sets: DraftExercise["sets"]) => void;
  onRemove: () => void;
}) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  const addSet = () => {
    const r = parseInt(reps, 10);
    if (!Number.isFinite(r) || r < 1) return;
    let kg: number | null = null;
    if (weight.trim() !== "") {
      const w = parseAmount(weight);
      if (w === null) return;
      kg = toKg(w, units);
    }
    onChange([...ex.sets, { weight: kg, reps: r }]);
  };

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{ex.name}</p>
        <button
          onClick={onRemove}
          aria-label={`Remove ${ex.name}`}
          className="p-1 text-muted hover:text-red-500"
        >
          <X size={14} />
        </button>
      </div>
      {ex.sets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ex.sets.map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs"
            >
              {s.weight === null
                ? `${s.reps} reps`
                : `${showWeight(s.weight, units)} ${weightUnit(units)} × ${s.reps}`}
              <button
                onClick={() => onChange(ex.sets.filter((_, j) => j !== i))}
                aria-label="Remove set"
                className="text-muted hover:text-red-500"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder={weightUnit(units)}
          inputMode="decimal"
          aria-label={`Weight (${weightUnit(units)})`}
          className={`w-20 min-w-0 ${inputCls}`}
        />
        <input
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSet()}
          placeholder="reps"
          inputMode="numeric"
          aria-label="Reps"
          className={`w-20 min-w-0 ${inputCls}`}
        />
        <button
          onClick={addSet}
          className="rounded-xl bg-accent-soft px-3 text-xs font-semibold text-accent"
        >
          + Set
        </button>
      </div>
    </div>
  );
}

function LogWorkoutForm({
  routines,
  onDone,
}: {
  routines: Routine[];
  onDone: () => void;
}) {
  const { settings } = useSettings();
  const [date, setDate] = useState(todayStr());
  const [routineName, setRoutineName] = useState("Workout");
  const [draft, setDraft] = useState<DraftExercise[] | null>(null);
  const [newExercise, setNewExercise] = useState("");

  const start = (r?: Routine) => {
    setRoutineName(r?.name ?? "Workout");
    setDraft((r?.exercises ?? []).map((name) => ({ name, sets: [] })));
  };

  const addExercise = () => {
    const n = newExercise.trim();
    if (!n || !draft) return;
    setDraft([...draft, { name: n, sets: [] }]);
    setNewExercise("");
  };

  const save = async () => {
    const sets: WorkoutSet[] = (draft ?? []).flatMap((ex) =>
      ex.sets.map((s) => ({ exercise: ex.name, ...s }))
    );
    if (sets.length === 0) return;
    await db.workouts.add({
      id: uid(),
      date,
      routineName,
      sets,
      createdAt: now(),
      updatedAt: now(),
    });
    onDone();
  };

  if (draft === null)
    return (
      <Card className="border-accent-soft">
        <p className="mb-2 text-sm font-medium">Log a workout</p>
        <div className="flex flex-wrap gap-1.5">
          {routines.map((r) => (
            <Chip key={r.id} active={false} onClick={() => start(r)}>
              {r.emoji} {r.name}
            </Chip>
          ))}
          <Chip active={false} onClick={() => start()}>
            Blank workout
          </Chip>
        </div>
        <div className="mt-3">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </Card>
    );

  return (
    <Card className="border-accent-soft space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{routineName}</p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Workout date"
          className={`shrink-0 text-muted ${inputCls}`}
        />
      </div>

      {draft.map((ex, i) => (
        <ExerciseDraft
          key={`${ex.name}-${i}`}
          ex={ex}
          units={settings.units}
          onChange={(sets) =>
            setDraft(draft.map((d, j) => (j === i ? { ...d, sets } : d)))
          }
          onRemove={() => setDraft(draft.filter((_, j) => j !== i))}
        />
      ))}

      <div className="flex gap-2">
        <input
          value={newExercise}
          onChange={(e) => setNewExercise(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addExercise()}
          placeholder="Add exercise — e.g. Bench press"
          className={`min-w-0 flex-1 ${inputCls}`}
        />
        <button
          onClick={addExercise}
          aria-label="Add exercise"
          className="shrink-0 rounded-xl bg-accent-soft px-3 text-accent"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={save}>Save workout</Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ---- cardio logging ----
const CARDIO_KINDS = ["Run", "Walk", "Ride", "Swim"];

function LogCardioForm({ onDone }: { onDone: () => void }) {
  const { settings } = useSettings();
  const [kind, setKind] = useState("Run");
  const [distance, setDistance] = useState("");
  const [mins, setMins] = useState("");
  const [date, setDate] = useState(todayStr());

  const save = async () => {
    const m = parseAmount(mins);
    if (m === null) return;
    let km: number | null = null;
    if (distance.trim() !== "") {
      const d = parseAmount(distance);
      if (d === null) return;
      km = toKm(d, settings.units);
    }
    await db.cardio.add({
      id: uid(),
      date,
      kind,
      distanceKm: km,
      mins: m,
      createdAt: now(),
      updatedAt: now(),
    });
    onDone();
  };

  return (
    <Card className="border-accent-soft space-y-3">
      <p className="text-sm font-medium">Log cardio</p>
      <div className="flex flex-wrap gap-1.5">
        {CARDIO_KINDS.map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
            {k}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          placeholder={distUnit(settings.units)}
          inputMode="decimal"
          aria-label={`Distance (${distUnit(settings.units)}, optional)`}
          className={`w-24 min-w-0 ${inputCls}`}
        />
        <input
          value={mins}
          onChange={(e) => setMins(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="minutes"
          inputMode="decimal"
          aria-label="Minutes"
          className={`w-24 min-w-0 ${inputCls}`}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Cardio date"
          className={`min-w-0 flex-1 text-muted ${inputCls}`}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={save}>Save</Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ---- weight logging ----
function LogWeightForm({ onDone }: { onDone: () => void }) {
  const { settings } = useSettings();
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayStr());

  const save = async () => {
    const v = parseAmount(value);
    if (v === null) return;
    await db.measurements.add({
      id: uid(),
      date,
      kind: "weight",
      value: toKg(v, settings.units),
      createdAt: now(),
      updatedAt: now(),
    });
    onDone();
  };

  return (
    <Card className="border-accent-soft space-y-3">
      <p className="text-sm font-medium">Log weight</p>
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border border-line bg-bg focus-within:border-accent">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="0.0"
            inputMode="decimal"
            aria-label={`Weight (${weightUnit(settings.units)})`}
            className="w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted"
          />
          <span className="pr-3 text-sm text-muted">
            {weightUnit(settings.units)}
          </span>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className={`shrink-0 text-muted ${inputCls}`}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={save}>Save</Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ---- weight trend ----
function WeightCard({ measurements }: { measurements: Measurement[] }) {
  const { settings } = useSettings();
  const u = settings.units;
  const sorted = [...measurements].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt
  );
  if (sorted.length === 0) return null;

  const latest = sorted[sorted.length - 1];
  const pts = sorted.slice(-20);
  const vals = pts.map((p) => showWeight(p.value, u));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 300;
  const H = 72;
  const PAD = 8;
  const coords = vals.map((v, i) => [
    pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * (W - PAD * 2) + PAD,
    H - PAD - ((v - min) / span) * (H - PAD * 2),
  ]);

  const cutoff = addDays(todayStr(), -30);
  const before = sorted.filter((p) => p.date <= cutoff);
  const ref = before.length ? before[before.length - 1] : sorted[0];
  const delta = round1(showWeight(latest.value, u) - showWeight(ref.value, u));

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Scale size={15} className="text-accent" /> Weight
        </p>
        <button
          onClick={() => db.measurements.delete(latest.id)}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          Delete latest
        </button>
      </div>
      <p className="mt-1.5 font-display text-2xl font-semibold">
        {showWeight(latest.value, u)}{" "}
        <span className="text-base font-normal text-muted">
          {weightUnit(u)}
        </span>
      </p>
      <p className="text-xs text-muted">
        {sorted.length < 2
          ? `Logged ${dayLabel(latest.date)} — add more entries to see a trend.`
          : delta === 0
            ? `No change since ${dayLabel(ref.date)}`
            : `${delta < 0 ? "↓" : "↑"} ${Math.abs(delta)} ${weightUnit(u)} since ${dayLabel(ref.date)}`}
      </p>
      {pts.length >= 2 && (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mt-3 w-full"
            role="img"
            aria-label="Weight trend"
          >
            <polyline
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={coords.map((c) => c.map(round1).join(",")).join(" ")}
            />
            <circle
              cx={coords[coords.length - 1][0]}
              cy={coords[coords.length - 1][1]}
              r="3.5"
              fill="var(--accent)"
            />
          </svg>
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>{dayLabel(pts[0].date)}</span>
            <span>{dayLabel(latest.date)}</span>
          </div>
        </>
      )}
    </Card>
  );
}

// ---- personal bests ----
function BestsCard({ workouts }: { workouts: Workout[] }) {
  const { settings } = useSettings();
  const map = new Map<
    string,
    { exercise: string; weight: number; reps: number }
  >();
  for (const w of workouts)
    for (const s of w.sets) {
      if (s.weight === null) continue;
      const k = s.exercise.trim().toLowerCase();
      const cur = map.get(k);
      if (
        !cur ||
        s.weight > cur.weight ||
        (s.weight === cur.weight && s.reps > cur.reps)
      )
        map.set(k, { exercise: s.exercise, weight: s.weight, reps: s.reps });
    }
  const bests = [...map.values()].sort((a, b) => b.weight - a.weight);
  if (bests.length === 0) return null;

  return (
    <Card>
      <p className="text-sm font-medium">Personal bests</p>
      <ul className="mt-2 space-y-1.5">
        {bests.slice(0, 6).map((b) => (
          <li key={b.exercise} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{b.exercise}</span>
            <span className="shrink-0 text-sm font-medium text-accent">
              {showWeight(b.weight, settings.units)} {weightUnit(settings.units)} × {b.reps}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---- routines ----
const ROUTINE_EMOJI = ["💪", "🏋️", "🦵", "🏃", "🧘", "🤸", "🏊", "⚽"];

// No-equipment calisthenics starter routines (a chair or wall is the
// only "equipment" any of these need).
const PREMADE: { name: string; emoji: string; exercises: string[] }[] = [
  {
    name: "Full body",
    emoji: "💪",
    exercises: ["Push-ups", "Squats", "Lunges", "Glute bridges", "Plank"],
  },
  {
    name: "Upper body push",
    emoji: "🙌",
    exercises: ["Push-ups", "Pike push-ups", "Diamond push-ups", "Chair dips"],
  },
  {
    name: "Legs & glutes",
    emoji: "🦵",
    exercises: [
      "Squats",
      "Reverse lunges",
      "Split squats",
      "Calf raises",
      "Wall sit",
    ],
  },
  {
    name: "Core",
    emoji: "🧱",
    exercises: [
      "Plank",
      "Side plank",
      "Leg raises",
      "Crunches",
      "Mountain climbers",
    ],
  },
  {
    name: "HIIT quickie",
    emoji: "⚡",
    exercises: [
      "Jumping jacks",
      "Burpees",
      "High knees",
      "Squat jumps",
      "Mountain climbers",
    ],
  },
];

function AddRoutineForm() {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("💪");
  const [exercises, setExercises] = useState<string[]>([]);
  const [exInput, setExInput] = useState("");

  const addEx = () => {
    const n = exInput.trim();
    if (!n) return;
    setExercises([...exercises, n]);
    setExInput("");
  };

  const create = async () => {
    if (!name.trim() || exercises.length === 0) return;
    await db.routines.add({
      id: uid(),
      name: name.trim(),
      emoji,
      exercises,
      createdAt: now(),
      updatedAt: now(),
    });
    setName("");
    setExercises([]);
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-dashed border-line p-3.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Routine name — e.g. Push day"
        className={`w-full ${inputCls}`}
      />
      <div className="flex flex-wrap gap-1.5">
        {ROUTINE_EMOJI.map((e) => (
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
      {exercises.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {exercises.map((ex, i) => (
            <span
              key={`${ex}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs"
            >
              {ex}
              <button
                onClick={() => setExercises(exercises.filter((_, j) => j !== i))}
                aria-label={`Remove ${ex}`}
                className="text-muted hover:text-red-500"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={exInput}
          onChange={(e) => setExInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addEx()}
          placeholder="Add exercise, press Enter"
          className={`min-w-0 flex-1 ${inputCls}`}
        />
        <button
          onClick={create}
          className="shrink-0 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white dark:text-bg"
        >
          Add routine
        </button>
      </div>
    </div>
  );
}

function RoutinesSection({ routines }: { routines: Routine[] }) {
  const [editing, setEditing] = useState(false);

  const have = new Set(routines.map((r) => r.name.trim().toLowerCase()));
  const available = PREMADE.filter((p) => !have.has(p.name.toLowerCase()));
  const addPremade = (p: (typeof PREMADE)[number]) =>
    db.routines.add({
      id: uid(),
      ...p,
      createdAt: now(),
      updatedAt: now(),
    });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Routines
        </p>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-1 text-xs text-muted underline-offset-2 hover:underline"
        >
          <Pencil size={12} /> {editing ? "Done" : "Edit"}
        </button>
      </div>
      <div className="space-y-2">
        {routines.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
          >
            <span className="text-lg">{r.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{r.name}</p>
              <p className="truncate text-xs text-muted">
                {r.exercises.join(" · ")}
              </p>
            </div>
            {editing && (
              <button
                onClick={() => db.routines.delete(r.id)}
                aria-label={`Delete ${r.name}`}
                className="p-1 text-muted hover:text-red-500"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        {(editing || routines.length === 0) && available.length > 0 && (
          <div className="rounded-xl border border-dashed border-line p-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Premade · no equipment needed
            </p>
            <div className="mt-2 space-y-2">
              {available.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-lg">{p.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{p.name}</p>
                    <p className="truncate text-xs text-muted">
                      {p.exercises.join(" · ")}
                    </p>
                  </div>
                  <button
                    onClick={() => addPremade(p)}
                    aria-label={`Add ${p.name} routine`}
                    className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Tip: leave the weight box empty for bodyweight moves, and for
              holds like planks put the seconds in the reps box.
            </p>
          </div>
        )}
        {editing && <AddRoutineForm />}
      </div>
    </div>
  );
}

// ---- history ----
function WorkoutDetails({ w, units }: { w: Workout; units: Units }) {
  const byEx: { name: string; sets: WorkoutSet[] }[] = [];
  for (const s of w.sets) {
    const g = byEx.find((g) => g.name === s.exercise);
    if (g) g.sets.push(s);
    else byEx.push({ name: s.exercise, sets: [s] });
  }
  return (
    <div className="mt-2 space-y-1 border-t border-line pt-2">
      {byEx.map((g) => (
        <p key={g.name} className="text-xs text-muted">
          <span className="font-medium text-ink">{g.name}:</span>{" "}
          {g.sets
            .map((s) =>
              s.weight === null
                ? `${s.reps}`
                : `${showWeight(s.weight, units)}×${s.reps}`
            )
            .join(", ")}
        </p>
      ))}
    </div>
  );
}

function History({
  workouts,
  cardio,
}: {
  workouts: Workout[];
  cardio: Cardio[];
}) {
  const { settings } = useSettings();
  const u = settings.units;
  const [expanded, setExpanded] = useState<string | null>(null);

  const entries = [
    ...workouts.map((w) => ({ sort: `${w.date}-${w.createdAt}`, w, c: null as Cardio | null })),
    ...cardio.map((c) => ({ sort: `${c.date}-${c.createdAt}`, w: null as Workout | null, c })),
  ]
    .sort((a, b) => b.sort.localeCompare(a.sort))
    .slice(0, 15);

  if (entries.length === 0) return null;

  return (
    <div>
      <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
        History
      </p>
      <ul className="space-y-2">
        {entries.map(({ w, c }) => {
          if (w) {
            const volume = w.sets.reduce(
              (s, x) => s + (x.weight ?? 0) * x.reps,
              0
            );
            return (
              <li
                key={w.id}
                className="group rounded-xl border border-line bg-surface px-3.5 py-3"
              >
                <div className="flex items-center gap-3">
                  <Dumbbell size={16} className="shrink-0 text-accent" />
                  <button
                    onClick={() => setExpanded(expanded === w.id ? null : w.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm">{w.routineName}</p>
                    <p className="text-xs text-muted">
                      {dayLabel(w.date)} · {w.sets.length}{" "}
                      {w.sets.length === 1 ? "set" : "sets"}
                      {volume > 0 &&
                        ` · ${Math.round(showWeight(volume, u)).toLocaleString()} ${weightUnit(u)}`}
                    </p>
                  </button>
                  <button
                    onClick={() => db.workouts.delete(w.id)}
                    aria-label="Delete workout"
                    className="p-1 text-muted opacity-60 hover:text-red-500 group-hover:opacity-100"
                  >
                    <X size={16} />
                  </button>
                </div>
                {expanded === w.id && <WorkoutDetails w={w} units={u} />}
              </li>
            );
          }
          const cd = c!;
          return (
            <li
              key={cd.id}
              className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <Timer size={16} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{cd.kind}</p>
                <p className="text-xs text-muted">
                  {dayLabel(cd.date)}
                  {cd.distanceKm !== null &&
                    ` · ${showDist(cd.distanceKm, u)} ${distUnit(u)}`}
                  {` · ${cd.mins} min`}
                  {cd.distanceKm !== null &&
                    cd.distanceKm > 0 &&
                    ` · ${paceLabel(cd.mins, showDist(cd.distanceKm, u))} /${distUnit(u)}`}
                </p>
              </div>
              <button
                onClick={() => db.cardio.delete(cd.id)}
                aria-label="Delete cardio"
                className="p-1 text-muted opacity-60 hover:text-red-500 group-hover:opacity-100"
              >
                <X size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- page ----
export default function Fitness() {
  const [logging, setLogging] = useState<null | "workout" | "cardio" | "weight">(null);

  const routines = useLiveQuery(() => db.routines.orderBy("createdAt").toArray(), []);
  const workouts = useLiveQuery(() => db.workouts.toArray(), []);
  const cardio = useLiveQuery(() => db.cardio.toArray(), []);
  const measurements = useLiveQuery(() => db.measurements.toArray(), []);
  const activity = useLiveQuery(() => db.activity.toArray(), []);

  const activeDates = new Set<string>([
    ...(workouts ?? []).map((w) => w.date),
    ...(cardio ?? []).map((c) => c.date),
    ...(activity ?? []).map((a) => a.date),
  ]);
  const manualToday = (activity ?? []).find((a) => a.date === todayStr());

  const quickLog = [
    { id: "workout" as const, icon: Dumbbell, label: "Workout" },
    { id: "cardio" as const, icon: Timer, label: "Cardio" },
    { id: "weight" as const, icon: Scale, label: "Weight" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Fitness" subtitle="Move a little every day." />

      <WeekCard activeDates={activeDates} manualToday={manualToday} />

      {logging === null ? (
        <div className="grid grid-cols-3 gap-3">
          {quickLog.map((q) => (
            <button
              key={q.id}
              onClick={() => setLogging(q.id)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface py-4 transition-colors hover:border-accent-soft"
            >
              <span className="rounded-xl bg-accent-soft p-2 text-accent">
                <q.icon size={18} />
              </span>
              <span className="text-xs font-medium">Log {q.label.toLowerCase()}</span>
            </button>
          ))}
        </div>
      ) : logging === "workout" ? (
        <LogWorkoutForm routines={routines ?? []} onDone={() => setLogging(null)} />
      ) : logging === "cardio" ? (
        <LogCardioForm onDone={() => setLogging(null)} />
      ) : (
        <LogWeightForm onDone={() => setLogging(null)} />
      )}

      <WeightCard measurements={measurements ?? []} />
      <BestsCard workouts={workouts ?? []} />
      <RoutinesSection routines={routines ?? []} />
      <History workouts={workouts ?? []} cardio={cardio ?? []} />
    </div>
  );
}
