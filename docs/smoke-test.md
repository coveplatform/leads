# Live smoke test

Run after **every** production deploy, against the **Cove Test** business
(owner phone = Kris's mobile). Five minutes. Don't skip it.

You need a second phone that is *not* the test business's owner phone.

## Before

- [ ] `https://usecove.app/api/health` returns `"ok": true`
      (`migrations_pending: 0`, `twilio_webhooks_ok: true`)
- [ ] `node scripts/list-clients.mjs` shows every client ON with a number

## Missed call

- [ ] From the second phone, ring the test business's number and let it ring out
- [ ] Second phone gets the text-back with the triage question within ~10 seconds
- [ ] Kris's phone gets "Missed call from 04… — we've texted them"

## Conversation

- [ ] Reply in words, not a letter (e.g. "burst pipe") — it should be understood
- [ ] Booking windows arrive ("Tomorrow morning / Tomorrow arvo / Another time")
- [ ] Reply `1` — second phone gets "Booked ✅ … we'll confirm shortly"
- [ ] Kris's phone gets "🔥 Booked lead … Reply Y to confirm, N to decline"

## Owner confirms

- [ ] Kris replies `Y` — second phone gets "Confirmed ✅ …", Kris gets "Confirmed 04…"
- [ ] Dashboard on Kris's phone: the lead shows as confirmed in **Needs you now**,
      with the conversation and the reminder that's queued

## Clean up

- [ ] Mark the test lead **Done** and **Lost** in the dashboard (cancels its reminder)
- [ ] Nothing odd in the Vercel logs for the last 10 minutes (search `webhook_slow`, `error`)

If anything fails: roll back in Vercel (Deployments → previous → Promote), then
investigate. The existing client is live the whole time.
