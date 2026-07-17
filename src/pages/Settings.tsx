import { useRef, useState } from "react";
import {
  Sun,
  Moon,
  MonitorSmartphone,
  Download,
  Upload,
  BellRing,
  Cloud,
  Users,
} from "lucide-react";
import { useObservable, useLiveQuery } from "dexie-react-hooks";
import db from "../db";
import { DEXIE_CLOUD_URL } from "../sync-config";
import {
  getHouseholdRealmId,
  createHousehold,
  moveSharedModulesToHousehold,
} from "../household";
import { useSettings, ACCENTS, CURRENCIES, type ThemeMode } from "../settings";
import { exportBackup, importBackup } from "../backup";
import {
  reminderStatus,
  enableReminders,
  disableReminders,
  syncReminders,
  type ReminderStatus,
} from "../reminders";
import { PageHeader, Card, Button } from "../components/ui";

const SYNC_PHRASES: Record<string, string> = {
  "in-sync": "All changes synced ✓",
  pushing: "Syncing…",
  pulling: "Syncing…",
  initial: "Connecting…",
  offline: "Offline — will catch up when you're back online",
  error: "Sync hit a problem — it will keep retrying",
};

function SyncCardInner() {
  const user = useObservable(db.cloud.currentUser);
  const syncState = useObservable(db.cloud.syncState);
  const loggedIn = !!user?.isLoggedIn;

  return (
    <Card>
      <p className="flex items-center gap-2 text-sm font-medium">
        <Cloud size={15} className="text-accent" /> Sync
      </p>
      {loggedIn ? (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Signed in as <strong>{user?.email ?? user?.userId}</strong>. Your
            data syncs automatically between every device signed in with this
            email.
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {SYNC_PHRASES[syncState?.phase ?? "initial"] ?? syncState?.phase}
          </p>
          <div className="mt-3">
            <Button variant="ghost" onClick={() => db.cloud.logout()}>
              Sign out
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Signing out is safe — your data stays in the cloud and returns
            when you sign back in.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Use Lifetime on more than one device, and keep everything safe if
            this one is lost. Enter your email, type the code it sends you —
            that's the whole login. Everything already on this device comes
            with you.
          </p>
          <div className="mt-3">
            <Button onClick={() => db.cloud.login()}>Turn on sync</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function HouseholdCard() {
  const user = useObservable(db.cloud.currentUser);
  const loggedIn = !!user?.isLoggedIn;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const household = useLiveQuery(
    async () => {
      const rid = await getHouseholdRealmId();
      if (!rid) return null;
      const members = await db.members.where("realmId").equals(rid).toArray();
      return { rid, members };
    },
    [],
    null
  );

  const invite = async () => {
    const e = email.trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(e)) {
      setMsg("That doesn't look like an email address.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await createHousehold(e);
      setMsg(`Invite sent to ${e} — they accept from the email, then sign into Lifetime with that address.`);
      setEmail("");
    } catch {
      setMsg("Couldn't send the invite — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <p className="flex items-center gap-2 text-sm font-medium">
        <Users size={15} className="text-accent" /> Household
      </p>
      {!loggedIn ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Share the calendar, meal planning and chosen lists with your other
          half. Turn on sync above first — sharing rides on it.
        </p>
      ) : household ? (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Your calendar, meals and any lists you share are visible to
            everyone in the household. Tasks, budget, fitness and habits stay
            personal.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {household.members.map((m) => (
              <li
                key={m.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{m.email}</span>
                <span className="shrink-0 text-xs text-muted">
                  {m.accepted ? "member" : "invited"}
                </span>
              </li>
            ))}
            {household.members.length === 0 && (
              <li className="text-sm text-muted">Just you so far.</li>
            )}
          </ul>
          <div className="mt-3 flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invite()}
              placeholder="Invite by email"
              inputMode="email"
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
            <Button onClick={invite}>{busy ? "Sending…" : "Invite"}</Button>
          </div>
          <button
            onClick={async () => {
              await moveSharedModulesToHousehold(household.rid);
              setMsg("Your calendar and meals are now in the household. ✓");
            }}
            className="mt-2.5 text-xs text-muted underline-offset-2 hover:underline"
          >
            Merge my calendar & meals into the household
          </button>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Share with your other half: one calendar, one meal plan, and any
            shopping lists you choose — updated live on both phones. Tasks,
            budget, fitness and habits stay personal. Enter their email to
            set it up (the free plan covers 3 people).
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invite()}
              placeholder="their@email.com"
              inputMode="email"
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
            <Button onClick={invite}>
              {busy ? "Setting up…" : "Create household"}
            </Button>
          </div>
        </>
      )}
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </Card>
  );
}

function SyncCard() {
  if (!DEXIE_CLOUD_URL)
    return (
      <Card>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Cloud size={15} className="text-accent" /> Sync
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Cross-device sync isn't switched on in this version yet — your data
          stays on this device (use Backup below to move or protect it).
        </p>
      </Card>
    );
  return <SyncCardInner />;
}

function RemindersCard() {
  const { settings, update } = useSettings();
  const [status, setStatus] = useState<ReminderStatus>(reminderStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const digestOn = settings.weeklyDigest !== false;

  const turnOn = async () => {
    setBusy(true);
    setError("");
    try {
      await enableReminders();
    } catch (err) {
      setError(
        err instanceof Error && err.message === "server-not-ready"
          ? "The reminder server isn't set up yet — see the README for the two free add-ons it needs."
          : "Notifications were blocked. Allow them for Lifetime in your browser or phone settings, then try again."
      );
    } finally {
      setBusy(false);
      setStatus(reminderStatus());
    }
  };

  const turnOff = async () => {
    setBusy(true);
    await disableReminders();
    setBusy(false);
    setStatus(reminderStatus());
  };

  return (
    <Card>
      <p className="flex items-center gap-2 text-sm font-medium">
        <BellRing size={15} className="text-accent" /> Reminders
      </p>
      {status === "unsupported" ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Notifications aren't available here. On iPhone, add Lifetime to your
          Home Screen first (Share → Add to Home Screen), then turn reminders
          on inside the installed app.
        </p>
      ) : status === "denied" ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Notifications are blocked for Lifetime. Allow them in your browser or
          phone settings, then come back here.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {status === "on"
              ? "Reminders are on for this device: calendar events at the time you choose, and bills at 9am the day before they're due — even when the app is closed."
              : "Get notified about calendar events at the time you choose, and bills at 9am the day before they're due. Only reminder titles, amounts and times leave this device — never your lists, tasks or spending history."}
          </p>
          <div className="mt-3">
            {status === "on" ? (
              <Button variant="ghost" onClick={turnOff}>
                {busy ? "Turning off…" : "Turn off reminders"}
              </Button>
            ) : (
              <Button onClick={turnOn}>
                {busy ? "Turning on…" : "Turn on reminders"}
              </Button>
            )}
          </div>
          {status === "on" && (
            <button
              onClick={() => {
                update({ weeklyDigest: !digestOn });
                syncReminders();
              }}
              className="mt-2.5 flex items-center gap-2 text-xs text-muted underline-offset-2 hover:underline"
            >
              <span
                className={`grid h-4 w-4 place-items-center rounded ${
                  digestOn ? "bg-accent text-white dark:text-bg" : "border border-line"
                }`}
              >
                {digestOn && "✓"}
              </span>
              Sunday 6pm weekly digest (week's spending, activity & what's
              ahead)
            </button>
          )}
          {error && (
            <p className="mt-2 text-sm text-red-500 dark:text-red-400">
              {error}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

const MODES: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "Auto", icon: MonitorSmartphone },
];

export default function Settings() {
  const { settings, update } = useSettings();
  const [confirmErase, setConfirmErase] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const [pendingRestore, setPendingRestore] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const restore = async () => {
    if (!pendingRestore) return;
    try {
      const count = await importBackup(pendingRestore);
      setBackupMsg(`Restored ${count} items — reloading…`);
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setBackupMsg("That file doesn't look like a Lifetime backup.");
    } finally {
      setPendingRestore(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const eraseAll = async () => {
    await Promise.all(
      db.tables.map((t) => t.clear()) // every store, including future ones
    );
    setConfirmErase(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Make Lifetime yours." />

      <Card>
        <p className="mb-2 text-sm font-medium">Your name</p>
        <input
          value={settings.name === "friend" ? "" : settings.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Used in your greeting"
          className="w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium">Appearance</p>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => update({ theme: m.id })}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors ${
                settings.theme === m.id
                  ? "border-accent-soft bg-accent-soft text-accent"
                  : "border-line text-muted hover:bg-surface-2"
              }`}
            >
              <m.icon size={18} />
              {m.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium">Accent colour</p>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => update({ accent: a.id })}
              aria-label={a.label}
              title={a.label}
              className={`h-9 w-9 rounded-full transition-transform active:scale-90 ${
                settings.accent === a.id
                  ? "ring-2 ring-ink ring-offset-2 ring-offset-surface"
                  : ""
              }`}
              style={{ backgroundColor: a.swatch }}
            />
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium">Units</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "metric", label: "Metric", sub: "kg · km" },
              { id: "imperial", label: "Imperial", sub: "lb · mi" },
            ] as const
          ).map((u) => (
            <button
              key={u.id}
              onClick={() => update({ units: u.id })}
              className={`rounded-xl border px-3 py-3 text-xs font-medium transition-colors ${
                settings.units === u.id
                  ? "border-accent-soft bg-accent-soft text-accent"
                  : "border-line text-muted hover:bg-surface-2"
              }`}
            >
              {u.label}
              <span className="mt-0.5 block font-normal opacity-75">{u.sub}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium">Currency</p>
        <div className="flex flex-wrap gap-2">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => update({ currency: c })}
              className={`h-10 w-12 rounded-xl border text-sm font-semibold transition-colors ${
                settings.currency === c
                  ? "border-accent-soft bg-accent-soft text-accent"
                  : "border-line text-muted hover:bg-surface-2"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </Card>

      <SyncCard />

      <HouseholdCard />

      <RemindersCard />

      <Card>
        <p className="text-sm font-medium">Backup</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Save everything to a file you control. Move it to another device (or
          keep it safe) and restore it there — restoring replaces what's on the
          device.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => exportBackup()}>
            <span className="flex items-center gap-1.5">
              <Download size={15} /> Download backup
            </span>
          </Button>
          <Button variant="ghost" onClick={() => fileInput.current?.click()}>
            <span className="flex items-center gap-1.5">
              <Upload size={15} /> Restore from backup
            </span>
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              setBackupMsg("");
              setPendingRestore(e.target.files?.[0] ?? null);
            }}
          />
        </div>
        {pendingRestore && (
          <div className="mt-3 rounded-xl border border-red-400/40 p-3">
            <p className="text-sm">
              Replace everything on this device with{" "}
              <strong>{pendingRestore.name}</strong>?
            </p>
            <div className="mt-2.5 flex gap-2">
              <Button variant="danger" onClick={restore}>
                Yes, restore
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPendingRestore(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {backupMsg && <p className="mt-2 text-sm text-muted">{backupMsg}</p>}
      </Card>

      <Card>
        <p className="text-sm font-medium">Your data</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Your data lives on this device (plus, if you turn on sync, in your
          own synced account). Reminders, if enabled, share just their titles
          and times.
        </p>
        <div className="mt-3">
          {confirmErase ? (
            <div className="flex gap-2">
              <Button variant="danger" onClick={eraseAll}>
                Yes, erase everything
              </Button>
              <Button variant="ghost" onClick={() => setConfirmErase(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmErase(true)}>
              Erase all data
            </Button>
          )}
        </div>
      </Card>

      <p className="pt-2 text-center text-xs text-muted">
        Lifetime v1.1 · your whole life, one app
      </p>
    </div>
  );
}
