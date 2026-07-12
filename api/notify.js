import webpush from "web-push";
import { redis } from "./_store.js";

// Household activity pushes: a registered device asks us to notify the
// devices of specific other users, immediately. The sender must be a known
// device (unguessable uuid) and is never notified itself.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const r = redis();
  if (!r) return res.status(503).json({ error: "storage-not-configured" });

  const { fromDeviceId, toUsers, title, body, url } = req.body ?? {};
  if (
    typeof fromDeviceId !== "string" ||
    !fromDeviceId ||
    !Array.isArray(toUsers) ||
    typeof title !== "string" ||
    !title
  )
    return res.status(400).json({ error: "bad-request" });

  const sender = await r.get(`device:${fromDeviceId}`);
  if (!sender) return res.status(401).json({ error: "unknown-sender" });

  const keys = await r.get("vapid");
  if (!keys) return res.status(200).json({ ok: true, sent: 0 });
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:liamfiggett@gmail.com",
    keys.publicKey,
    keys.privateKey
  );

  const targets = new Set(
    toUsers.slice(0, 10).map((u) => String(u).toLowerCase())
  );
  const payload = JSON.stringify({
    title: String(title).slice(0, 120),
    body: String(body ?? "").slice(0, 160),
    tag: `hh-${Date.now()}`,
    url: typeof url === "string" && url.startsWith("/") ? url.slice(0, 64) : "/",
  });

  let sent = 0;
  let cursor = "0";
  do {
    const [next, batch] = await r.scan(cursor, { match: "device:*", count: 100 });
    cursor = String(next);
    for (const key of batch) {
      if (key === `device:${fromDeviceId}`) continue; // never ping the doer
      const rec = await r.get(key);
      if (!rec?.subscription || !rec.userId || !targets.has(rec.userId)) continue;
      try {
        await webpush.sendNotification(rec.subscription, payload);
        sent++;
      } catch (err) {
        // subscription no longer exists on the push service
        if (err.statusCode === 404 || err.statusCode === 410) await r.del(key);
      }
    }
  } while (cursor !== "0");

  return res.status(200).json({ ok: true, sent });
}
