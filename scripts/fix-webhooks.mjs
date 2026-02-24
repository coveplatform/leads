/**
 * fix-webhooks.mjs
 * Updates all Twilio numbers on the account to point to the correct
 * production SMS + voice webhook URLs.
 * Run: node scripts/fix-webhooks.mjs
 */
import dotenv from 'dotenv';
dotenv.config();
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const baseUrl = process.env.PRODUCTION_URL || 'https://leads-rho-six.vercel.app';
const smsUrl   = `${baseUrl}/api/sms/inbound`;
const voiceUrl = `${baseUrl}/api/voice/inbound`;

console.log(`\n── Cove Webhook Fixer ──`);
console.log(`Base URL : ${baseUrl}`);
console.log(`SMS URL  : ${smsUrl}`);
console.log(`Voice URL: ${voiceUrl}\n`);

const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
if (!numbers.length) { console.log('No numbers on account.'); process.exit(0); }

for (const num of numbers) {
  const needsFix = num.smsUrl !== smsUrl || num.voiceUrl !== voiceUrl;
  if (!needsFix) {
    console.log(`✅ ${num.phoneNumber} — already correct`);
    continue;
  }
  console.log(`🔧 Updating ${num.phoneNumber}…`);
  console.log(`   SMS  : ${num.smsUrl || '(none)'} → ${smsUrl}`);
  console.log(`   Voice: ${num.voiceUrl || '(none)'} → ${voiceUrl}`);
  await client.incomingPhoneNumbers(num.sid).update({
    smsUrl,
    smsMethod: 'POST',
    voiceUrl,
    voiceMethod: 'POST',
  });
  console.log(`   ✅ Done`);
}

console.log('\n✅ All numbers updated.');
