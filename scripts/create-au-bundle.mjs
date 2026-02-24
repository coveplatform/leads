import 'dotenv/config';
import twilio from 'twilio';
import { neon } from '@neondatabase/serverless';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const sql = neon(process.env.DATABASE_URL);

const ADDRESS_SID = 'AD3183d4f716df6ca98e9843d18f4e6feb';
const WEBHOOK = 'https://leads-rho-six.vercel.app/api/sms/inbound';
const BIZ_ID = 'ed0df4bb-fbb2-4b7f-a986-3e84121a8198';

// Step 1: Create a regulatory bundle for AU mobile
console.log('Creating regulatory bundle...');
let bundle;
try {
  bundle = await client.numbers.v2.regulatoryCompliance.bundles.create({
    friendlyName: 'Cove AU Mobile Bundle',
    email: 'kris.engelhardt4@gmail.com',
    isoCountry: 'AU',
    numberType: 'mobile',
    endUserType: 'business',
  });
  console.log('Bundle created:', bundle.sid, 'Status:', bundle.status);
} catch(e) {
  console.log('Bundle creation failed:', e.message);
  process.exit(1);
}

// Step 2: Create end user (business)
console.log('Creating end user...');
let endUser;
try {
  endUser = await client.numbers.v2.regulatoryCompliance.endUsers.create({
    friendlyName: 'Cove Platform',
    type: 'business',
    attributes: {
      business_name: 'Cove Platform',
      business_registration_number: '',
      first_name: 'Kris',
      last_name: 'Engelhardt',
      email: 'kris.engelhardt4@gmail.com',
      phone_number: '+61403720218',
    }
  });
  console.log('End user created:', endUser.sid);
} catch(e) {
  console.log('End user failed:', e.message);
}

// Step 3: Assign end user to bundle
if (endUser) {
  try {
    await client.numbers.v2.regulatoryCompliance.bundles(bundle.sid)
      .itemAssignments.create({ objectSid: endUser.sid });
    console.log('End user assigned to bundle');
  } catch(e) { console.log('End user assignment failed:', e.message); }
}

// Step 4: Assign address to bundle
try {
  await client.numbers.v2.regulatoryCompliance.bundles(bundle.sid)
    .itemAssignments.create({ objectSid: ADDRESS_SID });
  console.log('Address assigned to bundle');
} catch(e) { console.log('Address assignment failed:', e.message); }

// Step 5: Submit bundle for review
console.log('Submitting bundle for review...');
try {
  const submitted = await client.numbers.v2.regulatoryCompliance.bundles(bundle.sid)
    .update({ status: 'pending-review' });
  console.log('Bundle submitted. Status:', submitted.status);
  console.log('Bundle SID:', bundle.sid);
  console.log('\nTwilio will review this in 1-2 business days.');
  console.log('Once approved, run buy-au-mobile.mjs to purchase an AU number.');
} catch(e) { console.log('Submit failed:', e.message); }
