import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  debug: String(process.env.DEBUG || "false").toLowerCase() === "true",
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "+61",

  get baseUrl() {
    return process.env.BASE_URL || `http://localhost:${this.port}`;
  },

  twilio: {
    get accountSid() { return process.env.TWILIO_ACCOUNT_SID || ""; },
    get authToken() { return process.env.TWILIO_AUTH_TOKEN || ""; },
  },

  google: {
    get clientId() { return process.env.GOOGLE_CLIENT_ID || ""; },
    get clientSecret() { return process.env.GOOGLE_CLIENT_SECRET || ""; },
  },

  stripe: {
    get secretKey() { return process.env.STRIPE_SECRET_KEY || ""; },
    get priceId() { return process.env.STRIPE_PRICE_ID || ""; },
    get webhookSecret() { return process.env.STRIPE_WEBHOOK_SECRET || ""; },
  },

  get jwtSecret() { return process.env.JWT_SECRET || "change-me-in-production"; },
  get databaseUrl() { return process.env.DATABASE_URL || ""; },
  get openaiApiKey() { return process.env.OPENAI_API_KEY || ""; },
};
