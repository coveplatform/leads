# Cove

Instant lead qualification system for service businesses. SMS-based triage with customizable flows, AI generation, and integration with Podium/CRM platforms. Deployed on **Vercel** with **Neon Postgres**.

## Stack

- **Runtime:** Vercel serverless (Node 18+)
- **Database:** Neon Postgres (`@neondatabase/serverless`)
- **SMS:** Twilio
- **AI:** OpenAI GPT-4o-mini (optional — for flow generation + smart reply parsing)
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
| `DEMO_TWILIO_NUMBER` | No | Twilio number for live demo on homepage |
| `ADMIN_PASSWORD` | No | Password for admin dashboard + flow builder |
| `OPENAI_API_KEY` | No | Enables AI flow generation + smart reply parsing |
| `DEBUG` | No | Set `true` for verbose logging |

## Database setup

1. Create a Neon project at https://console.neon.tech
2. Copy the connection string into `DATABASE_URL`
3. Run `sql/schema.sql` in the Neon SQL Editor
4. Run `migrations/002_flow_engine.sql` to add flow engine columns

## Features

### Custom Flow Builder (`/flow-builder.html`)
- Visual drag-drop node editor for SMS qualification flows
- 6 industry templates (dental, plumbing, electrical, HVAC, legal, general)
- AI-powered flow generation — describe a business and get custom questions
- Per-step urgent value triggers (e.g. "Emergency" sends instant alert to owner)
- Live SMS preview as you build
- Free-text step support for open-ended questions

### AI Smart Replies
- When `OPENAI_API_KEY` is set, leads can reply in natural language
- AI interprets "my pipe burst and I need someone now" → maps to option A (Emergency)
- Falls back to structured validation if AI is unavailable

### Integration Webhooks
- **Podium:** `POST /api/webhook/podium/:businessId` — catches Podium webchat leads
- **Generic:** `POST /api/webhook/generic/:businessId` — works with any platform (Zapier, ServiceTitan, Housecall Pro, Jobber)
- Built-in 30-minute de-duplication prevents double SMS

### Edge Case Handling
- Rate limiting on demo endpoint (2 per hour per phone)
- Lead de-duplication (30-minute window)
- STOP/UNSUBSCRIBE keyword handling
- Graceful fallback to industry template if no custom flow set

## Admin Dashboard (`/admin.html`)

Password-protected. Manage businesses, view leads, and access the flow builder.

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set environment variables in Vercel dashboard → Settings → Environment Variables.

Set Twilio inbound SMS webhook to: `https://your-app.vercel.app/api/sms/inbound`

## API

### Core
- `GET /health`
- `POST /api/lead` — Create lead + start SMS flow
- `POST /api/sms/inbound` — Twilio webhook (receives replies)
- `POST /api/website-inquiry` — Marketing site contact form
- `POST /api/demo` — Send demo SMS flow to a phone number

### Admin
- `POST /api/admin/auth` — Authenticate with admin password
- `GET /api/admin/businesses` — List all businesses
- `POST /api/admin/businesses` — Create a business
- `GET /api/admin/leads` — List all leads with business info

### Flow Management
- `GET /api/admin/businesses/:id/flow` — Get flow config for a business
- `PUT /api/admin/businesses/:id/flow` — Save custom flow config
- `GET /api/admin/industries` — List available industry templates
- `GET /api/admin/industries/:id/template` — Get a specific template
- `POST /api/admin/ai/generate-flow` — AI-generate a flow for an industry

### Integration Webhooks
- `POST /api/webhook/podium/:businessId` — Podium webchat lead intake
- `POST /api/webhook/generic/:businessId` — Generic lead intake (any platform)

## Podium Integration Setup

Add this to the business's website alongside their Podium webchat widget:

```html
<script>
window.PodiumEventsCallback = function(event, properties) {
  if (event === 'Conversation Started') {
    fetch('https://your-app.vercel.app/api/webhook/podium/BUSINESS_ID', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: properties['customer-name'],
        customerPhone: properties['customer-phone'],
        customerMessage: properties['customer-message']
      })
    });
  }
};
</script>
```

## Notes

- Use E.164 phone format (`+614...`) for reliable matching.
- Twilio enforces SMS compliance; STOP/UNSUBSCRIBE handling is built in.
- Flow config is stored as JSONB on the businesses table — no separate flows table needed.
- The old hardcoded dental flow in `src/flow.js` is preserved but no longer used by the server.
