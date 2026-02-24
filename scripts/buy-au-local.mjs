import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import twilio from 'twilio';

const sql = neon(process.env.DATABASE_URL);
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const WEBHOOK = 'https://leads-rho-six.vercel.app/api/sms/inbound';
const ADDRESS_SID = 'AD3183d4f716df6ca98e9843d18f4e6feb';
const BIZ_ID = 'ed0df4bb-fbb2-4b7f-a986-3e84121a8198'; // Big Jims Plumbing

// Try different AU area codes for local numbers
const areaCodes = ['03', '02', '07', '08'];
let available = [];

for (const area of areaCodes) {
  try {
    const list = await client.availablePhoneNumbers('AU').local.list({ smsEnabled: true, areaCode: area, limit: 5 });
    if (list.length) { available = list; console.log(`Found ${list.length} AU local numbers with area code ${area}`); break; }
  } catch(e) { console.log(`Area ${area} failed:`, e.message); }
}

// Try without area code filter
if (!available.length) {
  try {
    available = await client.availablePhoneNumbers('AU').local.list({ smsEnabled: true, limit: 10 });
    console.log('AU local (no filter):', available.map(n => n.phoneNumber));
  } catch(e) { console.log('AU local failed:', e.message); }
}

if (!available.length) {
  console.log('No AU local numbers available at all.');
  process.exit(1);
}

const pick = available[0];
console.log('Buying:', pick.phoneNumber);

try {
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: pick.phoneNumber,
    smsUrl: WEBHOOK,
    smsMethod: 'POST',
    addressSid: ADDRESS_SID
  });
  console.log('Bought AU local:', purchased.phoneNumber);

  // Release the US number first
  const nums = await client.incomingPhoneNumbers.list();
  const usNum = nums.find(n => n.phoneNumber === '+15153164854');
  if (usNum) {
    await client.incomingPhoneNumbers(usNum.sid).remove();
    console.log('Released US number +15153164854');
  }

  await sql`UPDATE businesses SET twilio_from_number = ${purchased.phoneNumber} WHERE id = ${BIZ_ID}`;
  console.log('Done! Big Jims Plumbing now has:', purchased.phoneNumber);
} catch(e) {
  console.log('Purchase failed:', e.message);
}
