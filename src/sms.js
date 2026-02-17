import twilio from "twilio";
import { config } from "./config.js";

const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

export async function sendSms({ from, to, body }) {
  if (!from || !to || !body) {
    throw new Error("sendSms requires from, to, and body");
  }

  return twilioClient.messages.create({
    from,
    to,
    body,
  });
}
