# Be Right — home maintenance, Lebanon

Specialist-led home repair web app: customers answer guided questions and upload photos/video,
a specialist reviews urgency and sends a quote, the customer approves, a technician is assigned
and reports progress (with live location) until the job is closed. English + Arabic (RTL).

Ported from the Kimi prototype onto Supabase (Postgres, Auth, Storage), per the architecture study.

## Stack

- **Frontend:** React 19, Vite, Tailwind, shadcn/ui, React Router, tRPC + React Query
- **Backend:** Hono + tRPC on Node (`server/`), Drizzle ORM (`db/`)
- **Supabase:** Postgres database, email sign-in (magic link / code, optional Google), private Storage bucket for media
- Shared domain logic (service categories, question trees, urgency engine, strings) lives in `contracts/`

## Roles

Three roles, each with its own area. Signing in sends staff straight to theirs, and opening
another role's page redirects back (enforced on the server too):

| Role | How they get it | Their area |
| --- | --- | --- |
| Customer | Default for every new account | `/book`, `/requests` |
| Technician | A specialist adds their email in Dashboard → Technicians (they sign up first) | `/tech` |
| Specialist | Email listed in `SPECIALIST_EMAILS` (applied on next sign-in) | `/dashboard` |

Technician applications from `/join` need no account and appear in the dashboard.

## Setup

1. **Create a Supabase project** (region close to Lebanon, e.g. Frankfurt `eu-central-1`).
2. **Configure env:** `cp .env.example .env` and fill in the values from
   *Project Settings → API* and *Project Settings → Database → Connection string*.
3. **Install and create the schema:**
   ```bash
   npm install
   npm run db:migrate
   ```
4. **Configure Supabase Auth** (*Authentication → URL Configuration*):
   - Site URL: your production URL (e.g. `https://be-rightbright.com`)
   - Redirect URLs: `http://localhost:3000/**` and `https://be-rightbright.com/**`
   - Optional: in *Email Templates → Magic Link*, add `{{ .Token }}` so users can type the code
     instead of clicking the link (useful when the email opens in a different browser).
   - For production volume, set up custom SMTP (*Authentication → SMTP*); the built-in sender is rate-limited.
   - Optional Google sign-in: enable the provider, then set `VITE_AUTH_GOOGLE=true`.
5. **Run locally:** `npm run dev` → http://localhost:3000

The storage bucket (`request-media`, private, 20 MB, images/videos only) is created automatically on first upload.

## Emails (Resend + Supabase)

Auth emails (confirm sign-up, password reset, sign-in code) are sent by Supabase through Resend.

- **Resend:** domain `be-rightbright.com` verified (region EU), API key with *Sending access*.
- **Supabase → Authentication → Emails → SMTP Settings:** host `smtp.resend.com`, port `465`,
  user `resend`, password = Resend API key, sender `noreply@be-rightbright.com` / `Be Right`.
- **Supabase → Authentication → Rate Limits:** raise emails per hour (e.g. 100).
- **Templates** (Authentication → Emails → Templates) — paste from `supabase/email-templates/`:

| Template | File | Subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | Confirm your Be Right account · أكّد حسابك |
| Reset password | `reset-password.html` | Reset your Be Right password · غيّر كلمة السر |
| Magic link | `magic-link.html` | Your Be Right sign-in code · رمز الدخول |
| Invite user | `invite-technician.html` | You're on the Be Right team · أهلاً فيك بالفريق |

Hiring an applicant (Dashboard → Technician applications → *Hire as technician*) promotes an
existing account, or sends the *Invite user* email and creates the technician account at once.

## Notification emails

Sent through Resend's API (`RESEND_API_KEY`), in English and Arabic, from `server/notify.ts`:

| When | Who |
| --- | --- |
| A customer books, approves a price, cancels, asks to cancel or reports a problem (guarantee) | Specialists |
| Someone applies as a technician | Specialists |
| A price is sent or changed, a guarantee visit is confirmed free, the visit is scheduled, the job is done, or our team cancels | Customer |
| A job is assigned, reassigned away, scheduled or cancelled | Technician |

Specialists are every account with the specialist role plus `SPECIALIST_EMAILS`. A failed email is logged
(**Netlify → Logs → Functions → api**, "[notify]") and never blocks the action. Replies go to `EMAIL_REPLY_TO`.

## Scheduled jobs

| Job | When | What |
| --- | --- | --- |
| `cleanup-documents` (Netlify scheduled function) | daily | Deletes ID and photo of applications rejected 90+ days ago (Privacy Policy), plus any criminal record files left from before they stopped being collected. Period: `REJECTED_APPLICATION_RETENTION_DAYS` in `contracts/legal.ts`. Also deletes uploads never attached to an application or booking after 24 hours, and old rate-limit counters. |

Public uploads and applications are rate-limited per IP, per customer and per day; the limits are in `server/lib/rateLimit.ts`.

Run it by hand with `npm run cleanup:documents` (preview first with `npm run cleanup:documents -- --dry-run`).
Netlify shows each run under **Logs → Functions → cleanup-documents**.

## Deploy

### Netlify

`netlify.toml` builds the site (`npm run build:netlify`), publishes `dist/public`, and routes
`/api/*` to a single function bundled from `server/netlify.ts`.

1. In Netlify: **Add new site → Import an existing project** → pick the GitHub repo.
   Build settings are read from `netlify.toml`; don't override them.
2. Before the first deploy, add every variable from `.env.example` under
   **Site configuration → Environment variables** (you can paste the whole `.env`).
   `VITE_*` values are read at build time, so redeploy after changing them.
3. In Supabase **Authentication → URL Configuration**, add the Netlify URL
   (e.g. `https://be-right.netlify.app/**`) to Redirect URLs, and set it as Site URL for the live site.

On Netlify's free plan functions run in US East (Ohio); the database is in Frankfurt, so each API
call pays transatlantic latency. Netlify Pro can move functions to Frankfurt
(**Cloud compute → Functions → Region → `fra`**) with no code change.

### Node server / Docker

Any Node 20+ host works. With Docker:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
  -t be-right .
docker run -p 3000:3000 --env-file .env be-right
```

Without Docker: `npm ci && npm run build && NODE_ENV=production npm start`
(the `VITE_*` variables must be present at build time).

Runtime env needed on the server: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SPECIALIST_EMAILS` (and optionally `SUPABASE_STORAGE_BUCKET`, `PORT`). Health check: `GET /api/health`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with the API mounted at `/api` |
| `npm run build` | Builds the SPA to `dist/public` and bundles the server to `dist/boot.js` |
| `npm run build:netlify` | SPA build + bundles the API into `netlify/functions/api.mjs` |
| `npm start` | Runs the built server (set `NODE_ENV=production`) |
| `npm run check` | TypeScript type-check |
| `npm test` | Unit tests (urgency engine) |
| `npm run db:generate` | Generate a migration after editing `db/schema.ts` |
| `npm run db:migrate` | Apply migrations (uses `DIRECT_DATABASE_URL` if set) |

## Security notes

- All tables have Row Level Security enabled with no policies: the browser's publishable key cannot
  read or write them through Supabase's REST API. Only the app server (direct Postgres connection) can.
- The service-role key is server-only. Never prefix it with `VITE_`.
- Uploads go directly to Storage through one-time signed URLs under `requests/<user-id>/`; the server
  rejects requests that reference another user's files, and media is served through short-lived signed URLs.
