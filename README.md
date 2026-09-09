# 🌍 Geo Quest (folder + Vercel project still named "Globe Quest" / globe-quest)

A clean, friendly game for learning the countries of the world — maps, flags,
capitals, and a "Did you know?" fact for every country. Built for kids **and**
grown-ups. No accounts, no cookies, no build step. (Optional anonymous gameplay
stats — see [Analytics](#analytics--admin-dashboard) — collect no personal data.)

👉 **To play right now:** double-click `index.html`.
*(For the map to load, you need to be online — see [Going offline](#going-offline).)*

---

## The games

| Game | What you do |
|---|---|
| 👀 **Preview the Map** | Hover or tap to reveal country names (or show them all) — study before you play. |
| 🗺️ **Find on the Map** | We name a country — you tap it on the world map. |
| 📍 **Name the Country** | A country glows on the map — pick its name. |
| 🚩 **Guess the Flag** | See a flag, choose the country. |
| 🏴 **Match the Flag** | See a country, choose its flag. |
| 🏛️ **Capital City** | Pick the right capital city. |
| 🏙️ **Which Country?** | Given a capital, name its country. |
| 🎲 **Mix It Up** | A little of everything. |
| 📖 **Explore the Atlas** | Roam the map freely, tap anything, learn — no score. |

You can filter by **continent** (whole world, Africa, Americas, Asia, Europe,
Oceania) and pick a **round length** (10, 20, or all). After every answer you get
a fact card with the flag, capital, language, currency, neighbours, size, and a
fun fact. There's a light and a dark theme (🌙 / ☀️ top-right).

---

## Putting it online (so others can play)

It's just static files, so any free static host works. Easiest options:

- **Vercel** (recommended here) — push this folder to a GitHub repo and import it
  in Vercel under your **personal Hobby** scope. Framework preset **"Other"**, leave
  Build Command and Output Directory **blank**, Deploy. Every `git push` redeploys.
- **Netlify Drop** — drag the `globe-quest` folder onto
  [app.netlify.com/drop](https://app.netlify.com/drop) for an instant link.
- **GitHub Pages** — push to a **public** repo, then *Settings → Pages* → deploy from
  `main`. (Pages from a private repo needs a paid plan.)

The game alone needs no server. The **optional** analytics + admin dashboard add a
free Supabase backend — see below.

> **Keeping personal and client work separate.** If you also use Vercel/Supabase for
> paid client work, keep the two in different lanes: deploy this game on your
> **personal Hobby** Vercel scope (a free, non-monetised game is allowed there) and
> put its Supabase project in a **separate personal organization** on the Free plan —
> never inside a client's paid team/org. That keeps billing, data, and access fully
> isolated. (A non-commercial game with no ads/payments/affiliate links is fine on
> Hobby; the moment it earns money, move it to a Vercel Pro team.)

---

## Analytics & admin dashboard

Entirely **optional**. When set up, anonymous gameplay events flow into Supabase and a
password-protected dashboard at **`/admin`** shows: visitors & sessions over time,
most-played games, hardest countries (by wrong-answer rate), average score, and
round-completion rate. It is **cookieless and stores no personal data** — just a random
per-tab id and game events (mode, right/wrong, score). No cookie banner required.

**Setup (~10 minutes):**

1. **Supabase project** — in a **new personal organization** on the Free plan, create a
   project. Open *SQL Editor*, paste all of [`supabase/schema.sql`](supabase/schema.sql),
   and Run. (Creates the table, locked-down security, the `log_event` write path, and the
   admin views.)
2. **Admin login** — *Authentication → Sign In / Providers*: turn **off** "Allow new users
   to sign up". Then add **one** user = your admin email (the one in `schema.sql`'s
   `is_admin()` and in `assets/config.js`).
3. **Keys** — *Settings → API*: copy the **Project URL** and the **publishable** key
   (`sb_publishable_…`) into [`assets/config.js`](assets/config.js). The publishable key is
   public by design (protected by row-level security) — safe to commit. **Never** put the
   secret / service_role key in this repo or the browser.
4. **Deploy** and play a few rounds, then open `https://<your-site>/admin`, sign in, and
   you'll see the numbers.

**Keeping the backend awake.** Free Supabase projects pause after ~7 days with no activity
(data is preserved; you just resume it). Real players reset the timer. For quiet stretches,
point a free uptime monitor ([cron-job.org](https://cron-job.org),
[UptimeRobot](https://uptimerobot.com)) at the keep-alive endpoint every ~3 days:
`POST https://<project>.supabase.co/rest/v1/rpc/keepalive` with header
`apikey: <publishable key>`.

**If it gets popular.** The Free plan covers a lot, but if the events table approaches its
size limit the project goes read-only. Add a periodic rollup/cleanup (aggregate old rows
and delete them), or upgrade that one Supabase org to Pro. Watch DB size in the dashboard.

---

## Changing the content (no coding needed)

Everything the game knows lives in **`data/countries.js`** — plain, readable
JavaScript. Open it in any text editor and:

- **Fix or change a fact, capital, or name** — just edit the text and save.
- **Add another fun fact** to a country — add a line to its `"facts": [ ... ]`
  list. The game picks one at random each time.

Example:

```js
{
  "name": "Japan",
  "capital": "Tokyo",
  ...
  "facts": [
    "Japan is made up of over 14,000 islands...",
    "Add your own fact here — it shows up in the game!"
  ]
}
```

Reload the page and your change is live.

**Other easy tweaks:**

- **Games, continents, round lengths** — edit the `MODES`, `REGIONS`, and
  `LENGTHS` lists at the top of `assets/app.js`.
- **Colours, fonts, spacing** — all the colours are CSS variables at the top of
  `assets/styles.css` (there's a light theme and a dark theme).

---

## Going offline

The game itself runs locally, but three things load from the internet:

1. the **map engine** (d3 + topojson, from a CDN),
2. the **flag images** (from flagcdn.com),
3. the **font** (Nunito, from Google Fonts).

So you need to be online the first time (your browser will cache them after).
If you ever want a fully offline version, those three could be downloaded and
bundled — ask and it can be set up.

---

## Rebuilding the data (optional)

You normally never need this. `data/countries.js` and `data/world.js` were
generated by `build/generate.py` from two open datasets, and the facts were
added by `build/merge_facts.py`. To regenerate from scratch, see the comments at
the top of those scripts.

## Credits & data

- Country data: [mledoze/countries](https://github.com/mledoze/countries) (ODbL).
- Map shapes: [world-atlas](https://github.com/topojson/world-atlas) / Natural Earth (public domain).
- Flags: [flagcdn.com](https://flagcdn.com).
- Map rendering: [D3](https://d3js.org).

Facts were generated and fact-checked with care, but if you spot anything off,
just edit `data/countries.js` — that's what it's there for. 🌏
