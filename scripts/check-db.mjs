import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const businesses = await sql`SELECT id, name, twilio_from_number, is_active, user_id FROM businesses ORDER BY created_at DESC LIMIT 10`;
console.log('Businesses:');
businesses.forEach(r => console.log(' ', JSON.stringify(r)));

const users = await sql`SELECT id, email, onboarding_complete, subscription_status FROM users ORDER BY created_at DESC LIMIT 5`;
console.log('\nUsers:');
users.forEach(r => console.log(' ', JSON.stringify(r)));
