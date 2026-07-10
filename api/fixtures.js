// GET /api/fixtures → upcoming sports fixtures, aggregated server-side.
//
// Spoiler firewall: only events that HAVEN'T STARTED pass through, and the
// response shape has no score/status/result fields at all — the client never
// receives anything it shouldn't show. Live and finished games simply vanish.

const FETCH_OPTS = {
  headers: { "user-agent": "Mozilla/5.0 (Lifetime PWA)", accept: "application/json" },
};

// NRL digital feed covers both NRL (competition 111) and NRLW (161).
async function nrlDraw(competition, league) {
  const season = new Date().getFullYear();
  const out = [];
  let round = null;
  for (let i = 0; i < 3; i++) {
    const url =
      `https://www.nrl.com/draw/data?competition=${competition}&season=${season}` +
      (round === null ? "" : `&round=${round}`);
    const r = await fetch(url, FETCH_OPTS);
    if (!r.ok) break;
    const data = await r.json();
    if (round === null) round = Number(data.selectedRoundId);
    for (const f of data.fixtures ?? []) {
      if (f.matchState !== "Upcoming") continue; // started/finished → gone
      const start = Date.parse(f.clock?.kickOffTimeLong ?? "");
      if (!Number.isFinite(start)) continue;
      const home = f.homeTeam?.nickName ?? "TBC";
      const away = f.awayTeam?.nickName ?? "TBC";
      out.push({
        id: `${league}-${home}-${away}-${start}`,
        league,
        title: `${home} v ${away}`,
        detail: [f.roundTitle, f.venue].filter(Boolean).join(" · "),
        start,
      });
    }
    round++;
  }
  return out;
}

async function espn(path, league, titleFromTeams) {
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const from = new Date();
  const to = new Date(Date.now() + 45 * 86_400_000);
  const r = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${fmt(from)}-${fmt(to)}`,
    FETCH_OPTS
  );
  if (!r.ok) return [];
  const data = await r.json();
  return (data.events ?? [])
    .filter((e) => e.status?.type?.state === "pre") // not started only
    .map((e) => {
      const comp = e.competitions?.[0];
      let title = e.name ?? "";
      if (titleFromTeams) {
        const home = comp?.competitors?.find((c) => c.homeAway === "home");
        const away = comp?.competitors?.find((c) => c.homeAway === "away");
        if (home && away)
          title = `${home.team?.displayName ?? "TBC"} v ${away.team?.displayName ?? "TBC"}`;
      }
      const start = Date.parse(e.date);
      if (!Number.isFinite(start)) return null;
      return {
        id: `${league}-${e.id}`,
        league,
        title,
        detail: comp?.venue?.fullName ?? "",
        start,
      };
    })
    .filter(Boolean);
}

export default async function handler(req, res) {
  const results = await Promise.allSettled([
    nrlDraw(111, "NRL"),
    nrlDraw(161, "NRLW"),
    espn("australian-football/afl", "AFL", true),
    espn("racing/f1", "F1", false),
    espn("mma/ufc", "UFC", false),
  ]);

  const now = Date.now();
  const fixtures = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((f) => f.start > now) // belt and braces: future only
    .sort((a, b) => a.start - b.start)
    .slice(0, 200);
  const failed = ["NRL", "NRLW", "AFL", "F1", "UFC"].filter(
    (_, i) => results[i].status === "rejected"
  );

  // cache at Vercel's edge for 15 minutes
  res.setHeader("cache-control", "s-maxage=900, stale-while-revalidate=3600");
  return res.status(200).json({ fetchedAt: now, fixtures, failed });
}
