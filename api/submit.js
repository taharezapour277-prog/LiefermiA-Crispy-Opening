import { Resend } from "resend";

const MAX_BODY_BYTES = 10 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Basic in-memory rate limit (best-effort on serverless).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label, value) {
  if (!value) return "";
  return `<tr><td style="padding:8px 12px;color:#536657;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(label)}</td><td style="padding:8px 12px;font-size:14px;color:#15351e;word-break:break-word;">${esc(value)}</td></tr>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const len = Number(req.headers["content-length"] || 0);
  if (len > MAX_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: "Payload too large." });
  }

  let body = req.body;
  try {
    if (typeof body === "string") body = JSON.parse(body);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON." });
  }
  body = body && typeof body === "object" ? body : {};
  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: "Payload too large." });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  if (rateLimited(ip)) {
    return res
      .status(429)
      .json({ ok: false, error: "Zu viele Anfragen. Bitte später erneut versuchen." });
  }

  const name = String(body.name || "").trim().slice(0, 100);
  const email = String(body.email || "").trim().slice(0, 254);
  const phone = String(body.phone || "").trim().slice(0, 30);
  const honeypot = String(body.company || body.website || "").trim();
  const startedAt = Number(body.startedAt || 0);

  // Honeypot: silently accept spam without sending mail.
  if (honeypot) return res.status(200).json({ ok: true });
  // Too-fast submit (<2s) = likely bot.
  if (startedAt && Date.now() - startedAt < 2000) {
    return res.status(200).json({ ok: true });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return res
      .status(400)
      .json({ ok: false, error: "Bitte gib eine gültige E-Mail-Adresse an." });
  }
  if (phone && !/^[+()\-.\s\d]{6,30}$/.test(phone)) {
    return res
      .status(400)
      .json({ ok: false, error: "Bitte gib eine gültige Telefonnummer an." });
  }

  const { RESEND_API_KEY, CONTACT_EMAIL, SENDER_EMAIL } = process.env;
  if (!RESEND_API_KEY || !CONTACT_EMAIL || !SENDER_EMAIL) {
    console.error("Missing env: RESEND_API_KEY, CONTACT_EMAIL, SENDER_EMAIL required.");
    return res
      .status(500)
      .json({ ok: false, error: "Server ist nicht konfiguriert. Bitte später erneut versuchen." });
  }

  const resend = new Resend(RESEND_API_KEY);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;">
<h2 style="color:#15351e;">Neue Rabatt-Anmeldung — Crispy Döner × LiefermiA</h2>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #dce5d5;border-radius:12px;overflow:hidden;width:100%;">
${row("Name", name || "—")}${row("E-Mail", email)}${row("Telefon", phone || "—")}
</table>
<p style="color:#536657;font-size:12px;">Gesendet am ${esc(new Date().toISOString())}</p></div>`;
  const text = `Neue Rabatt-Anmeldung\nName: ${name || "-"}\nE-Mail: ${email}\nTelefon: ${phone || "-"}\n`;

  try {
    const { error } = await resend.emails.send({
      from: SENDER_EMAIL,
      to: CONTACT_EMAIL,
      replyTo: email,
      subject: `Neue Rabatt-Anmeldung: ${email}`,
      html,
      text,
    });
    if (error) {
      console.error("Resend error:", error);
      return res
        .status(502)
        .json({ ok: false, error: "Versand fehlgeschlagen. Bitte erneut versuchen." });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Send failed:", err);
    return res
      .status(502)
      .json({ ok: false, error: "Versand fehlgeschlagen. Bitte erneut versuchen." });
  }
}
