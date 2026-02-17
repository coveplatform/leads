import dotenv from "dotenv";

dotenv.config();

function getEnv(name, required = true) {
  const value = process.env[name];
  if (required && (!value || value.trim() === "")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  debug: String(process.env.DEBUG || "false").toLowerCase() === "true",
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || "+61",

  twilio: {
    accountSid: getEnv("TWILIO_ACCOUNT_SID"),
    authToken: getEnv("TWILIO_AUTH_TOKEN"),
  },

  databaseUrl: getEnv("DATABASE_URL"),
};
