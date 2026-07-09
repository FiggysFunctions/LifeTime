import { useRef, useState } from "react";
import { Sun, Moon, MonitorSmartphone, Download, Upload, BellRing } from "lucide-react";
import db from "../db";
import { useSettings, ACCENTS, CURRENCIES, type ThemeMode } from "../settings";
import { exportBackup, importBackup } from "../backup";
import {
  reminderStatus,
  enableReminders,
  disableReminders,
  type ReminderStatus,
} from "../reminders";
import { PageHeader, Card, Button } from "../components/ui";

function RemindersCard() {
  const [status, setStatus] = useState<ReminderStatus>(reminderStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          Everything is stored on this device only — nothing is sent anywhere
          (reminders, if turned on, share just their titles and times).
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
        Lifetime v0.6 · Lists, Tasks, Calendar, Budget & Fitness
      </p>
    </div>
  );
}
