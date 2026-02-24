import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import twilio from 'twilio';

const sql = neon(process.env.DATABASE_URL);
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const WEBHOOK = 'https://leads-rho-six.vercel.app/api/sms/inbound';
const BIZ_ID = 'ed0df4bb-fbb2-4b7f-a986-3e84121a8198';

const available = await client.availablePhoneNumbers('US').local.list({ smsEnabled: true, limit: 1 });
const purchased = await client.incomingPhoneNumbers.create({
  phoneNumber: available[0].phoneNumber,
  smsUrl: WEBHOOK,
  smsMethod: 'POST'
});
console.log('Bought:', purchased.phoneNumber);

await sql`UPDATE businesses SET twilio_from_number = ${purchased.phoneNumber}, is_active = true WHERE id = ${BIZ_ID}`;
console.log('Assigned to Big Jims Plumbing. Done.');
