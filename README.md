# LiefermiA Crispy Opening — Landing Page

Static landing page (`index.html`, design preserved from Elementor export) + Vercel Function `POST /api/submit` that emails form submissions via Resend.

## Env vars (Vercel → Project → Settings → Environment Variables)

| Var | Value |
|---|---|
| `RESEND_API_KEY` | Resend API key (server-only, never in frontend) |
| `CONTACT_EMAIL` | Inbox for notifications, e.g. `taharezapour77@gmail.com` |
| `SENDER_EMAIL` | Verified sender, e.g. `onboarding@resend.dev` |

Local dev: copy `.env.example` to `.env` and fill in (never commit `.env`).

## Deploy

```bash
npm install
npx vercel deploy --prod
# then set the 3 env vars in the Vercel dashboard and redeploy
```

Static file serves `/`; form posts JSON to `/api/submit`. Test: submit the live form, check inbox + spam folder for `Neue Rabatt-Anmeldung: <email>`.

## Security notes

- Key read only from `process.env` in `api/submit.js`; recipient/sender fixed server-side, never from client.
- Server validates email/phone, 10 KB payload cap, honeypot + fill-time check + 5 req/10 min per-IP rate limit.
- If an API key was ever pasted in chat or committed, rotate it in Resend dashboard immediately.
