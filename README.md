# Cove

Missed-call recovery and SMS booking for Australian trades. A customer rings the
business, the call forwards to the business's Cove (Twilio) number, Cove texts
the caller one qualifying question, offers a time window, and alerts the owner.

Clients are onboarded by hand (no signup, no billing in the app). Deployed on
**Vercel** with **Neon Postgres**. The previous self-serve SaaS version (Stripe,
trials, Google login, AI, instant quotes, demo) is preserved on the
`saas-archive` branch.

## Stack

- **Runtime:** Vercel serverless, Node 18+ (`scripts/migrate.mjs` needs Node 22)
- **Database:** Neon Postgres (`@neondatabase/serverless`)
- **SMS + voice:** Twilio
- **Frontend:** static HTML/CSS/JS in `public/`, no build step

## Layout

```
src/server.js              Express setup, pages, route mounting
src/routes/webhooks.js     Twilio voice + SMS, generic lead webhook, public lead API, enquiry form
src/routes/auth.js         login, logout, me, password change
src/routes/owner.js        /api/me/* — the owner dashboard API
src/routes/admin.js        /api/admin/* — Kris only
src/middleware.js          auth guards, Twilio signature check, rate limiting
src/services/leads.js      starting a lead (opt-out + per-business dedupe + first text)
src/services/conversation.js  reply handling: STOP, matching, booking, owner alert
src/services/twilio-numbers.js  buying + wiring a Twilio number
src/flow-engine.js         templates, deterministic reply matching, message builders
src/booking.js             booking windows from operating hours
src/integrations.js        owner notifications (SMS, email, webhooks), operating hours
```

## Local development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, TWILIO_*, JWT_SECRET, BASE_URL
npm run dev            # http://localhost:3000
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `JWT_SECRET` | Yes | Signs owner session cookies |
| `BASE_URL` | Yes | Public URL, e.g. `https://usecove.app` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Yes | Twilio credentials (the token also validates webhook signatures) |
| `TWILIO_BUNDLE_SID` / `TWILIO_ADDRESS_SID` / `TWILIO_MESSAGING_SERVICE_SID` | For provisioning | AU regulatory bundle, address and messaging service |
| `ADMIN_EMAILS` | No | Logins allowed into `/admin` (default: Kris) |
| `RESEND_API_KEY` / `NOTIFY_EMAIL` | No | Owner email alerts |
| `ADMIN_ALERT_EMAIL` / `ADMIN_ALERT_PHONE` / `ADMIN_ALERT_FROM` | No | Where website enquiries alert Kris |
| `SMS_DRY_RUN` | No | `1` makes `sendSms` log instead of calling Twilio (tests only) |
| `DEBUG` | No | `true` for verbose logging |

## Database

Migrations live in `migrations/` and run in filename order:

```bash
node scripts/migrate.mjs --dry-run   # list pending
node scripts/migrate.mjs             # apply, recording each in schema_migrations
```

Run migrations **after** deploying the code that needs them. `011_strip_saas.sql`
drops the Stripe, trial, OAuth, reset-token and quote columns; the previous
release still reads them, so deploy first, then migrate.

## How a missed call flows

1. `/api/voice/inbound` finds the active business by the called number, stamps
   the forwarding heartbeat, and starts a lead: skipped if the caller sent STOP
   to this business or already has an active lead there from the last 30 minutes.
2. The caller gets the intro + one question (e.g. plumbing: A emergency / B today / C can wait).
3. Replies to `/api/sms/inbound` are matched deterministically: the option
   value, a leading value ("A please"), the label or a prefix of it, or a
   per-option synonym ("burst pipe" → emergency). Unmatched replies are re-asked
   twice, then the owner is told to call.
4. With booking on and the business open, Cove offers windows and soft-books the
   pick (`booking_status = 'proposed'`); otherwise it sends the completion line.
5. The owner gets an SMS summary (plus email/webhooks if configured).

`businesses.is_active` is the only on/off switch. Billing never drops calls.

## Lead sources

- Forwarded missed calls (`/api/voice/inbound`)
- Customers texting the Cove number directly (`/api/sms/inbound`)
- `POST /api/webhook/generic/:businessId` — Zapier, Make, website forms (`x-cove-secret` header if the business has one)
- `POST /api/lead` — `{ businessId, phone, name?, email?, message? }`

## Testing

```bash
npm test                                          # unit + HTTP tests, no DB needed
SMS_DRY_RUN=1 node scripts/test-inbound-e2e.mjs   # missed call → reply → booking, needs a real DATABASE_URL
```

## Deploy

Push to `main`; Vercel deploys it. Each Cove number's voice webhook points at
`/api/voice/inbound` and SMS webhook at `/api/sms/inbound` on `BASE_URL`
(`node scripts/fix-webhooks.mjs` repairs them).
