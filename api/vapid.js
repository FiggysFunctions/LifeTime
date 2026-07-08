import webpush from "web-push";
import { redis } from "./_store.js";

// Returns the public push key, generating the pair on first call.
// Keys live in Redis so there is nothing to configure by hand.
export default async function handler(req, res) {
  const r = redis();
  if (!r) return res.status(503).json({ error: "storage-not-configured" });

  let keys = await r.get("vapid");
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    await r.set("vapid", keys);
  }
  res.setHeader("cache-control", "no-store");
  return res.status(200).json({ publicKey: keys.publicKey });
}
