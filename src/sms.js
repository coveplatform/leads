import twilio from "twilio";
import { config } from "./config.js";

let _client = null;
function getClient() {
  if (!_client) _client = twilio(config.twilio.accountSid, config.twilio.authToken);
  return _client;
}

export async function sendSms({ from, to, body }) {
  if (!from || !to || !body) {
    throw new Error("sendSms requires from, to, and body");
  }
  return getClient().messages.create({ from, to, body });
}
