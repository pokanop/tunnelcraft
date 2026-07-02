/* Mail transport for password resets.
   Default (dev) transport prints the reset link to the server log so the flow is
   fully testable without credentials. To send real mail, set SMTP_* env vars and
   swap sendMail's body for nodemailer (or Resend/Postmark) — this is the only file
   that changes. */
import { log } from "./logger.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const mailLog = log.child({ sub: "mail" });

export async function sendVerifyMail(email, token) {
  const link = BASE_URL + "/#verify=" + token;
  if (process.env.SMTP_HOST) {
    mailLog.warn("SMTP configured but transport not wired — see server/src/mail.js");
  }
  mailLog.info({ to: email, kind: "verify", link }, "dev transport: verification link");
  return link;
}

export async function sendResetMail(email, token) {
  const link = BASE_URL + "/#reset=" + token;
  if (process.env.SMTP_HOST) {
    // Placeholder for a real transport:
    //   import nodemailer from "nodemailer";
    //   const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, ... });
    //   await t.sendMail({ to: email, subject: "Reset your TUNNELCRAFT password", text: link });
    mailLog.warn("SMTP configured but transport not wired — see server/src/mail.js");
  }
  mailLog.info({ to: email, kind: "reset", link }, "dev transport: reset link");
  return link;
}
