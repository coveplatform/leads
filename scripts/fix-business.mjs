import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Assign the purchased AU number to Big Jim Plumbing (user_id 4)
await sql`
  UPDATE businesses
  SET twilio_from_number = '+61468082559',
      is_active = true
  WHERE user_id = 4
`;

// Mark onboarding complete
await sql`
  UPDATE users
  SET onboarding_complete = true,
      subscription_status = 'active'
  WHERE id = 4
`;

console.log('Done — Big Jim Plumbing now has +61468082559');

// Verify
const rows = await sql`SELECT name, twilio_from_number, is_active FROM businesses WHERE user_id = 4`;
console.log(JSON.stringify(rows[0]));
