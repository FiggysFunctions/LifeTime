import { redis } from "./_store.js";
import { cleanNag, mergeNag } from "./_nag.js";

// Stores (or removes) a device's push subscription and its upcoming
// reminders. The app re-uploads on every launch and event change.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const r = redis();
  if (!r) return res.status(503).json({ error: "storage-not-configured" });

  const {
    deviceId,
    subscription,
    reminders,
    remove,
    userId,
    nag,
    nagStop,
    resetLogged,
  } = req.body ?? {};
  if (typeof deviceId !== "string" || !deviceId || deviceId.length > 64)
    return res.status(400).json({ error: "bad-request" });
  const key = `device:${deviceId}`;
  const cleanUser =
    typeof userId === "string" && userId
      ? userId.toLowerCase().slice(0, 120)
      : undefined;

  // Push-up nudges belong to the account, not the device, so logging on one
  // device silences them on all of that person's devices — and nobody else's.
  // A device with no challenge simply sends no `nag`, which changes nothing:
  // only an explicit stop ends them.
  const nagOwner = cleanUser ?? key;
  if (nagStop) {
    await r.del(`nag:${nagOwner}`);
    return res.status(200).json({ ok: true });
  }

  if (remove) {
    await r.del(key);
    return res.status(200).json({ ok: true });
  }

  if (!subscription?.endpoint || !Array.isArray(reminders))
    return res.status(400).json({ error: "bad-request" });

  const clean = reminders
    .slice(0, 200)
    .map((x) => ({
      id: String(x.id).slice(0, 80),
      title: String(x.title ?? "Reminder").slice(0, 120),
      body: String(x.body ?? "").slice(0, 120),
      at: Number(x.at),
      // in-app path only (e.g. "/#/budget") — anything else is dropped
      url:
        typeof x.url === "string" && x.url.startsWith("/")
          ? x.url.slice(0, 64)
          : undefined,
    }))
    .filter((x) => Number.isFinite(x.at));

  await r.set(key, {
    subscription,
    reminders: clean,
    // which household account this device belongs to (for /api/notify)
    userId: cleanUser,
  });

  const incoming = cleanNag(nag);
  if (incoming) {
    const nagKey = `nag:${nagOwner}`;
    const existing = await r.get(nagKey);
    await r.set(nagKey, mergeNag(existing, incoming, !!resetLogged));
    // signed in since it was first set up: don't leave a device-keyed twin
    if (cleanUser) await r.del(`nag:${key}`);
  }
  return res.status(200).json({ ok: true, count: clean.length });
}
