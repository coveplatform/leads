import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  debug: String(process.env.DEBUG || "false").toLowerCase() === "true",
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "+61",

  twilio: {
    get accountSid() { return process.env.TWILIO_ACCOUNT_SID || ""; },
    get authToken() { return process.env.TWILIO_AUTH_TOKEN || ""; },
  },

  get databaseUrl() { return process.env.DATABASE_URL || ""; },
};
