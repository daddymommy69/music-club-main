# Music Club — Phase 0

This is the "founding idea" version of the music club app: you (and the
other curators) hand-build a shared Apple Music playlist like always, and
this app's only job is to collect sign-ups and automatically text/email
that playlist link out every 45 days.

**What's built:** sign-up page, a way for you to start a new cycle with a
playlist link, an automatic 45-day send, a manual "send now" override, a
confirmation message on sign-up, and STOP/START opt-out handling.

**What's NOT built yet** (see `plan.md` in the project docs for the full
phased plan): the song submission page/text-in, Spotify auto-build, the
curator group page, the public archive, and the subscriber Top 10. Those
come later, on top of this.

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

## 2. Twilio (SMS)

1. Sign up at [twilio.com](https://www.twilio.com) — new accounts get
   free trial credit, which will cover a 3–20 person group for a long
   time.
2. Buy a phone number (Twilio Console → Phone Numbers → Buy a number).
   This becomes your "Music Club" sending number.
3. From the Console dashboard, copy your **Account SID** and **Auth
   Token** into `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`. Put the
   number you bought (in `+1XXXXXXXXXX` format) into
   `TWILIO_FROM_NUMBER`.
4. On that phone number's settings page, set "A message comes in" to a
   webhook pointing at `https://<your-deployed-site>/api/sms/inbound`
   (method POST). This is what makes STOP/START work.

> Note: while your Twilio account is still in trial mode, it can only
> text phone numbers you've manually verified in the Twilio console.
> Verify your curators'/testers' numbers there for your first test run,
> or upgrade the account (add a balance) once you're ready for
> real subscribers.

## 3. Resend (Email)

1. Sign up at [resend.com](https://resend.com) — free tier covers this
   scale easily.
2. Verify a sending domain (or use their onboarding test domain for
   local testing).
3. Create an API key, put it in `RESEND_API_KEY`. Put your verified
   "from" address in `EMAIL_FROM_ADDRESS`.

## 4. App secrets

- `ADMIN_SECRET` — make up any password. Protects the endpoints only you
  should be able to call (starting a cycle, triggering a manual send).
- `CRON_SECRET` — make up any password. Set the *same* value in Vercel's
  environment variables; Vercel automatically sends it when it calls
  your scheduled cron job, which is how that route knows the request is
  really coming from Vercel and not a stranger.

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

## Starting a cycle

There's no curator page yet (that's Phase 1.5), so for now you start a
cycle with a simple API call once you've built that cycle's Apple Music
playlist by hand:

```bash
curl -X POST https://<your-site>/api/cycles \
  -H "Authorization: Bearer <ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"appleMusicUrl": "https://music.apple.com/..."}'
```

## Sending

- **Automatic:** `vercel.json` runs a daily check (see `src/app/api/cron/send/route.ts`); once 45 days have passed since the current cycle's start date, it sends automatically. Vercel's free tier only runs cron jobs once a day, which is why it's a daily "is it due yet?" check rather than a literal 45-day timer.
- **Manual override:**
  ```bash
  curl -X POST https://<your-site>/api/send \
    -H "Authorization: Bearer <ADMIN_SECRET>"
  ```

## Deploying

1. Push this project to a GitHub repo.
2. Import it in Vercel ([vercel.com/new](https://vercel.com/new)).
3. Add all the environment variables from `.env.example`.
4. Deploy. Vercel will pick up `vercel.json` automatically and register
   the daily cron job.

## Project structure

```
src/db/schema.ts          Subscriber + Cycle tables
src/db/client.ts          Drizzle/Postgres connection
src/lib/sms.ts            Twilio wrapper
src/lib/email.ts          Resend wrapper
src/lib/messages.ts       Message text templates
src/lib/release.ts        Shared "send this cycle to everyone" logic
src/app/page.tsx          Sign-up landing page
src/app/api/subscribe     Sign-up form submits here
src/app/api/cycles        Start a new cycle (admin-only)
src/app/api/send          Manual "send now" override (admin-only)
src/app/api/cron/send     Daily automatic-send check (Vercel Cron)
src/app/api/sms/inbound   Twilio webhook for STOP/START
```

Nothing beyond this Phase 0 scope has been built. See the project's
`plan.md` doc for Phase 1 (submissions + Spotify), Phase 1.5 (curator
page), Phase 2 (public archive), and Phase 3 (subscriber Top 10).
