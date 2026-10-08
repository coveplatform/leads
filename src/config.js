import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  debug: String(process.env.DEBUG || "false").toLowerCase() === "true",
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "+61",

  get baseUrl() {
    return process.env.BASE_URL || `http://localhost:${this.port}`;
  },

  // The public URL Twilio calls. Locally BASE_URL is localhost, which Twilio
  // can't reach, so fall back to the production domain for webhook URLs and
  // signature validation.
  get publicBaseUrl() {
    const raw = (process.env.BASE_URL || "").trim();
    if (!raw || raw.startsWith("http://localhost") || raw.startsWith("http://127")) {
      return (process.env.PRODUCTION_URL || "https://usecove.app").trim();
    }
    return raw;
  },

  twilio: {
    get accountSid() { return process.env.TWILIO_ACCOUNT_SID || ""; },
    get authToken() { return process.env.TWILIO_AUTH_TOKEN || ""; },
  },

  // Optional alerts to Kris (website enquiries). `from` is any Cove Twilio number.
  adminAlert: {
    get to() { return process.env.ADMIN_ALERT_PHONE || ""; },
    get from() { return process.env.ADMIN_ALERT_FROM || ""; },
    get email() { return process.env.ADMIN_ALERT_EMAIL || "hello@usecove.app"; },
  },

  get jwtSecret() { return process.env.JWT_SECRET || "change-me-in-production"; },
  get databaseUrl() { return process.env.DATABASE_URL || ""; },
};
