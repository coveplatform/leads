# Cove

Missed-call recovery and SMS booking for Australian trades. A customer rings the
business, the call forwards to the business's Cove (Twilio) number, Cove texts
the caller one qualifying question, offers a time window, and the owner
confirms with a one-letter reply. Cove then reminds the customer the evening
before and asks for a Google review after the job.

Clients are onboarded by hand from a config file (no signup, no billing in the
app). Deployed on **Vercel** with **Neon Postgres**. The previous self-serve SaaS
version (Stripe, trials, Google login, AI, instant quotes, demo) is preserved on
the `saas-archive` branch.

## Stack

- **Runtime:** Vercel serverless, Node 18+ (`scripts/migrate.mjs` needs Node 22)
- **Database:** Neon Postgres (`@neondatabase/serverless`)
- **SMS + voice:** Twilio
- **Frontend:** static HTML/CSS/JS in `public/`, no build step

## Layout

```
src/server.js                   Express setup, pages, route mounting
src/routes/webhooks.js          Twilio voice + SMS, voice status, generic lead webhook, public lead API, enquiry form
src/routes/owner.js             /api/me/* — the owner dashboard API
src/routes/auth.js              login (with "stay signed in"), logout, me, password change
src/routes/admin.js             /api/admin/* — Kris only
src/routes/cron.js              /api/cron/* (Vercel cron) and /api/health
src/services/leads.js           starting a lead: opt-out, per-business dedupe, first text, owner alert, nudge
src/services/conversation.js    replies: STOP, matching, booking, owner summary; replies to reminders/nudges
src/services/owner-replies.js   the owner's Y / N / "Thu 2pm" replies
src/services/lead-actions.js    confirm / decline / move bookings, won / lost (SMS and dashboard share these)
src/services/scheduler.js       scheduled_messages: nudges, reminders, review requests, rebook nudges
src/services/forwarding.js      forwarding codes and the "forwarding went quiet" check
src/services/health.js          DB, migrations and Twilio webhook checks
src/services/onboarding.js      validating and building a client from its config file
src/services/twilio-numbers.js  buying, attaching and releasing numbers
src/flow-engine.js              templates, deterministic reply matching, message builders
src/booking.js                  booking windows ("tomorrow arvo") and slots ("1–3pm")
src/time.js                     timezones and opening hours
src/settings.js                 per-business switches and follow-up texts
```

## Onboarding a client (Kris)

```bash
cp clients/example.json clients/dave-plumbing.json   # clients/ is gitignored
# edit it: owner phone, hours, template, review link …
node scripts/onboard-client.mjs clients/dave-plumbing.json --dry-run   # check + create in DB, no Twilio
node scripts/onboard-client.mjs clients/dave-plumbing.json             # buy number, print forwarding codes, welcome text
```

It prints the temp password once — text it to the owner. Re-running is safe;
finished steps are skipped. To change a client's flow, hours or alerts later,
edit the file and run with `--update`. The config file is the source of truth
for the flow.

| Script | What it does |
|---|---|
| `scripts/list-clients.mjs` | one line per client: number, forwarding health, leads this month |
| `scripts/deactivate-client.mjs <id>` | switch off; the number is releasable after 30 days (`--reactivate` to undo) |
| `scripts/deactivate-client.mjs --release-due` | release numbers whose 30 days are up |
| `scripts/monthly-report.mjs <id> <YYYY-MM>` | exact counts + itemised bookings and won jobs: the invoice basis |
| `scripts/fix-webhooks.mjs` | point every client number back at BASE_URL |
| `scripts/migrate.mjs` | apply pending migrations |

Go-live checklist for a new client: config file + script run · owner has set
forwarding and Kris has rung it to confirm · owner logged into the dashboard on
their phone and bookmarked it · review link + follow-up switches agreed ·
pricing and what counts as a billable booking written down · Kris checks the
lead feed daily for a week and rings the owner on day 3 and day 7.

## How a missed call flows

1. `/api/voice/inbound` finds the active business by the called number, stamps
   the forwarding heartbeat, and starts a lead (skipped if the caller sent STOP
   to this business, or already has an active lead there from the last 30 min).
   With `flow_config.voice_mode = "dial_first"` it rings the owner for 20s first
   and only texts back if nobody answers (`/api/voice/status`).
2. The caller gets the intro + one question; the owner gets "Missed call from
   0412… — we've texted them" (switchable); a "still want a call back?" nudge is
   queued for 2 hours later, opening hours only, cancelled if they reply.
3. Replies are matched deterministically: option value, a leading value
   ("A please"), the label or a prefix of it, or a per-option synonym ("burst
   pipe" → emergency). Unmatched replies are re-asked twice, then the owner is
   told to call.
4. With booking on and the business open, Cove offers windows (trades:
   "Tomorrow morning / arvo"; dental: exact slots) and soft-books the pick.
5. The owner gets "🔥 Booked lead … Reply Y to confirm, N to decline, or a time
   to change". Y texts the customer a confirmation and queues a reminder for
   5pm the day before (2h before if same-day). The dashboard has the same buttons.
6. Marking a lead **Won** queues a review request for 9am next morning (if the
   business has a review link) and, if switched on, a rebook nudge N months later.

Texts from someone without a conversation in progress: STOP is recorded; "C" to
a reminder re-offers times; "Y" to a rebook nudge becomes a new lead; anything
else from a recent customer is forwarded to the owner rather than starting a
new flow. `businesses.is_active` is the only on/off switch.

## Scheduled jobs (vercel.json)

| Path | When | Does |
|---|---|---|
| `/api/cron/dispatch` | every 5 min | sends due follow-ups (never before 7:30am or after 7pm local) |
| `/api/cron/health` | hourly | DB, migrations, Twilio webhooks; texts Kris on failure (max every 6h) |
| `/api/cron/forwarding-check` | daily, ~9am AEST | owner + Kris alerted when calls stop for 3 open days |

`GET /api/health` is the public version (no details).

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `JWT_SECRET` | Yes | Signs owner session cookies |
| `BASE_URL` | Yes | Public URL, e.g. `https://usecove.app` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Yes | Twilio credentials (the token also validates webhook signatures) |
| `TWILIO_BUNDLE_SID` / `TWILIO_ADDRESS_SID` / `TWILIO_MESSAGING_SERVICE_SID` | For provisioning | AU regulatory bundle, address and messaging service |
| `CRON_SECRET` | Recommended | Vercel sends it to the cron endpoints |
| `ADMIN_EMAILS` | No | Logins allowed into `/admin` (default: Kris) |
| `ADMIN_ALERT_PHONE` / `ADMIN_ALERT_FROM` / `ADMIN_ALERT_EMAIL` | No | Where alerts to Kris go (from = any Cove number) |
| `RESEND_API_KEY` / `NOTIFY_EMAIL` | No | Email alerts |
| `SMS_DRY_RUN` | No | `1` makes `sendSms` log instead of calling Twilio (tests only) |

## Database

```bash
node scripts/migrate.mjs --dry-run   # list pending
node scripts/migrate.mjs             # apply, recording each in schema_migrations
```

Migrations are additive unless they say otherwise; `011_strip_saas.sql` drops
columns the pre-rebuild release read, so it runs after that release is gone.
Until `012_core_loop.sql` runs, calls and texts still work but follow-ups, the
opt-out table and the weekly summary don't.

## Testing

```bash
npm test                                   # unit + HTTP tests, no DB needed
npm run e2e                                # whole loop against DATABASE_URL (Neon), SMS dry-run
E2E_PG_URL=postgresql://localhost/cove_e2e npm run e2e:local   # same, against a local Postgres
```

After every deploy, run the five-minute live check in [docs/smoke-test.md](docs/smoke-test.md).

## Deploy

Push to `main`; Vercel deploys it. Each Cove number's voice webhook points at
`/api/voice/inbound` and SMS webhook at `/api/sms/inbound` on `BASE_URL`.
