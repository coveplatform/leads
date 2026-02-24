import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import twilio from 'twilio';

const sql = neon(process.env.DATABASE_URL);
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const WEBHOOK = 'https://leads-rho-six.vercel.app/api/sms/inbound';
const BIZ_ID = 'ed0df4bb-fbb2-4b7f-a986-3e84121a8198'; // Big Jims Plumbing
const US_SID = null; // already released

// 1. Release the US number
try {
  await client.incomingPhoneNumbers(US_SID).remove();
  console.log('Released US number +13612038587');
} catch(e) { console.log('Could not release US number:', e.message); }

// 2. Buy AU mobile
let purchased = null;
try {
  const available = await client.availablePhoneNumbers('AU').mobile.list({ smsEnabled: true, limit: 5 });
  console.log('AU mobile options:', available.map(n => n.phoneNumber));
  if (available.length) {
    purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: available[0].phoneNumber,
      smsUrl: WEBHOOK,
      smsMethod: 'POST',
      addressSid: 'AD3183d4f716df6ca98e9843d18f4e6feb'
    });
    console.log('Bought AU mobile:', purchased.phoneNumber);
  }
} catch(e) { console.log('AU mobile failed:', e.message); }

// 3. Fall back to AU local
if (!purchased) {
  try {
    const available = await client.availablePhoneNumbers('AU').local.list({ smsEnabled: true, limit: 5 });
    console.log('AU local options:', available.map(n => n.phoneNumber));
    if (available.length) {
      purchased = await client.incomingPhoneNumbers.create({
        phoneNumber: available[0].phoneNumber,
        smsUrl: WEBHOOK,
        smsMethod: 'POST',
        addressSid: 'AD3183d4f716df6ca98e9843d18f4e6feb'
      });
      console.log('Bought AU local:', purchased.phoneNumber);
    }
  } catch(e) { console.log('AU local failed:', e.message); }
}

if (purchased) {
  await sql`UPDATE businesses SET twilio_from_number = ${purchased.phoneNumber}, is_active = true WHERE id = ${BIZ_ID}`;
  console.log('Done! Assigned', purchased.phoneNumber, 'to Big Jims Plumbing');
} else {
  console.log('Could not purchase AU number.');
}
