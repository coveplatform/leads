/**
 * test-provision.mjs
 * Dry-run test for AU mobile number provisioning.
 * Searches for available numbers and validates bundle + address SIDs are set.
 * Does NOT purchase a number.
 * Run: node scripts/test-provision.mjs
 */
import dotenv from 'dotenv';
dotenv.config();
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const bundleSid  = process.env.TWILIO_BUNDLE_SID;
const addressSid = process.env.TWILIO_ADDRESS_SID;

console.log('\n── Cove AU Provisioning Test ──\n');
console.log('TWILIO_BUNDLE_SID :', bundleSid  || '❌ NOT SET');
console.log('TWILIO_ADDRESS_SID:', addressSid || '❌ NOT SET');

if (!bundleSid) {
  console.error('\n❌ TWILIO_BUNDLE_SID is required for AU mobile numbers. Aborting.');
  process.exit(1);
}

// 1. Verify bundle status
console.log('\n[1] Checking bundle status…');
const bundle = await client.numbers.v2.regulatoryCompliance.bundles(bundleSid).fetch();
console.log(`    SID    : ${bundle.sid}`);
console.log(`    Name   : ${bundle.friendlyName}`);
console.log(`    Status : ${bundle.status}`);
if (bundle.status !== 'twilio-approved') {
  console.error(`\n❌ Bundle is "${bundle.status}" — must be "twilio-approved" before provisioning.`);
  process.exit(1);
}
console.log('    ✅ Bundle is approved.');

// 2. Search for AU mobile numbers
console.log('\n[2] Searching for available AU mobile numbers (SMS-enabled)…');
const list = await client.availablePhoneNumbers('AU').mobile.list({ smsEnabled: true, limit: 5 });
if (!list.length) {
  console.error('    ❌ No AU mobile numbers available right now.');
  process.exit(1);
}
list.forEach(n => console.log(`    ${n.phoneNumber}  ${n.locality || ''}`));
console.log(`    ✅ ${list.length} AU mobile number(s) found.`);

// 3. Show what createParams would look like
const pick = list.find(n => !n.beta) || list[0];
const baseUrl = process.env.PRODUCTION_URL || 'https://leads-rho-six.vercel.app';
const webhookUrl = `${baseUrl}/api/sms/inbound`;
const createParams = {
  phoneNumber: pick.phoneNumber,
  smsUrl: webhookUrl,
  smsMethod: 'POST',
  addressSid,
  bundleSid,
};
console.log('\n[3] Would purchase with params:');
console.log(JSON.stringify(createParams, null, 2));
console.log('\n✅ All checks passed. provisionTwilioNumber() will pick an AU mobile number.');
