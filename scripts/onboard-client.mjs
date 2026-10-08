// Onboard a client from a config file. Kris runs this; there is no signup.
//
//   node scripts/onboard-client.mjs clients/dave-plumbing.json            full onboarding
//   node scripts/onboard-client.mjs clients/dave-plumbing.json --dry-run  steps 1–3 only (DB, no Twilio, no SMS)
//   node scripts/onboard-client.mjs clients/dave-plumbing.json --update   re-apply flow/hours/alerts to an existing client
//
// Safe to re-run: each step is skipped when it's already done (user exists,
// business exists, number attached, welcome sent). See clients/example.json.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { config } from "../src/config.js";
import { hashPassword } from "../src/auth.js";
import {
  getUserByEmail,
  createUser,
  getBusinessByUserId,
  createBusiness,
  updateBusiness,
  updateBusinessExtras,
  getAppliedMigrations,
} from "../src/db.js";
import {
  validateClientConfig,
  buildFlowConfig,
  buildOperatingHours,
  buildIntegrations,
  buildSettings,
  generatePassword,
} from "../src/services/onboarding.js";
import { provisionNumber, attachExistingNumber } from "../src/services/twilio-numbers.js";
import { forwardingCodes, dialLink } from "../src/services/forwarding.js";
import { normalizePhone, formatPhoneDisplay } from "../src/phone.js";
import { sendSms } from "../src/sms.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const updateOnly = args.includes("--update");

const step = (n, msg) => console.log(`\n${n}. ${msg}`);
const fail = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };

if (!file) fail("Usage: node scripts/onboard-client.mjs <config.json> [--dry-run | --update]");
if (!config.databaseUrl) fail("DATABASE_URL is not set");

let cfg;
try {
  cfg = JSON.parse(await readFile(file, "utf8"));
} catch (err) {
  fail(`Can't read ${file}: ${err.message}`);
}

// ── 1. Validate ──
step(1, "Checking the config");
const { errors, warnings } = validateClientConfig(cfg);
warnings.forEach((w) => console.log(`   ⚠ ${w}`));
if (errors.length) fail(`Config problems:\n   - ${errors.join("\n   - ")}`);
const applied = await getAppliedMigrations();
if (!applied.includes("012_core_loop.sql")) fail("Run `node scripts/migrate.mjs` first (migration 012 is missing).");
console.log("   ✓ config OK");

const b = cfg.business;
const loginEmail = String(cfg.login?.email || b.owner_email).toLowerCase().trim();
const ownerPhone = normalizePhone(b.owner_phone);
const businessFields = {
  name: b.name,
  industry: b.industry,
  flowConfig: buildFlowConfig(cfg),
  operatingHours: buildOperatingHours(cfg),
  ownerNotifyPhone: ownerPhone,
  ownerNotifyEmail: cfg.notifications?.email ? b.owner_email : null,
  avgJobValue: b.avg_job_value ?? null,
};

// ── 2. User ──
step(2, `Owner login (${loginEmail})`);
let user = await getUserByEmail(loginEmail);
let tempPassword = null;
if (user) {
  console.log("   ✓ already exists — password unchanged");
} else if (updateOnly) {
  fail(`No user ${loginEmail}; run without --update to onboard them.`);
} else {
  tempPassword = cfg.login?.temp_password && cfg.login.temp_password !== "generate"
    ? cfg.login.temp_password
    : generatePassword();
  user = await createUser({ email: loginEmail, passwordHash: await hashPassword(tempPassword), name: b.owner_name || null });
  console.log("   ✓ created");
}

// ── 3. Business ──
step(3, `Business (${b.name})`);
let business = await getBusinessByUserId(user.id);
if (business) {
  business = await updateBusiness(business.id, {
    ...businessFields,
    integrations: buildIntegrations(cfg, business.integrations || {}),
  });
  console.log(`   ✓ updated ${business.id}`);
} else if (updateOnly) {
  fail(`${loginEmail} has no business; run without --update.`);
} else {
  business = await createBusiness({
    ...businessFields,
    userId: user.id,
    isActive: true,
    integrations: buildIntegrations(cfg),
  });
  console.log(`   ✓ created ${business.id}`);
}
business = await updateBusinessExtras(business.id, {
  settings: buildSettings(cfg, business.settings || {}),
  reviewLink: b.review_link || undefined,
});

if (updateOnly || dryRun) {
  if (tempPassword) console.log(`\n   Temp password (shown once): ${tempPassword}`);
  console.log(`\n${dryRun ? "Dry run: stopped before Twilio." : "Updated."} Business id: ${business.id}`);
  process.exit(0);
}

// ── 4. Twilio number ──
step(4, "Cove number");
if (business.twilio_from_number) {
  console.log(`   ✓ already has ${formatPhoneDisplay(business.twilio_from_number)}`);
} else {
  const existing = cfg.twilio?.existing_number ? normalizePhone(cfg.twilio.existing_number) : null;
  const number = existing
    ? await attachExistingNumber(business.id, existing)
    : await provisionNumber(business.id, { areaCode: cfg.twilio?.area_code });
  if (!number) fail("Couldn't get a Twilio number. Check TWILIO_* / TWILIO_BUNDLE_SID and try again; the business is saved, so re-running picks up here.");
  business.twilio_from_number = number;
  console.log(`   ✓ ${formatPhoneDisplay(number)} (${number}) — webhooks point at ${config.publicBaseUrl}`);
}

// ── 5. Forwarding instructions ──
step(5, "Call forwarding for the owner's mobile (Telstra, Optus, Vodafone)");
const codes = forwardingCodes(business.twilio_from_number);
console.log(`   On ${formatPhoneDisplay(ownerPhone)}, dial:`);
console.log(`     ${codes.noAnswer}   forward when not answered (rings 20s first)   ${dialLink(codes.noAnswer)}`);
console.log(`     ${codes.busy}        forward when busy                             ${dialLink(codes.busy)}`);
console.log(`     ${codes.unreachable}        forward when off / no signal                 ${dialLink(codes.unreachable)}`);
console.log(`   To undo all forwarding: ${codes.cancelAll}`);
console.log("   Optus: if calls still go to voicemail, Message Bank is answering first — turn it off in My Optus.");
console.log("   Then ring the owner's mobile from another phone, let it ring out, and check the lead appears.");

// ── 6. Welcome SMS ──
step(6, "Welcome text to the owner");
if (business.settings?.welcome_sent_at) {
  console.log("   ✓ already sent");
} else {
  const body = [
    `Hi ${b.owner_name || "there"}, Cove is set up for ${b.name}.`,
    `Your Cove number is ${formatPhoneDisplay(business.twilio_from_number)}. Missed calls get a text from it within seconds, and you'll get the details here.`,
    `Turn on forwarding by tapping: ${dialLink(codes.noAnswer)}`,
    `Your leads: ${config.baseUrl}/login (${loginEmail}). Kris will text you your password.`,
  ].join("\n\n");
  await sendSms({ from: business.twilio_from_number, to: ownerPhone, body });
  await updateBusinessExtras(business.id, { settings: { ...(business.settings || {}), welcome_sent_at: new Date().toISOString() } });
  console.log("   ✓ sent");
}

console.log(`\n✓ ${b.name} is live. Business id: ${business.id}`);
if (tempPassword) console.log(`\n  Temp password (shown once — text it to ${b.owner_name || "the owner"}): ${tempPassword}`);
