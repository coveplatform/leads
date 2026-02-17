# ChairFlow

Instant lead response system for service businesses. Deployed on **Vercel** with **Neon Postgres**.

## Stack

- **Runtime:** Vercel serverless (Node 18+)
- **Database:** Neon Postgres (`@neondatabase/serverless`)
- **SMS:** Twilio
- **Frontend:** Static HTML/CSS/JS in `public/`

## Local development

```bash
npm install
cp .env.example .env   # fill in your values
npm run dev             # http://localhost:3000
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `DEBUG` | No | Set `true` for verbose logging |

## Database setup

1. Create a Neon project at https://console.neon.tech
2. Copy the connection string into `DATABASE_URL`
3. Run `sql/schema.sql` in the Neon SQL Editor

## Add a client business

```sql
INSERT INTO businesses (name, twilio_from_number, owner_notify_phone, booking_link)
VALUES (
  'ABC Plumbing',
  '+61400000000',
  '+61411111111',
  'https://abcplumbing.com.au/book'
);
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set environment variables in Vercel dashboard → Settings → Environment Variables.

Set Twilio inbound SMS webhook to: `https://your-app.vercel.app/api/sms/inbound`

## API

### `GET /health`

### `POST /api/lead`

```json
{ "businessId": "UUID", "name": "Sam", "phone": "+61412345678", "email": "sam@example.com", "message": "Leak under kitchen sink" }
```

### `POST /api/sms/inbound`

Twilio webhook endpoint. Receives `From`, `To`, `Body`, `NumMedia`, `MediaUrl0`.

### `POST /api/website-inquiry`

```json
{ "name": "Sam", "email": "sam@example.com", "phone": "+61412345678", "businessName": "ABC Plumbing", "websiteUrl": "https://abcplumbing.com.au", "message": "We reply too slowly" }
```

## Notes

- Use E.164 phone format (`+614...`) for reliable matching.
- Twilio enforces SMS compliance; include opt-out behavior in production.
- Customize `src/flow.js` per industry (dental, plumbing, electrical, etc.).
