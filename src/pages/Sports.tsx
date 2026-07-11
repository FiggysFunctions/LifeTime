import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RefreshCw, Trophy, CalendarPlus, Check, Bell } from "lucide-react";
import db, { uid, now } from "../db";
import { toDateStr, todayStr, dueLabel, timeLabel } from "../dates";
import { syncReminders } from "../reminders";
import { getHouseholdRealmId } from "../household";
import { PageHeader, Button, Chip } from "../components/ui";

// Fixtures come from /api/fixtures, which only ever returns events that
// haven't started — no scores, no live states, no spoilers, by design.

interface Fixture {
  id: string;
  league: string;
  title: string;
  detail: string;
  start: number;
}

const LEAGUES = [
  { key: "NRL", emoji: "🏉" },
  { key: "NRLW", emoji: "🏉" },
  { key: "AFL", emoji: "🏈" },
  { key: "F1", emoji: "🏎️" },
  { key: "UFC", emoji: "🥊" },
];

const CACHE_KEY = "lifetime-sports-cache";
const TTL = 30 * 60_000;

function readCache(): { at: number; fixtures: Fixture[] } | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return Array.isArray(c?.fixtures) ? c : null;
  } catch {
    return null;
  }
}

const emojiFor = (l: string) => LEAGUES.find((x) => x.key === l)?.emoji ?? "🏆";

const localHHMM = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const localTime = (ms: number) => timeLabel(localHHMM(ms));

const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "No reminder" },
  { value: 0, label: "At kick-off" },
  { value: 10, label: "10 min before" },
  { value: 30, label: "30 min before" },
  { value: 60, label: "1 hr before" },
];

function FixtureRow({ f, inCalendar }: { f: Fixture; inCalendar: boolean }) {
  const [open, setOpen] = useState(false);
  const [reminder, setReminder] = useState<number | null>(30);

  const add = async () => {
    const d = new Date(f.start);
    await db.events.add({
      id: uid(),
      title: `${emojiFor(f.league)} ${f.title}`,
      date: toDateStr(d),
      time: localHHMM(f.start),
      reminderMins: reminder,
      realmId: await getHouseholdRealmId(),
      createdAt: now(),
      updatedAt: now(),
    });
    syncReminders();
    setOpen(false);
  };

  return (
    <li className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span className="text-lg">{emojiFor(f.league)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{f.title}</p>
          <p className="truncate text-xs text-muted">
            {f.league}
            {f.detail ? ` · ${f.detail}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium text-accent">
          {localTime(f.start)}
        </span>
        {inCalendar ? (
          <span
            title="In your calendar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
          >
            <Check size={15} strokeWidth={3} />
          </span>
        ) : (
          <button
            onClick={() => setOpen(!open)}
            aria-label={`Add ${f.title} to calendar`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent"
          >
            <CalendarPlus size={17} />
          </button>
        )}
      </div>
      {open && !inCalendar && (
        <div className="mt-2.5 border-t border-line pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Bell size={13} className="text-muted" />
            {REMINDER_OPTIONS.map((o) => (
              <Chip
                key={String(o.value)}
                active={reminder === o.value}
                onClick={() => setReminder(o.value)}
              >
                {o.label}
              </Chip>
            ))}
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button onClick={add}>Add to calendar</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function Sports() {
  const [fixtures, setFixtures] = useState<Fixture[] | null>(
    () => readCache()?.fixtures ?? null
  );
  const [fetchedAt, setFetchedAt] = useState(() => readCache()?.at ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const load = async (force = false) => {
    const cache = readCache();
    if (!force && cache && Date.now() - cache.at < TTL) {
      setFixtures(cache.fixtures);
      setFetchedAt(cache.at);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const r = await fetch("/api/fixtures");
      if (!r.ok) throw new Error("bad response");
      const data = await r.json();
      const rec = { at: Date.now(), fixtures: data.fixtures as Fixture[] };
      localStorage.setItem(CACHE_KEY, JSON.stringify(rec));
      setFixtures(rec.fixtures);
      setFetchedAt(rec.at);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // future calendar events, to mark fixtures that are already added
  const calEvents = useLiveQuery(
    () => db.events.filter((e) => e.date >= todayStr()).toArray(),
    [],
    []
  );
  const inCalendar = (f: Fixture) =>
    calEvents.some(
      (e) =>
        e.date === toDateStr(new Date(f.start)) && e.title.includes(f.title)
    );

  const nowMs = Date.now();
  const upcoming = (fixtures ?? []).filter(
    (f) => f.start > nowMs && (!filter || f.league === filter)
  );

  const groups: { date: string; items: Fixture[] }[] = [];
  for (const f of upcoming) {
    const d = toDateStr(new Date(f.start));
    const g = groups.find((x) => x.date === d);
    if (g) g.items.push(f);
    else groups.push({ date: d, items: [f] });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sports"
        subtitle="Upcoming fixtures — never a score in sight."
        action={
          <Button variant="ghost" onClick={() => load(true)}>
            <span className="flex items-center gap-1.5">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Refresh
            </span>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <Chip active={filter === null} onClick={() => setFilter(null)}>
          All
        </Chip>
        {LEAGUES.map((l) => (
          <Chip
            key={l.key}
            active={filter === l.key}
            onClick={() => setFilter(filter === l.key ? null : l.key)}
          >
            {l.emoji} {l.key}
          </Chip>
        ))}
      </div>

      {loading && fixtures === null && (
        <p className="py-10 text-center text-sm text-muted">
          Fetching fixtures…
        </p>
      )}

      {error && fixtures === null && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <div className="mb-3 rounded-2xl bg-accent-soft p-3 text-accent">
            <Trophy size={24} strokeWidth={1.75} />
          </div>
          <p className="text-sm text-muted">
            Couldn't fetch fixtures — check your connection and try again.
          </p>
          <div className="mt-4">
            <Button onClick={() => load(true)}>Retry</Button>
          </div>
        </div>
      )}

      {fixtures !== null && upcoming.length === 0 && !loading && (
        <p className="py-10 text-center text-sm text-muted">
          No upcoming fixtures{filter ? ` for ${filter}` : ""} right now.
        </p>
      )}

      {groups.map((g) => (
        <div key={g.date}>
          <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
            {dueLabel(g.date)}
          </p>
          <ul className="space-y-2">
            {g.items.map((f) => (
              <FixtureRow key={f.id} f={f} inCalendar={inCalendar(f)} />
            ))}
          </ul>
        </div>
      ))}

      {fixtures !== null && (
        <p className="pt-1 text-center text-xs text-muted">
          {fetchedAt > 0 &&
            `Updated ${Math.max(0, Math.round((Date.now() - fetchedAt) / 60_000))} min ago · `}
          times are local · games disappear once they kick off
        </p>
      )}
    </div>
  );
}
