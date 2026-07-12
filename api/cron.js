import webpush from "web-push";
import { redis } from "./_store.js";

// Called every few minutes by an external scheduler (e.g. cron-job.org).
// Sends any reminders that have come due and prunes what was sent.
// Safe to call repeatedly: sent reminders are removed before responding,
// and reminders more than 30 minutes overdue are dropped, not sent late.
export default async function handler(req, res) {
  const r = redis();
  if (!r) return res.status(503).json({ error: "storage-not-configured" });

  const secret = process.env.CRON_SECRET;
  if (secret && req.query?.secret !== secret)
    return res.status(401).json({ error: "unauthorized" });

  const keys = await r.get("vapid");
  if (!keys) return res.status(200).json({ ok: true, sent: 0, note: "no-vapid-yet" });
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:liamfiggett@gmail.com",
    keys.publicKey,
    keys.privateKey
  );

  const now = Date.now();
  const GRACE = 30 * 60_000;
  let devices = 0;
  let sent = 0;
  const errors = [];
  let cursor = "0";
  do {
    const [next, batch] = await r.scan(cursor, { match: "device:*", count: 100 });
    cursor = String(next);
    for (const key of batch) {
      const rec = await r.get(key);
      if (!rec?.subscription) continue;
      devices++;
      const all = Array.isArray(rec.reminders) ? rec.reminders : [];
      const due = all.filter((x) => x.at <= now && x.at > now - GRACE);
      const keep = all.filter((x) => x.at > now);
      if (due.length === 0 && keep.length === all.length) continue;

      let gone = false;
      for (const item of due) {
        try {
          await webpush.sendNotification(
            rec.subscription,
            JSON.stringify({
              title: item.title,
              body: item.body,
              tag: item.id,
              url: item.url || "/#/calendar",
            })
          );
          sent++;
        } catch (err) {
          // 404/410 mean the subscription no longer exists on the push service
          if (err.statusCode === 404 || err.statusCode === 410) {
            gone = true;
            break;
          }
          // transient failure — keep it (within grace) to retry next run
          keep.push(item);
          if (errors.length < 3) errors.push(String(err.message || err));
        }
      }
      if (gone) await r.del(key);
      else
        await r.set(key, {
          subscription: rec.subscription,
          reminders: keep,
          userId: rec.userId,
        });
    }
  } while (cursor !== "0");

  const out = { ok: true, devices, sent };
  if (errors.length) out.errors = errors;
  return res.status(200).json(out);
}
