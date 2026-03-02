import 'dotenv/config';
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const numbers = await client.incomingPhoneNumbers.list();
for (const n of numbers) {
  console.log(`\n${n.phoneNumber} (${n.sid})`);
  console.log(`  smsUrl:   ${n.smsUrl}`);
  console.log(`  voiceUrl: ${n.voiceUrl}`);
  console.log(`  statusCallback: ${n.statusCallback}`);
}
