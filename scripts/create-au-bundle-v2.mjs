import 'dotenv/config';
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Clean up old draft bundle first
try {
  await client.numbers.v2.regulatoryCompliance.bundles('BUa4d192a4f8ff91c565d70c41cf6a7ec7').remove();
  console.log('Removed old bundle');
} catch(e) { console.log('No old bundle to remove:', e.message); }

// Step 1: Create bundle
const bundle = await client.numbers.v2.regulatoryCompliance.bundles.create({
  friendlyName: 'Cove AU Mobile Bundle',
  email: 'kris.engelhardt4@gmail.com',
  isoCountry: 'AU',
  numberType: 'mobile',
  endUserType: 'business',
});
console.log('Bundle:', bundle.sid, bundle.status);

// Step 2: Create end user
const endUser = await client.numbers.v2.regulatoryCompliance.endUsers.create({
  friendlyName: 'Cove Platform Pty Ltd',
  type: 'business',
  attributes: {
    business_name: 'Cove Platform',
    first_name: 'Kris',
    last_name: 'Engelhardt',
    email: 'kris.engelhardt4@gmail.com',
    phone_number: '+61403720218',
    business_registration_number: '',
  }
});
console.log('End user:', endUser.sid);

// Step 3: Assign end user to bundle
await client.numbers.v2.regulatoryCompliance.bundles(bundle.sid)
  .itemAssignments.create({ objectSid: endUser.sid });
console.log('End user assigned');

// Step 4: Create a supporting document using the existing address
const doc = await client.numbers.v2.regulatoryCompliance.supportingDocuments.create({
  friendlyName: 'Cove Business Address',
  type: 'business_address',  // standard type
  attributes: {
    address_sids: 'AD3183d4f716df6ca98e9843d18f4e6feb',
  }
});
console.log('Supporting doc:', doc.sid, doc.status);

// Step 5: Assign document to bundle
await client.numbers.v2.regulatoryCompliance.bundles(bundle.sid)
  .itemAssignments.create({ objectSid: doc.sid });
console.log('Document assigned');

// Step 6: Evaluate before submitting
const evaluation = await client.numbers.v2.regulatoryCompliance.bundles(bundle.sid)
  .evaluations.create();
console.log('Evaluation status:', evaluation.status);
console.log('Evaluation results:', JSON.stringify(evaluation.results?.slice(0,5), null, 2));

if (evaluation.status === 'compliant') {
  const submitted = await client.numbers.v2.regulatoryCompliance.bundles(bundle.sid)
    .update({ status: 'pending-review' });
  console.log('SUBMITTED for review. Status:', submitted.status);
  console.log('Bundle SID:', bundle.sid);
  console.log('\nSave this bundle SID — add it to .env as TWILIO_BUNDLE_SID');
} else {
  console.log('Not compliant yet. Bundle SID:', bundle.sid);
  console.log('Check: https://console.twilio.com/us1/develop/phone-numbers/regulatory-compliance/bundles/' + bundle.sid);
}
