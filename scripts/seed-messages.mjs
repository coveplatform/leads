// Re-seed messages for Engelhardt Plumbing leads
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = "postgresql://neondb_owner:npg_Vrj4hJaGcb7K@ep-winter-shadow-a71powui-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

// Check what we have
const businesses = await sql`SELECT id, name FROM businesses WHERE name ILIKE '%engelhardt%'`;
console.log("Businesses:", businesses);

if (!businesses.length) {
  console.log("No Engelhardt business found. Creating...");
  // Find user first
  const users = await sql`SELECT id, email FROM users WHERE email ILIKE '%kris%engelhardt%' OR email ILIKE '%kris.engelhardt%'`;
  console.log("Users:", users);
  if (!users.length) { console.log("No user found"); process.exit(1); }
}

const biz = businesses[0];
console.log("Using business:", biz.id, biz.name);

// Get all leads for this business
const leads = await sql`SELECT id, phone, name, status, created_at FROM leads WHERE business_id = ${biz.id} ORDER BY created_at DESC`;
console.log(`Found ${leads.length} leads`);

// Check messages
for (const lead of leads) {
  const msgs = await sql`SELECT COUNT(*) as cnt FROM messages WHERE lead_id = ${lead.id}`;
  console.log(`Lead ${lead.id} (${lead.name || lead.phone}): ${msgs[0].cnt} messages`);
}

// ─── Plumbing conversations per lead ───
const conversations = [
  // Lead 0: completed, burst pipe
  [
    { dir: 'outbound', body: "Hi, thanks for calling Engelhardt Plumbing! We missed your call but we're here now — what can we help with?" },
    { dir: 'inbound', body: "Hi yeah I've got a burst pipe under the kitchen sink, water is going everywhere" },
    { dir: 'outbound', body: "Oh no, that sounds urgent! Is the water still running or have you been able to turn off the mains?" },
    { dir: 'inbound', body: "I turned off the mains thank god. But the kitchen is soaked" },
    { dir: 'outbound', body: "Good thinking. We can get someone out today — what suburb are you in?" },
    { dir: 'inbound', body: "Mosman" },
    { dir: 'outbound', body: "Perfect, we cover Mosman. Can I grab your address?" },
    { dir: 'inbound', body: "14 Raglan St" },
    { dir: 'system', body: "✓ Lead completed — summary sent to owner" },
  ],
  // Lead 1: completed, hot water
  [
    { dir: 'outbound', body: "Hi! Engelhardt Plumbing here — sorry we missed your call. What's going on?" },
    { dir: 'inbound', body: "My hot water system has stopped working, no hot water at all since this morning" },
    { dir: 'outbound', body: "That's no good! Do you know what type of system you have — gas, electric, or solar?" },
    { dir: 'inbound', body: "I think it's gas. It's pretty old, maybe 15 years" },
    { dir: 'outbound', body: "At 15 years it's likely at end of life. We can come assess and give you a quote. What area are you in?" },
    { dir: 'inbound', body: "Cremorne" },
    { dir: 'outbound', body: "Great, we're in Cremorne regularly. Can you give me a rough idea of when you're available tomorrow?" },
    { dir: 'inbound', body: "Morning would be best, before 11am" },
    { dir: 'system', body: "✓ Lead completed — summary sent to owner" },
  ],
  // Lead 2: completed, blocked drain
  [
    { dir: 'outbound', body: "Hey, Engelhardt Plumbing! Missed your call — what can we help with today?" },
    { dir: 'inbound', body: "Blocked drain in the bathroom, the shower just fills up and drains super slowly" },
    { dir: 'outbound', body: "Classic slow drain — probably hair and soap buildup. How long has it been like this?" },
    { dir: 'inbound', body: "About 2 weeks now, getting worse" },
    { dir: 'outbound', body: "We can sort that. Are you available this week for a quick visit?" },
    { dir: 'inbound', body: "Wednesday afternoon would work" },
    { dir: 'outbound', body: "Wednesday afternoon it is. What's the address?" },
    { dir: 'inbound', body: "8 Holt Ave, Neutral Bay" },
    { dir: 'system', body: "✓ Lead completed — summary sent to owner" },
  ],
  // Lead 3: completed, leaking toilet
  [
    { dir: 'outbound', body: "Hi there, Engelhardt Plumbing — thanks for reaching out! What's the issue?" },
    { dir: 'inbound', body: "My toilet keeps running, like the cistern won't stop filling" },
    { dir: 'outbound', body: "That's a common issue — usually the fill valve or flapper needs replacing. Easy fix. Where are you located?" },
    { dir: 'inbound', body: "Crows Nest" },
    { dir: 'outbound', body: "We can pop over this week. Does Thursday morning work?" },
    { dir: 'inbound', body: "Yes perfect" },
    { dir: 'system', body: "✓ Lead completed — summary sent to owner" },
  ],
  // Lead 4: active (mid-conversation)
  [
    { dir: 'outbound', body: "Hi! Engelhardt Plumbing here. Sorry we missed you — what did you need help with?" },
    { dir: 'inbound', body: "Water pressure in my shower is really low, barely a trickle" },
    { dir: 'outbound', body: "Low pressure can be a few things — blocked showerhead, pressure regulator, or supply issue. Has it been gradual or sudden?" },
    { dir: 'inbound', body: "Started about a week ago, getting worse" },
    { dir: 'outbound', body: "Sounds like it could be a partially closed valve or regulator issue. What suburb are you in so we can book someone?" },
  ],
  // Lead 5: completed, leaking tap
  [
    { dir: 'outbound', body: "Engelhardt Plumbing — we saw your missed call! What's the problem?" },
    { dir: 'inbound', body: "I've got a dripping tap in the laundry, it's constant" },
    { dir: 'outbound', body: "A dripping tap wastes a lot of water over time. Is it hot, cold, or the mixer?" },
    { dir: 'inbound', body: "The cold tap, just drip drip drip all day" },
    { dir: 'outbound', body: "Easy fix — usually just a washer. We can squeeze it in this week. Whereabouts are you?" },
    { dir: 'inbound', body: "St Leonards" },
    { dir: 'outbound', body: "Perfect. I'll put you in for Friday morning — does that work?" },
    { dir: 'inbound', body: "Friday morning is great, thanks!" },
    { dir: 'system', body: "✓ Lead completed — summary sent to owner" },
  ],
  // Lead 6: abandoned (stopped responding)
  [
    { dir: 'outbound', body: "Hi there! Engelhardt Plumbing here — missed your call. What's happening?" },
    { dir: 'inbound', body: "Hot water is cold" },
    { dir: 'outbound', body: "Not ideal! Is this just one tap or the whole house?" },
    { dir: 'inbound', body: "Whole house" },
    { dir: 'outbound', body: "Sounds like the system has gone out. What type of hot water do you have — gas, electric, or solar?" },
  ],
  // Lead 7: completed, gas leak concern
  [
    { dir: 'outbound', body: "Hi, Engelhardt Plumbing here — glad you called. What can we help with?" },
    { dir: 'inbound', body: "I can smell gas near my stove, pretty worried about it" },
    { dir: 'outbound', body: "That needs to be looked at right away. Have you turned off the gas at the meter?" },
    { dir: 'inbound', body: "Yes I turned it off and opened windows" },
    { dir: 'outbound', body: "Good — that's the right thing to do. We can get a licensed gas fitter to you urgently. What's your address?" },
    { dir: 'inbound', body: "22 Willoughby Rd, Naremburn" },
    { dir: 'outbound', body: "We're sending someone now — should be there within the hour." },
    { dir: 'system', body: "⚡ Urgent lead — owner notified immediately" },
  ],
  // Lead 8: stopped (opted out)
  [
    { dir: 'outbound', body: "Hi! Engelhardt Plumbing here, saw your missed call. What do you need?" },
    { dir: 'inbound', body: "STOP" },
    { dir: 'outbound', body: "No worries — you've been unsubscribed. Feel free to call us directly on (02) 9XXX XXXX if you need us." },
  ],
  // Lead 9: completed, water hammer
  [
    { dir: 'outbound', body: "Hey! Engelhardt Plumbing — missed your call. What's the issue?" },
    { dir: 'inbound', body: "There's a loud banging noise in the pipes whenever I turn a tap on or off" },
    { dir: 'outbound', body: "That's water hammer — it happens when water flow is suddenly stopped. It's fixable. How bad is it?" },
    { dir: 'inbound', body: "Pretty loud, shakes the walls. My neighbour has complained" },
    { dir: 'outbound', body: "Ha, yeah it can be dramatic! We can install hammer arrestors to fix it. What area are you in?" },
    { dir: 'inbound', body: "Kirribilli" },
    { dir: 'outbound', body: "Kirribilli is easy for us. Can you do next Tuesday?" },
    { dir: 'inbound', body: "Yes Tuesday works, any time after 10am" },
    { dir: 'system', body: "✓ Lead completed — summary sent to owner" },
  ],
];

// Insert messages for each lead
for (let i = 0; i < leads.length; i++) {
  const lead = leads[i];
  const convo = conversations[i % conversations.length];

  // Check existing message count
  const existing = await sql`SELECT COUNT(*) as cnt FROM messages WHERE lead_id = ${lead.id}`;
  if (Number(existing[0].cnt) > 0) {
    console.log(`Lead ${i} (${lead.name || lead.phone}) already has ${existing[0].cnt} messages — skipping`);
    continue;
  }

  // Insert messages with staggered timestamps
  const baseTime = new Date(lead.created_at).getTime() + 2 * 60 * 1000; // 2 min after lead created
  for (let j = 0; j < convo.length; j++) {
    const msg = convo[j];
    const ts = new Date(baseTime + j * 90 * 1000); // 90 seconds apart
    await sql`
      INSERT INTO messages (lead_id, direction, body, created_at)
      VALUES (${lead.id}, ${msg.dir}, ${msg.body}, ${ts.toISOString()})
    `;
  }
  console.log(`Lead ${i} (${lead.name || lead.phone}): inserted ${convo.length} messages`);
}

console.log("\nDone!");
