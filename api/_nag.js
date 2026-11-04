// "Keep nudging until it's logged" rules for the push-up challenge. Pure so
// the schedule can be tested without a server. Files starting with "_" are
// not exposed as API routes by Vercel.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const toMins = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const dayNumber = (dateStr) => Date.parse(`${dateStr}T00:00:00Z`) / 86_400_000;

// Validates a schedule from the client; returns a clean copy or null.
export function cleanNag(n) {
  if (!n || typeof n !== "object") return null;
  const { start, end, from, to, tz, lastLogged, updatedAt } = n;
  const everyMins = Number(n.everyMins);
  if (!DATE.test(start ?? "") || !DATE.test(end ?? "")) return null;
  if (!TIME.test(from ?? "") || !TIME.test(to ?? "")) return null;
  if (toMins(from) >= toMins(to)) return null;
  if (!Number.isFinite(everyMins) || everyMins < 30 || everyMins > 720) return null;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    return null;
  }
  return {
    start,
    end,
    from,
    to,
    everyMins,
    tz: String(tz),
    lastLogged: DATE.test(lastLogged ?? "") ? lastLogged : null,
    updatedAt: Number(updatedAt) || 0,
  };
}

// A device that hasn't caught up yet must not undo what a newer one sent:
// the newest settings win, and "logged" only moves forward unless the user
// actually removed an entry.
export function mergeNag(existing, incoming, resetLogged) {
  const base =
    existing && existing.updatedAt > incoming.updatedAt ? existing : incoming;
  const lastLogged = resetLogged
    ? incoming.lastLogged
    : [existing?.lastLogged, incoming.lastLogged]
        .filter(Boolean)
        .sort()
        .pop() ?? null;
  return { ...base, lastLogged };
}

function localParts(nowMs, tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    mins: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

// The nudge due right now, or null. `slot` identifies it so that a scheduler
// running every few minutes sends each one exactly once.
export function dueNudge(nag, nowMs) {
  const { date, mins } = localParts(nowMs, nag.tz);
  if (date < nag.start || date > nag.end) return null;
  if (nag.lastLogged && nag.lastLogged >= date) return null;

  const from = toMins(nag.from);
  const to = toMins(nag.to);
  // a little slack so a late scheduler run can't lose the final nudge
  if (mins < from || mins >= to + 15) return null;

  const lastSlot = Math.floor((to - from) / nag.everyMins);
  const slot = Math.min(Math.floor((mins - from) / nag.everyMins), lastSlot);
  const day = dayNumber(date) - dayNumber(nag.start) + 1;
  const total = dayNumber(nag.end) - dayNumber(nag.start) + 1;

  return {
    slotId: `${date}#${slot}`,
    payload: {
      title: "💪 Push-ups not logged yet",
      body:
        slot === lastSlot
          ? `Last nudge today. Day ${day} of ${total}: do your set, then log it.`
          : `Day ${day} of ${total}: do your set to failure, then log your reps.`,
      // same tag + renotify: one notification that buzzes again, not a pile
      tag: "pushups",
      renotify: true,
      url: "/#/fitness/pushups",
    },
  };
}
