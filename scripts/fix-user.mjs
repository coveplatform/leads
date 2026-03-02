import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
// Show all recent users + their businesses
const users = await sql`
  SELECT u.id, u.email, u.onboarding_complete, u.subscription_status,
         b.id as biz_id, b.name as biz_name, b.twilio_from_number, b.is_active
  FROM users u
  LEFT JOIN businesses b ON b.user_id = u.id
  ORDER BY u.created_at DESC
  LIMIT 10
`;
console.table(users);
