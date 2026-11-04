import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, BellRing, Check, ChevronRight, Dumbbell, Pencil, X } from "lucide-react";
import db, { type PushupChallenge, type PushupLog } from "../db";
import { addDays, dueLabel, timeLabel, todayStr } from "../dates";
import { celebrate } from "../confetti";
import {
  enableReminders,
  reminderStatus,
  sendTestNudge,
  type ReminderStatus,
} from "../reminders";
import {
  computeStats,
  daysBetween,
  deleteLog,
  endChallenge,
  logsByDate,
  parseReps,
  rollingAverage,
  saveLog,
  startChallenge,
  totalDays,
  updateSchedule,
  yearEnd,
} from "../pushups";
import { Button, Card, Chip } from "../components/ui";

const inputCls =
  "rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent";

const startsLabel = (date: string) => {
  const label = dueLabel(date);
  return label === "Today" || label === "Tomorrow"
    ? `Starts ${label.toLowerCase()}`
    : `Starts ${label}`;
};

// The newest challenge that hasn't finished, else the newest finished one.
function pickChallenge(all: PushupChallenge[], today: string) {
  const sorted = [...all].sort((a, b) => b.createdAt - a.createdAt);
  return sorted.find((c) => c.endDate >= today) ?? sorted[0];
}

function useChallenge() {
  const today = todayStr();
  const challenges = useLiveQuery(() => db.pushupChallenges.toArray(), []);
  const logs = useLiveQuery(() => db.pushupLogs.toArray(), []);
  return {
    loading: challenges === undefined || logs === undefined,
    challenge: pickChallenge(challenges ?? [], today),
    logs: logs ?? [],
    today,
  };
}

function RepsEntry({
  initial,
  onSave,
  saveLabel = "Log",
  autoFocus,
}: {
  initial?: number;
  onSave: (reps: number) => void;
  saveLabel?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(initial === undefined ? "" : String(initial));
  const reps = parseReps(value);
  const submit = () => {
    if (reps !== null) onSave(reps);
  };
  return (
    <div className="flex gap-2">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Reps"
        inputMode="numeric"
        aria-label="Number of push-ups"
        className={`w-24 min-w-0 flex-1 ${inputCls}`}
      />
      <Button onClick={submit}>{saveLabel}</Button>
    </div>
  );
}

// The daily prompt, on the Home screen and at the top of Fitness. It renders
// nothing for anyone without a challenge when `quiet` is set.
export function PushupTodayCard({ quiet }: { quiet?: boolean }) {
  const { loading, challenge, logs, today } = useChallenge();
  if (loading) return null;

  if (!challenge) {
    if (quiet) return null;
    return (
      <Link
        to="/fitness/pushups"
        className="flex items-center gap-2 px-1 text-sm text-muted transition-colors hover:text-ink"
      >
        <Dumbbell size={15} /> Start a daily push-up challenge
        <ChevronRight size={15} />
      </Link>
    );
  }

  const stats = computeStats(challenge, logs, today);
  const total = totalDays(challenge);
  const todayLog = logsByDate(logs).get(today);

  const row = (title: string, sub: string) => (
    <Link to="/fitness/pushups" className="block">
      <Card className="flex items-center gap-3 transition-colors hover:border-accent-soft">
        <span className="shrink-0 rounded-xl bg-accent-soft p-2 text-accent">
          <Dumbbell size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted">{sub}</p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </Card>
    </Link>
  );

  if (today < challenge.startDate)
    return row("Push-up challenge", startsLabel(challenge.startDate));
  if (today > challenge.endDate) {
    if (quiet) return null;
    return row(
      "Push-up challenge finished",
      `${stats.loggedDays} of ${total} days · best ${stats.best?.reps ?? 0}`
    );
  }
  if (todayLog) {
    const isBest =
      todayLog.reps > 0 && stats.loggedDays > 1 && stats.best?.date === today;
    return row(
      todayLog.reps > 0 ? `${todayLog.reps} push-ups today` : "Skipped today",
      `Day ${stats.dayNumber} of ${total}${isBest ? " · new personal best 🎉" : ""}`
    );
  }

  return (
    <Card className="border-accent-soft">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Push-ups: day {stats.dayNumber} of {total}</p>
          <p className="text-xs text-muted">
            One set to failure, then log your reps.
            {stats.best ? ` Your best is ${stats.best.reps}.` : ""}
          </p>
        </div>
        <Link
          to="/fitness/pushups"
          aria-label="See push-up progress"
          className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ChevronRight size={18} />
        </Link>
      </div>
      <RepsEntry
        onSave={async (reps) => {
          await saveLog(today, reps);
          if (reps > 0) celebrate();
        }}
      />
    </Card>
  );
}

// ---- chart ----

function niceScale(max: number) {
  const floor = Math.max(max, 10);
  const step =
    [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(
      (s) => Math.ceil(floor / s) <= 4
    ) ?? 2000;
  const top = Math.ceil(floor / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

const shortDate = (d: string, withYear = false) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
};

const monthLabel = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short" });
};

const PAD = { left: 30, right: 32, top: 10, bottom: 24 };
const CHART_HEIGHT = 210;

function RepsChart({
  logs,
  from,
  to,
  today,
}: {
  logs: PushupLog[];
  from: string;
  to: string;
  today: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 320);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byDate = logsByDate(logs);
  const count = daysBetween(from, to) + 1;
  const days = Array.from({ length: count }, (_, i) => addDays(from, i));
  const lastIndex = Math.min(daysBetween(from, today), count - 1);

  const reps = days.map((d) => {
    const r = byDate.get(d)?.reps ?? 0;
    return r > 0 ? r : null;
  });
  const avg = days.map((d, i) => (i <= lastIndex ? rollingAverage(byDate, d) : null));
  const hasAvg = avg.some((v) => v !== null);

  const { top, ticks } = niceScale(
    Math.max(0, ...reps.map((v) => v ?? 0), ...avg.map((v) => v ?? 0))
  );
  const plotW = Math.max(width - PAD.left - PAD.right, 50);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / Math.max(count - 1, 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  // missed days break the line rather than being joined over
  const path = (series: (number | null)[]) => {
    let d = "";
    let drawing = false;
    series.forEach((v, i) => {
      if (v === null) {
        drawing = false;
        return;
      }
      d += `${drawing ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      drawing = true;
    });
    return d;
  };

  const showAllDots = count <= 45;
  const dots = reps
    .map((v, i) => ({ v, i }))
    .filter(
      ({ v, i }) =>
        v !== null && (showAllDots || (reps[i - 1] == null && reps[i + 1] == null))
    );

  const labelEvery = Math.max(Math.round((count - 1) / 3), 1);
  const xTicks = days
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % labelEvery === 0 && i + labelEvery / 2 < count);

  const lastAvgIndex = (() => {
    for (let i = lastIndex; i >= 0; i--) if (avg[i] !== null) return i;
    return -1;
  })();

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - PAD.left) / plotW) * (count - 1));
    setSel(Math.min(Math.max(i, 0), lastIndex));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const start = sel ?? lastIndex;
    const next = start + (e.key === "ArrowLeft" ? -1 : 1);
    setSel(Math.min(Math.max(next, 0), lastIndex));
  };

  const tipW = 136;
  const tipLeft =
    sel === null ? 0 : Math.min(Math.max(x(sel) - tipW / 2, 0), width - tipW);

  const best = Math.max(0, ...reps.map((v) => v ?? 0));
  const summary =
    best > 0
      ? `Push-ups per day from ${shortDate(from)} to ${shortDate(to)}. Highest in this range: ${best}. Every value is listed in the history below.`
      : "No push-ups logged in this range yet.";

  return (
    <Card>
      <p className="text-sm font-medium">Reps over time</p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "var(--muted)" }}
          />
          Daily reps
        </span>
        {hasAvg && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded-full"
              style={{ background: "var(--accent)" }}
            />
            7-day average
          </span>
        )}
      </div>

      <div
        ref={boxRef}
        tabIndex={0}
        role="img"
        aria-label={summary}
        onPointerDown={pick}
        onPointerMove={pick}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setSel(null);
        }}
        onFocus={() => setSel((s) => s ?? lastIndex)}
        onBlur={() => setSel(null)}
        onKeyDown={onKey}
        className="relative mt-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        style={{ touchAction: "pan-y", height: CHART_HEIGHT }}
      >
        <svg width={width} height={CHART_HEIGHT} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--line)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize="11"
                fill="var(--muted)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {t}
              </text>
            </g>
          ))}
          {xTicks.map(({ d, i }) => (
            <text
              key={d}
              x={x(i)}
              y={CHART_HEIGHT - 6}
              textAnchor={i === 0 ? "start" : "middle"}
              fontSize="11"
              fill="var(--muted)"
            >
              {count > 120 ? monthLabel(d) : shortDate(d)}
            </text>
          ))}

          <path
            d={path(reps)}
            fill="none"
            stroke="var(--muted)"
            strokeOpacity="0.5"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {dots.map(({ v, i }) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(v!)}
              r="4"
              fill="var(--muted)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          ))}

          {hasAvg && (
            <path
              d={path(avg)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {lastAvgIndex >= 0 && (
            <>
              <circle
                cx={x(lastAvgIndex)}
                cy={y(avg[lastAvgIndex]!)}
                r="4"
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
              <text
                x={x(lastAvgIndex) + 8}
                y={y(avg[lastAvgIndex]!) + 4}
                fontSize="12"
                fontWeight="600"
                fill="var(--ink)"
              >
                {Math.round(avg[lastAvgIndex]!)}
              </text>
            </>
          )}

          {sel !== null && (
            <line
              x1={x(sel)}
              x2={x(sel)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--muted)"
              strokeWidth="1"
            />
          )}
        </svg>

        {sel !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: tipLeft, width: tipW }}
          >
            <p className="text-muted">{shortDate(days[sel])}</p>
            <p>
              <span className="font-semibold">{reps[sel] ?? "–"}</span>{" "}
              <span className="text-muted">
                {reps[sel] !== null
                  ? "reps"
                  : byDate.has(days[sel])
                    ? "skipped"
                    : "not logged"}
              </span>
            </p>
            {avg[sel] !== null && (
              <p>
                <span className="font-semibold">{Math.round(avg[sel]!)}</span>{" "}
                <span className="text-muted">7-day avg</span>
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---- history (also the chart's table view) ----

function HistoryRow({
  date,
  log,
  isToday,
}: {
  date: string;
  log?: PushupLog;
  isToday: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing)
    return (
      <li className="rounded-xl border border-accent-soft bg-surface px-3.5 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm">{dueLabel(date)}</p>
          <button
            onClick={() => setEditing(false)}
            aria-label="Cancel"
            className="p-1 text-muted hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        <RepsEntry
          autoFocus
          initial={log?.reps}
          saveLabel="Save"
          onSave={async (reps) => {
            await saveLog(date, reps);
            setEditing(false);
          }}
        />
        {log && (
          <button
            onClick={async () => {
              await deleteLog(date);
              setEditing(false);
            }}
            className="mt-2 text-xs text-muted underline-offset-2 hover:text-red-500 hover:underline"
          >
            Remove this entry
          </button>
        )}
      </li>
    );

  return (
    <li>
      <button
        onClick={() => setEditing(true)}
        aria-label={`${log ? "Edit" : "Log"} ${dueLabel(date)}`}
        className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-accent-soft"
      >
        <span className="min-w-0 flex-1 truncate text-sm">{dueLabel(date)}</span>
        {log ? (
          <span
            className={`text-sm font-medium ${log.reps === 0 ? "text-muted" : ""}`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {log.reps === 0 ? "Skipped" : log.reps}
          </span>
        ) : (
          <span className="text-xs text-muted">
            {isToday ? "Not logged yet" : "Missed: tap to add"}
          </span>
        )}
        <Pencil size={13} className="shrink-0 text-muted" />
      </button>
    </li>
  );
}

// ---- reminder settings ----

function RemindersCard({ challenge }: { challenge: PushupChallenge }) {
  const [status, setStatus] = useState<ReminderStatus>(reminderStatus);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const turnOn = async () => {
    setBusy(true);
    setMessage("");
    try {
      await enableReminders();
    } catch {
      setMessage("Couldn't turn notifications on. Check your phone's settings for Lifetime.");
    }
    setStatus(reminderStatus());
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    setMessage("");
    const ok = await sendTestNudge();
    setMessage(
      ok
        ? "Sent. It should appear on this device in a few seconds."
        : "That didn't send. Check your connection and try again."
    );
    setBusy(false);
  };

  const setTime = (field: "remindFrom" | "remindTo", value: string) => {
    const from = field === "remindFrom" ? value : challenge.remindFrom;
    const to = field === "remindTo" ? value : challenge.remindTo;
    if (!value) return;
    if (from >= to) {
      setMessage("The last nudge has to be later than the first.");
      return;
    }
    setMessage("");
    updateSchedule(challenge.id, { [field]: value });
  };

  return (
    <Card>
      <p className="flex items-center gap-2 text-sm font-medium">
        <BellRing size={15} className="text-accent" /> Nudges
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Every {challenge.remindEveryMins / 60 === 1 ? "hour" : `${challenge.remindEveryMins / 60} hours`}{" "}
        from {timeLabel(challenge.remindFrom)} to {timeLabel(challenge.remindTo)} until
        you log. They only go to devices signed in as you, with notifications on.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          First
          <input
            type="time"
            value={challenge.remindFrom}
            onChange={(e) => setTime("remindFrom", e.target.value)}
            className={`px-2 py-1.5 text-xs ${inputCls}`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Last
          <input
            type="time"
            value={challenge.remindTo}
            onChange={(e) => setTime("remindTo", e.target.value)}
            className={`px-2 py-1.5 text-xs ${inputCls}`}
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[
          { mins: 60, label: "Every hour" },
          { mins: 120, label: "Every 2 hours" },
          { mins: 180, label: "Every 3 hours" },
        ].map((o) => (
          <Chip
            key={o.mins}
            active={challenge.remindEveryMins === o.mins}
            onClick={() => updateSchedule(challenge.id, { remindEveryMins: o.mins })}
          >
            {o.label}
          </Chip>
        ))}
      </div>

      <div className="mt-3">
        {status === "on" ? (
          <Button variant="ghost" onClick={test}>
            {busy ? "Sending…" : "Send a test nudge to this device"}
          </Button>
        ) : status === "off" ? (
          <>
            <p className="mb-2 text-sm font-medium text-red-500 dark:text-red-400">
              Notifications are off on this device, so no nudges will arrive here.
            </p>
            <Button onClick={turnOn}>{busy ? "Turning on…" : "Turn on notifications"}</Button>
          </>
        ) : (
          <p className="text-sm font-medium text-red-500 dark:text-red-400">
            {status === "denied"
              ? "Notifications are blocked for Lifetime. Allow them in your phone's settings to get nudges here."
              : "This browser can't receive notifications. Open Lifetime from your home screen."}
          </p>
        )}
      </div>
      {message && <p className="mt-2 text-sm text-muted">{message}</p>}
    </Card>
  );
}

// ---- start screen ----

function StartForm({ today }: { today: string }) {
  const tomorrow = addDays(today, 1);
  const [start, setStart] = useState(tomorrow);
  const [status, setStatus] = useState<ReminderStatus>(reminderStatus);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(start);

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-medium">A year of daily push-ups</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Once a day, do one set to failure and log how many you got. You'll get
          nudged through the day until it's logged. Nobody else in your household
          sees it or gets the notifications.
        </p>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          First day
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={start === today} onClick={() => setStart(today)}>
            Today
          </Chip>
          <Chip active={start === tomorrow} onClick={() => setStart(tomorrow)}>
            Tomorrow
          </Chip>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-label="First day of the challenge"
            className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted outline-none focus:text-ink"
          />
        </div>
        {valid && (
          <p className="mt-2 text-xs text-muted">
            Runs {shortDate(start, true)} to {shortDate(yearEnd(start), true)}.
          </p>
        )}
      </div>
      <Button
        onClick={async () => {
          if (!valid) return;
          if (status === "off") {
            try {
              await enableReminders();
            } catch {
              // the reminders card explains how to fix this after starting
            }
            setStatus(reminderStatus());
          }
          await startChallenge(start);
        }}
      >
        Start the challenge
      </Button>
    </Card>
  );
}

// ---- page ----

const RANGES = [
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "all", label: "Whole year", days: 0 },
];

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </Card>
  );
}

function ChallengeView({
  challenge,
  logs,
  today,
}: {
  challenge: PushupChallenge;
  logs: PushupLog[];
  today: string;
}) {
  const [range, setRange] = useState("30");
  const [confirmEnd, setConfirmEnd] = useState(false);

  const inChallenge = logs.filter(
    (l) => l.date >= challenge.startDate && l.date <= challenge.endDate
  );
  const stats = computeStats(challenge, logs, today);
  const total = totalDays(challenge);
  const byDate = logsByDate(inChallenge);

  // Short ranges end today and always span at least a week; the whole-year
  // view shows the full run, so the empty stretch ahead is part of the picture.
  const lastDay = today < challenge.endDate ? today : challenge.endDate;
  const rangeDays = RANGES.find((r) => r.id === range)!.days;
  let from = challenge.startDate;
  let to = challenge.endDate;
  if (rangeDays > 0) {
    const windowStart = addDays(lastDay, -(rangeDays - 1));
    from = windowStart > challenge.startDate ? windowStart : challenge.startDate;
    const minEnd = addDays(from, 6);
    to = lastDay > minEnd ? lastDay : minEnd;
  }

  const historyDays: string[] = [];
  for (let d = lastDay; d >= from && d >= challenge.startDate; d = addDays(d, -1))
    historyDays.push(d);

  const started = today >= challenge.startDate;
  const progress = Math.min(stats.elapsedDays / total, 1) * 100;

  return (
    <div className="space-y-4">
      {/* the prompt only: once logged, today is already in the stats below */}
      {started && today <= challenge.endDate && !byDate.has(today) && (
        <PushupTodayCard />
      )}

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">
            {started
              ? `Day ${stats.dayNumber} of ${total}`
              : startsLabel(challenge.startDate)}
          </p>
          <p className="text-xs text-muted">
            {shortDate(challenge.startDate)} to {shortDate(challenge.endDate, true)}
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </Card>

      {started && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Personal best"
              value={stats.best ? String(stats.best.reps) : "–"}
              sub={stats.best ? shortDate(stats.best.date) : "Log your first set"}
            />
            <StatTile
              label="Current streak"
              value={`${stats.streak} ${stats.streak === 1 ? "day" : "days"}`}
              sub={`Longest ${stats.bestStreak}`}
            />
            <StatTile
              label="7-day average"
              value={stats.average === null ? "–" : String(Math.round(stats.average))}
              sub={stats.first ? `First set: ${stats.first.reps}` : "Needs 3 sets"}
            />
            <StatTile
              label="Total reps"
              value={stats.totalReps.toLocaleString()}
              sub={`${stats.loggedDays} of ${stats.elapsedDays} days done`}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <Chip key={r.id} active={range === r.id} onClick={() => setRange(r.id)}>
                {r.label}
              </Chip>
            ))}
          </div>

          <RepsChart logs={inChallenge} from={from} to={to} today={today} />

          <div>
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
              History
            </p>
            <ul className="space-y-2">
              {historyDays.map((d) => (
                <HistoryRow
                  key={d}
                  date={d}
                  log={byDate.get(d)}
                  isToday={d === today}
                />
              ))}
            </ul>
            <p className="mt-2 px-1 text-xs text-muted">
              Logging 0 counts as a skipped day: it stops that day's nudges but
              ends your streak.
            </p>
          </div>
        </>
      )}

      {today <= challenge.endDate && <RemindersCard challenge={challenge} />}

      {confirmEnd ? (
        <Card className="border-red-400/40">
          <p className="text-sm">
            End this challenge? The nudges stop. Your logged reps are kept.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" onClick={() => endChallenge(challenge.id)}>
              End challenge
            </Button>
            <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
              Keep going
            </Button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setConfirmEnd(true)}
          className="px-1 text-xs text-muted underline-offset-2 hover:underline"
        >
          End this challenge
        </button>
      )}
    </div>
  );
}

export default function Pushups() {
  const { loading, challenge, logs, today } = useChallenge();

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Link
          to="/fitness"
          aria-label="Back to Fitness"
          className="rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="flex min-w-0 flex-1 items-center gap-2 font-display text-xl font-semibold tracking-tight">
          Push-up challenge
          {challenge && logsByDate(logs).has(today) && (
            <Check size={18} className="text-accent" aria-label="Logged today" />
          )}
        </h1>
      </header>

      {!loading &&
        (challenge ? (
          <ChallengeView challenge={challenge} logs={logs} today={today} />
        ) : (
          <StartForm today={today} />
        ))}
    </div>
  );
}
