import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { X, Play, Pause, RotateCcw, Check, Plus } from "lucide-react";
import db, { now, type Task } from "./db";
import { completeTask } from "./actions";
import { celebrate } from "./confetti";

// Focus mode: one task, one big timer, nothing else on screen. The whole
// point is to make starting easy and to make time visible — so it lives
// above everything (fixed, top z-index) and the underlying app is hidden.

const Ctx = createContext<{ open: (task: Task | null) => void }>({
  open: () => {},
});

export const useFocus = () => useContext(Ctx);

const DURATIONS = [10, 25, 45]; // minutes
const RING = 2 * Math.PI * 52; // circumference for r=52

function FocusOverlay({ task, onClose }: { task: Task | null; onClose: () => void }) {
  // live task so subtask ticks and edits reflect immediately
  const live = useLiveQuery(
    () => (task ? db.tasks.get(task.id) : undefined),
    [task?.id]
  );
  const current = live ?? task ?? undefined;

  const [mins, setMins] = useState(25);
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [stepText, setStepText] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setRunning(false);
          setFinished(true);
          if (!doneRef.current) {
            doneRef.current = true;
            celebrate();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const pick = (m: number) => {
    setMins(m);
    setLeft(m * 60);
    setRunning(false);
    setFinished(false);
    doneRef.current = false;
  };

  const reset = () => {
    setLeft(mins * 60);
    setRunning(false);
    setFinished(false);
    doneRef.current = false;
  };

  const total = mins * 60;
  const progress = 1 - left / total;
  const mm = Math.floor(left / 60);
  const ss = left % 60;

  const steps = current?.steps ?? [];
  const toggleStep = (i: number) => {
    if (!current) return;
    const next = steps.map((s, j) => (j === i ? { ...s, done: !s.done } : s));
    if (next[i].done) celebrate();
    db.tasks.update(current.id, { steps: next, updatedAt: now() });
  };
  const addStep = () => {
    if (!current || !stepText.trim()) return;
    db.tasks.update(current.id, {
      steps: [...steps, { text: stepText.trim(), done: false }],
      updatedAt: now(),
    });
    setStepText("");
  };

  const finishTask = () => {
    if (current) {
      completeTask(current);
      celebrate();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg px-6 pb-8 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="flex justify-end">
        <button
          onClick={onClose}
          aria-label="Leave focus"
          className="rounded-full p-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X size={22} />
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6">
        <p className="text-center font-display text-xl font-semibold">
          {current ? current.title : "Focus session"}
        </p>

        {/* Timer ring */}
        <div className="relative grid place-items-center">
          <svg width="240" height="240" viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" strokeWidth="7" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={RING * progress}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="absolute text-center">
            <p className="font-display text-4xl font-semibold tabular-nums">
              {mm}:{String(ss).padStart(2, "0")}
            </p>
            {finished && (
              <p className="mt-1 text-sm font-medium text-accent">
                Time's up — nice work 🌿
              </p>
            )}
          </div>
        </div>

        {/* Duration picker (before starting) */}
        {!running && left === total && !finished && (
          <div className="flex gap-1.5">
            {DURATIONS.map((m) => (
              <button
                key={m}
                onClick={() => pick(m)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  mins === m
                    ? "bg-accent-soft text-accent ring-1 ring-accent/50"
                    : "bg-surface-2 text-muted hover:text-ink"
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          {!finished && (
            <button
              onClick={() => setRunning((r) => !r)}
              className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white dark:text-bg"
            >
              {running ? <Pause size={17} /> : <Play size={17} />}
              {running ? "Pause" : left === total ? "Start" : "Resume"}
            </button>
          )}
          {finished && (
            <button
              onClick={reset}
              className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white dark:text-bg"
            >
              <RotateCcw size={16} /> Another round
            </button>
          )}
          {!finished && left !== total && (
            <button
              onClick={reset}
              aria-label="Reset timer"
              className="rounded-full p-3 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <RotateCcw size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Subtasks + finish (only for a real task) */}
      {current && (
        <div className="mx-auto w-full max-w-sm space-y-2">
          {steps.length > 0 && (
            <ul className="space-y-1.5">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-3">
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
                  <span className={`text-sm ${s.done ? "text-muted line-through" : ""}`}>
                    {s.text}
                  </span>
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
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              onClick={addStep}
              aria-label="Add step"
              className="shrink-0 rounded-xl bg-accent-soft px-3 text-accent"
            >
              <Plus size={18} />
            </button>
          </div>
          <button
            onClick={finishTask}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white dark:text-bg"
          >
            Mark done 🎉
          </button>
        </div>
      )}
    </div>
  );
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [task, setTask] = useState<Task | null | undefined>(undefined);
  // undefined = closed; null = task-less session; Task = focusing a task
  return (
    <Ctx.Provider value={{ open: (t) => setTask(t) }}>
      {children}
      {task !== undefined && (
        <FocusOverlay task={task} onClose={() => setTask(undefined)} />
      )}
    </Ctx.Provider>
  );
}
