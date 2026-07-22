# Lifetime

Your personal hub for lists, tasks, time and money. Built as a Progressive Web
App: it runs in any browser and installs to your phone's home screen like a
native app. All data is stored on your device — no account, no sign-up.

## Getting it live (no coding required)

1. **Create a GitHub account** at github.com if you don't have one.
2. **Create a new repository** — click the "+" (top right) → "New repository".
   Name it `lifetime`, keep it Private, and tick "Add a README" so the repo
   isn't empty. Click Create.
3. **Upload these files** — in your new repo, click "Add file" → "Upload
   files". Drag in everything from this folder (you can drag the folders like
   `src` and `public` straight in). Click "Commit changes".
4. **Create a Vercel account** at vercel.com — choose "Continue with GitHub".
5. **Import the project** — on Vercel, click "Add New… → Project", pick your
   `lifetime` repo, and click Deploy. Vercel detects Vite automatically.
6. After a minute you'll get a URL like `lifetime-xyz.vercel.app`. Open it on
   your phone.
7. **Install it**: on iPhone, tap Share → "Add to Home Screen". On Android,
   tap the menu → "Add to Home screen" / "Install app".

From now on, any change committed to the GitHub repo redeploys automatically.

## Roadmap

- **Phase 1 — Lists** ✅ shopping and general checklists
- **Phase 2 — Tasks** ✅ priorities, recurring to-dos, day planner
- **Phase 3 — Calendar** ✅ month view, events, day agenda
- **Phase 4 — Budget** ✅ monthly budgets, spending by category, trends,
  recurring bills & upcoming expenses
- **Phase 5 — Backup & reminders** ✅ backup/restore file, push reminders
  (needs the two free add-ons below)
- **Phase 6 — Fitness** ✅ gym workouts & routines, cardio, weight trend,
  weekly activity goal & streaks
- **Phase 7 — Today dashboard** ✅ unified daily view on Home, quick add,
  app-icon shortcuts, backup nudges
- **Phase 8 — Habits** ✅ daily habit ticks with streaks, right on the
  dashboard
- **Phase 9 — Sync** ✅ optional cross-device sync (Dexie Cloud)
- **Phase 10 — Sports** ✅ upcoming fixtures for NRL, NRLW, AFL, F1 & UFC —
  spoiler-free by design (games vanish at kick-off; scores never leave the
  server)
- **Phase 11 — Meals** ✅ week meal planner + meal library; sends
  ingredients to any shopping list in one tap (the copies are independent —
  editing one never touches the other)
- **Phase 12 — Search** ✅ one box that finds anything across the whole app
- **Phase 13 — Household sharing** ✅ share the calendar, meals and chosen
  lists with your other half (Settings → Household); tasks, budget,
  fitness and habits stay personal to each account
- **Phase 14 — Quality drop** ✅ Sunday-evening weekly digest push, an
  Insights page of local trends, quantities on list items, favourite
  teams on Sports, and shared household Notes
- **Phase 15 — Meals upgrades** ✅ tap-to-edit meals with recipe
  notes/links, fill-my-week & copy-last-week planning, leftovers/takeaway
  quick days, and smarter shopping exports (remaining days only, pantry
  staples skipped)
- **Phase 16 — The big expansion** ✅ local weather on the dashboard,
  birthdays & anniversaries with lead-up reminders, savings goals,
  a read-only work-calendar feed (paste an iCal link in Settings), a
  home-upkeep task pack, more meal & workout starters, and an emergency
  info note template
- **Phase 17 — Money & home** ✅ income sources with a "left this month"
  net position, manual savings-account balances, and a customisable Home
  (hide and reorder the shortcut tiles)

## Sync

Sync is optional and off by default — the app works fully on-device
without it. To use Lifetime on several devices (or protect against a
lost phone): **Settings → Sync → Turn on sync**, enter your email, and
type the one-time code it sends you. Do the same on each device with
the same email and everything stays in step automatically. Signing out
is safe: data stays in your cloud account and returns when you sign
back in. The free tier covers up to 3 people.

## Turning on event reminders (10 minutes, all free)

Reminders need a tiny bit of server help so notifications arrive even when
the app is closed. Only reminder titles and times ever leave your device.
Two one-off setups:

**1. Give the app somewhere to store reminder times (Upstash, free):**

1. Open your project on vercel.com → **Storage** tab → **Create Database**.
2. Choose **Upstash** → **Redis**, pick the free plan, accept the defaults,
   and connect it to the project. That's it — no settings to copy.
3. Redeploy once (Deployments → ⋯ on the latest → Redeploy) so the app picks
   it up.

**2. Give the app a heartbeat (cron-job.org, free):**

1. Create a free account at cron-job.org.
2. Create a new cron job with the URL
   `https://YOUR-APP.vercel.app/api/cron` (use your real app address),
   running **every 5 minutes**.
3. Save. The first run may say `no-vapid-yet` — that fixes itself the first
   time you turn reminders on in the app.

Then on each phone/device: open the installed app → **Settings → Turn on
reminders** (on iPhone the app must be added to the Home Screen first).
Calendar events notify at the time you pick on the event; bills notify at
9am the day before they're due, automatically.

## For developers (or Claude)

```
npm install     # once
npm run dev     # local development
npm run build   # production build (output in dist/)
```

Stack: Vite · React · TypeScript · Tailwind CSS v4 · Dexie (IndexedDB) ·
vite-plugin-pwa. All records use UUID keys + timestamps so a sync layer can be
added later without migration pain.
