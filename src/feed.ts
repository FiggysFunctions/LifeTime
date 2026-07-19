import { toDateStr } from "./dates";

// Read-only events from an external calendar feed (Google/Outlook ICS
// URL). The URL is a secret — it stays in this device's localStorage and
// is only ever sent to our own /api/ical proxy.

export interface FeedEvent {
  id: string;
  title: string;
  date: string; // local "YYYY-MM-DD"
  time: string | null; // local "HH:MM"; null = all-day
}

const URL_KEY = "lifetime-ical-url";
const CACHE_KEY = "lifetime-ical-cache";
const TTL = 30 * 60_000;

export const getFeedUrl = () => localStorage.getItem(URL_KEY) ?? "";

export function setFeedUrl(url: string) {
  if (url.trim()) localStorage.setItem(URL_KEY, url.trim());
  else localStorage.removeItem(URL_KEY);
  localStorage.removeItem(CACHE_KEY);
}

// "20260801" / "20260801T090000" / "20260801T090000Z" → local Date.
// Floating times (no Z) are treated as local time — right for your own
// calendar in your own timezone, approximate across timezones.
function toLocalDate(raw: string, utc: boolean): Date | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  if (h === undefined) return new Date(Number(y), Number(mo) - 1, Number(d));
  if (utc)
    return new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
    );
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

export async function fetchFeedEvents(force = false): Promise<FeedEvent[]> {
  const url = getFeedUrl();
  if (!url) return [];
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!force && cached && Date.now() - cached.at < TTL) return cached.events;

    const r = await fetch("/api/ical", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!r.ok) throw new Error("bad response");
    const data = await r.json();

    const from = Date.now() - 86_400_000;
    const to = Date.now() + 60 * 86_400_000;
    const events: FeedEvent[] = (data.events ?? [])
      .map(
        (
          e: { title: string; raw: string; utc: boolean; allDay: boolean },
          i: number
        ) => {
          const d = toLocalDate(e.raw, e.utc);
          if (!d) return null;
          const t = d.getTime();
          if (t < from || t > to) return null;
          return {
            id: `feed-${i}-${t}`,
            title: e.title,
            date: toDateStr(d),
            time: e.allDay
              ? null
              : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
          };
        }
      )
      .filter((e: FeedEvent | null): e is FeedEvent => e !== null)
      .sort((a: FeedEvent, b: FeedEvent) => a.date.localeCompare(b.date));

    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), events }));
    return events;
  } catch {
    // stale cache beats nothing when offline
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      return cached?.events ?? [];
    } catch {
      return [];
    }
  }
}
