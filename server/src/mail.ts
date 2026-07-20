/* Mail transport for email verification, password resets, and study reminders.
   Default (dev) transport prints the link to the server log so the flow is
   fully testable without credentials. When SMTP_HOST is set, a real nodemailer
   transport is used to send mail through the configured SMTP server. */
import nodemailer from "nodemailer";
import { log } from "./logger";

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";
const mailLog = log.child({ sub: "mail" });

/* Lazily-created SMTP transport — only initialized when SMTP_HOST is set. */
let transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
    });
    mailLog.info({ host: process.env.SMTP_HOST }, "SMTP transport initialized");
  }
  return transport;
}

const FROM = process.env.SMTP_FROM || '"TUNNELCRAFT" <noreply@tunnelcraft.org>';

async function send(to: string, subject: string, text: string): Promise<string> {
  const t = getTransport();
  if (!t) {
    mailLog.warn("SMTP configured but transport not wired — see server/src/mail.ts");
    return text; // dev fallback: return the link so tests can verify
  }
  await t.sendMail({ from: FROM, to, subject, text });
  return text;
}

export async function sendVerifyMail(email: string, token: string): Promise<string> {
  const link = BASE_URL + "/#verify=" + token;
  if (!process.env.SMTP_HOST) {
    mailLog.info({ to: email, kind: "verify", link }, "dev transport: verification link");
    return link;
  }
  return send(email, "Verify your TUNNELCRAFT email", link);
}

export async function sendReminderMail(email: string, dueCards: number): Promise<string> {
  const link = BASE_URL + "/";
  if (!process.env.SMTP_HOST) {
    mailLog.info(
      { to: email, kind: "reminder", dueCards, link },
      "dev transport: study reminder" + (dueCards > 0 ? " (" + dueCards + " review cards due)" : "")
    );
    return link;
  }
  const body =
    dueCards > 0
      ? "You have " + dueCards + " review cards due. " + link
      : "Keep your streak going! " + link;
  return send(email, "TUNNELCRAFT study reminder", body);
}

export async function sendResetMail(email: string, token: string): Promise<string> {
  const link = BASE_URL + "/#reset=" + token;
  if (!process.env.SMTP_HOST) {
    mailLog.info({ to: email, kind: "reset", link }, "dev transport: reset link");
    return link;
  }
  return send(email, "Reset your TUNNELCRAFT password", link);
}
