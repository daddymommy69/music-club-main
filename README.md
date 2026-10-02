# Gooberz Music Club

A shared-playlist club for friends: curators build a playlist together
every cycle, subscribers get it by text/email, and everyone can submit
songs and vote on a subscriber-picked Top 10. See the project's
`design-handoff.md` and `plan.md` docs for the full design and build
history — this file only covers setup and deployment.

**What's built:** everything. Sign-up (`/`), song submission by web form
or by texting a link to the club's number (`/submit`), the public archive
and drop pages (`/archive`, `/drop/:num`), the personalized subscriber
page (`/you/:token`), curator login (`/curators`), the curator room
(`/room`), the curator dashboard including shipping a drop
(`/overview`), club settings (`/settings`), and the Subscriber Top 10.

## 1. Database

Any Postgres connection string works. Easiest path since you're already
on Vercel:

1. In your Vercel project → **Storage** tab → **Create Database** →
   choose **Postgres** (it's backed by Neon, free tier is plenty for
   this scale).
2. Vercel will offer to add the connection string to your project's
   environment variables automatically — accept that, or copy the
   `DATABASE_URL` it gives you into `.env.local` for local development.
3. Create the tables (run this locally once you've set `DATABASE_URL`):
   ```bash
   npx drizzle-kit push
   ```

(Supabase's free Postgres works exactly the same way if you'd rather use that instead.)

## 2. Site URL

Set `NEXT_PUBLIC_SITE_URL` to your real deployed domain, e.g.
`https://gooberz.club`. Every text/email link (the personal `/you` link,
drop links) and every "share this" string on the site is built from this
one value — nothing is hardcoded, so if the domain ever changes, this is
the only place that needs to.

Local dev works with it unset (falls back to `http://localhost:3000`).

## 3. Twilio (SMS)

1. Sign up at [twilio.com](https://www.twilio.com) — new accounts get
   free trial credit, which will cover a 3–20 person group for a long
   time.
2. Buy a phone number (Twilio Console → Phone Numbers → Buy a number).
   This becomes your club's number — for sending releases *and* for
   subscribers to text a song link to.
3. From the Console dashboard, copy your **Account SID** and **Auth
   Token** into `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`. Put the
   number you bought (in `+1XXXXXXXXXX` format) into
   `TWILIO_FROM_NUMBER`.
4. On that phone number's settings page, set "A message comes in" to a
   webhook pointing at `https://<your-deployed-site>/api/sms/inbound`
   (method POST). This one webhook handles three things: STOP/START
   opt-out, and now also SMS text-in — texting a Spotify/Apple Music
   link to the number submits it for the open drop the same as the
   `/submit` web form, replying with a confirmation or an error.

> Note: while your Twilio account is still in trial mode, it can only
> text phone numbers you've manually verified in the Twilio console.
> Verify your curators'/testers' numbers there for your first test run,
> or upgrade the account (add a balance) once you're ready for
> real subscribers.

## 4. Resend (Email)

1. Sign up at [resend.com](https://resend.com) — free tier covers this
   scale easily.
2. Verify a sending domain (or use their onboarding test domain for
   local testing).
3. Create an API key, put it in `RESEND_API_KEY`. Put your verified
   "from" address in `EMAIL_FROM_ADDRESS`.

## 5. App secrets

- `NEXT_PUBLIC_CLUB_NAME` — shown in confirmation/release message text
  (not the same as the club's display name on the site, which curators
  can change on `/settings` — see `plan.md`'s notes on this gap).
- `CLUB_JOIN_CODE` — the code new curators enter to join on `/curators`
  (format like `GOOBERZ-4821`). A curator can see/copy it later from
  `/settings` too.
- `ADMIN_SECRET` — make up any password. Protects the one remaining
  admin-only endpoint: starting a new drop (see "Starting a drop" below).
- `CRON_SECRET` — make up any password. Set the *same* value in Vercel's
  environment variables; Vercel automatically sends it when it calls
  your scheduled cron job, which is how that route knows the request is
  really coming from Vercel and not a stranger.
- `SESSION_SECRET` — a long random string you make up yourself, e.g.
  `openssl rand -hex 32`. Signs the curator login session cookie.
  Changing it logs every curator out.

Copy `.env.example` to `.env.local` and fill in everything above for
local development. In production, add the same variables in your Vercel
project's **Settings → Environment Variables**.

## Running locally

```bash
npm install
npx drizzle-kit push   # creates the tables from src/db/schema.ts
npm run dev
```

Visit `http://localhost:3000` to see the sign-up page.

## Starting a drop

There's no curator-facing "start a drop" button yet — a drop is started
with a simple admin API call once the previous one has shipped:

```bash
curl -X POST https://<your-site>/api/drops \
  -H "Authorization: Bearer <ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

(`title`, `appleUrl`, `spotifyUrl` are all optional here — normally you
start it empty and fill those in later, see "Shipping a drop" below.)

From there, curators add picks and notes in `/room`, and subscribers'
submissions (web or text-in) show up in `/overview`'s pile to quick-add.

## Shipping a drop

Once curators are happy with the picks in `/room`, ship it from
`/overview`: paste the final Spotify/Apple Music playlist link(s) (and
optionally a title) into the "Ship drop" card there. Saving publishes the
drop and sends the release text/email to every subscriber, in one step —
no separate curl command needed for a normal release.

## Sending

- **Automatic:** `vercel.json` runs a daily check (see `src/app/api/cron/send/route.ts`); once the club's cycle interval has passed since the current drop was created, it sends automatically — but only if a playlist link is already set (i.e. someone shipped it from `/overview` first). Vercel's free tier only runs cron jobs once a day, which is why it's a daily "is it due yet?" check rather than a literal timer.
- **Manual override:**
  ```bash
  curl -X POST https://<your-site>/api/send \
    -H "Authorization: Bearer <ADMIN_SECRET>"
  ```
  Same "must already have a playlist link" requirement — this re-sends whatever's currently set, it doesn't let you set one.

## Deploying

1. Push this repo to GitHub.
2. Import it in Vercel ([vercel.com/new](https://vercel.com/new)).
3. Add all the environment variables from `.env.example`, including your
   real `NEXT_PUBLIC_SITE_URL`.
4. Deploy. Vercel will pick up `vercel.json` automatically and register
   the daily cron job.
5. Point your domain's DNS at Vercel (Project → Settings → Domains).
6. Set the Twilio inbound webhook (step 4 under "Twilio" above) to your
   real deployed URL — it won't work pointed at `localhost`.
7. Run `npx drizzle-kit push` once against the production `DATABASE_URL`
   to create the tables there, then start your first drop (see above).

## Project structure

```
src/db/schema.ts              Full club-scoped schema
src/db/client.ts               Drizzle/Postgres connection
src/lib/sms.ts                  Twilio wrapper
src/lib/email.ts                Resend wrapper
src/lib/messages.ts             Message text templates
src/lib/site.ts                 The real deployed domain, read from NEXT_PUBLIC_SITE_URL
src/lib/release.ts              Shared "send this drop to everyone" logic
src/lib/smsSubmit.ts            SMS text-in submission logic
src/lib/top10.ts, top10Data.ts  Subscriber Top 10 window/tally logic + queries
src/app/page.tsx                Sign-up landing page
src/app/submit                  Submission web form
src/app/archive, drop/[num]     Public archive + drop detail
src/app/you/[token]             Personalized subscriber page (magic link)
src/app/curators                Curator login
src/app/room                    Curator picks/notes/comments
src/app/overview                Curator dashboard: pile, roster, ship a drop, Top 10
src/app/settings                Club name/cycle/join-code
src/app/api/drops               Start a new drop (admin-only)
src/app/api/overview/ship       Paste playlist link(s) + publish + send
src/app/api/send                Manual "send now" override (admin-only)
src/app/api/cron/send           Daily automatic-send check (Vercel Cron)
src/app/api/sms/inbound         Twilio webhook: STOP/START + SMS text-in
```
