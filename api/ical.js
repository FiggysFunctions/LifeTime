// Fetches an iCal feed (e.g. Google Calendar's "secret address in iCal
// format") server-side — the calendar hosts don't allow browser CORS —
// and returns a trimmed list of events. Only the event title and start
// make it through. Repeating events are passed with their base start;
// the client decides what's in range.

export function parseIcs(text) {
  // unfold wrapped lines per RFC 5545
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur?.raw && cur.summary) events.push(cur);
      cur = null;
    } else if (cur) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const prop = line.slice(0, colon);
      const val = line.slice(colon + 1).trim();
      if (prop.startsWith("SUMMARY")) {
        cur.summary = val
          .replace(/\\,/g, ",")
          .replace(/\\;/g, ";")
          .replace(/\\n/g, " ")
          .slice(0, 120);
      } else if (prop.startsWith("DTSTART")) {
        cur.raw = val;
        cur.allDay = prop.includes("VALUE=DATE") || /^\d{8}$/.test(val);
        cur.utc = val.endsWith("Z");
      } else if (prop.startsWith("RRULE")) {
        cur.recurring = true;
      }
    }
  }
  return events.slice(0, 500).map((e) => ({
    title: e.summary,
    raw: e.raw,
    utc: !!e.utc,
    allDay: !!e.allDay,
    recurring: !!e.recurring,
  }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const { url } = req.body ?? {};
  if (typeof url !== "string" || !/^https:\/\//i.test(url))
    return res.status(400).json({ error: "bad-url" });

  let text;
  try {
    const r = await fetch(url, {
      headers: { "user-agent": "Lifetime PWA", accept: "text/calendar,*/*" },
    });
    if (!r.ok) return res.status(502).json({ error: "fetch-failed" });
    text = await r.text();
  } catch {
    return res.status(502).json({ error: "fetch-failed" });
  }
  if (text.length > 3_000_000) text = text.slice(0, 3_000_000);

  return res.status(200).json({ events: parseIcs(text) });
}
