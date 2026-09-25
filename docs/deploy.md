# Deploying the backend for free

The frontend is already on Vercel. This is about the Spring Boot service in
`backend/`, which needs three things a static host can't give it: a long-running
JVM, a Postgres database, and (eventually) object storage for product images.

Checked September 2026 — free tiers move, so re-read the provider's own pricing
page before committing to one.

## What's actually free right now

| Option | What you get | Why / why not |
| --- | --- | --- |
| **[Render](https://render.com/docs/free) free web service** | 512 MB RAM, 750 instance-hours/month per workspace, Docker builds, no credit card | **Recommended.** Cheapest path from this repo — `render.yaml` is already here. Cost: the instance sleeps after 15 minutes idle and the request that wakes it waits ~1 minute. Its *own* free Postgres expires 30 days after creation, so don't use that part. |
| **[Neon](https://neon.tech) free Postgres** | 0.5 GB storage, 100 compute-hours/month, scale-to-zero, no expiry date | **Recommended** as the database. Resumes in well under a second, and exceeding a limit suspends compute rather than deleting data. |
| **[Northflank](https://northflank.com) Sandbox** | 2 services + 1 database addon, always-on (no sleeping) | Best pick if the cold start is the dealbreaker — backend and Postgres in one place. Free compute is "limited" and unpublished, so 512 MB-class assumptions still apply. |
| **[Google Cloud Run](https://cloud.google.com/run/pricing)** | Always-free 2M requests, 360k vCPU-s, 180k GiB-s per month per billing account | Scales to zero and stays free at demo traffic, but needs a billing account on file, and a JVM cold start on a scale-to-zero container is 10–20s. |
| **[Oracle Cloud Always Free](https://www.oracle.com/cloud/free/)** | 2 OCPU / 12 GB ARM VM (halved from 4/24 in June 2026), 200 GB storage, free Autonomous DB | Most raw power for zero, and no sleeping — but it's a VM you administer yourself, and account approvals/terminations are a known lottery. |
| ~~Fly.io~~ | 2 VM-hours trial, then metered | The free allowance is gone for new accounts. |
| ~~Koyeb~~ | — | Free tier closed to new users after the Mistral acquisition. |
| **Supabase free** | 500 MB Postgres + 1 GB file storage | Storage tier is a usable S3 replacement, but projects pause after a week idle, so it's a worse fit than Neon for the database. |
| **[Cloudflare R2](https://developers.cloudflare.com/r2/) free** | 10 GB storage, 1M writes + 10M reads/month, zero egress charges | **Recommended** for product images. S3-compatible, so the presigned-upload flow already in the code works unchanged. AWS S3's own free 5 GB lasts 12 months and then bills; R2's 10 GB doesn't expire. |

**Recommended combination: Render (web service) + Neon (Postgres).** Both are
free with no card, and the only real cost is the cold start on the first request
after 15 idle minutes.

## What was changed to make this deployable

Everything below already has a local default, so `mvn spring-boot:run` against
your local Postgres behaves exactly as before — deployments override via env.

- `backend/Dockerfile` — Maven build stage, JRE-only runtime, non-root, JVM
  flags sized for a ~512 MB container (see the comments in the file).
- `application.yml` — `PORT`, `JDBC_DATABASE_URL`, `DATABASE_USERNAME`,
  `DATABASE_PASSWORD`, `DATABASE_POOL_SIZE`, `APP_FRONTEND_URL`,
  `APP_CORS_ALLOWED_ORIGINS`, `SQL_LOG_LEVEL` are now env-overridable.
- Session cookie attributes (`APP_SESSION_COOKIE_SAME_SITE`,
  `APP_SESSION_COOKIE_SECURE`) are config, not constants. This one is not
  optional: with the browser on `*.vercel.app` and the API on another domain,
  every API call is cross-site, and a `SameSite=Lax` cookie is simply not sent
  back — seller sign-in would appear to succeed and then 401 on the next call.
- `S3_ENDPOINT` / `S3_PUBLIC_BASE_URL` — point object storage at any
  S3-compatible provider instead of AWS (see **Images** below).
- `render.yaml` — Render blueprint for the backend service.

## Steps

1. **Database (Neon).** Create a project, copy the connection string, and split
   it into the three vars below. Note the *JDBC* form — Spring's datasource URL
   is not the `postgres://user:pass@host/db` URI Neon shows you:
   - `JDBC_DATABASE_URL=jdbc:postgresql://<host>/<db>?sslmode=require`
   - `DATABASE_USERNAME=<user>`, `DATABASE_PASSWORD=<password>`

   Flyway runs the migrations in `db/migration` on first boot, so the schema
   creates itself. For demo rows, run `db/seed/demo-data.sql` against the Neon
   database *after* that first boot (it's idempotent; see the file's header).

2. **Backend (Render).** New → Blueprint → this repo. Render reads
   `render.yaml`, builds `backend/Dockerfile`, and asks for the five
   `sync: false` variables: the three database vars above, plus
   `APP_CORS_ALLOWED_ORIGINS` and `APP_FRONTEND_URL` set to your exact Vercel
   origin (`https://<project>.vercel.app`, no trailing slash — the CORS
   allow-list is exact-match because credentials are allowed, so a wildcard or a
   stray slash fails the preflight).

   Each Vercel preview deployment gets its own origin, so add any preview URL you
   want to test against to `APP_CORS_ALLOWED_ORIGINS` as a comma-separated entry.

3. **Frontend (Vercel).** The deployed frontend currently mocks the API in the
   browser with MSW — that's `frontend/.env.production`. Once the backend answers:
   - set `VITE_API_URL=https://<your-render-service>.onrender.com`
   - set `VITE_USE_MSW=false`
   - set `VITE_DEMO_SELLER_AUTH=false` to use the real magic-link flow. Leave it
     `true` unless email delivery is wired up: `LoggingEmailSender` only writes
     the magic link to the server log, so a real sign-in means reading the link
     out of Render's log stream.

   Set these in Vercel's project env vars (they're build-time inlined by Vite, so
   redeploy after changing them), and delete `.env.production`'s overrides so the
   dashboard values win.

4. **Verify.** `GET https://<service>/v3/api-docs` returns the OpenAPI JSON
   without a session cookie — it's the cheapest public endpoint to prove the app
   booted, migrated, and is reachable. Then load the Vercel site and watch
   `GET /products` in the network tab.

## Notes

- **Cold starts.** On Render's free plan the first request after 15 idle minutes
  waits for a container start plus Spring Boot boot (~1 minute total). Nothing
  in the app fixes that; the paid instance or Northflank's always-on sandbox
  does. Don't "solve" it with an external pinger — that burns the 750
  instance-hours the free plan allots.
- **Images.** Object storage is a separate decision from the two above, because
  the seller portal uploads straight from the browser: the API presigns a PUT,
  the browser PUTs the file to storage, then confirms
  (`SellerProductService.createUploadUrl` / `uploadProductImage`). **Use
  Cloudflare R2**, not AWS S3 — S3's free tier is 5 GB for 12 months and then
  charges, including for egress, while R2's 10 GB and zero-egress pricing have no
  expiry, and R2 speaks enough of the S3 API that the existing flow is unchanged.
  Backblaze B2 (10 GB free, S3-compatible) is the equivalent second choice;
  Supabase Storage (1 GB) works but pauses with the project; Cloudinary and
  ImageKit are image-specific CDNs that would mean replacing the upload flow, not
  configuring it.

  Four env vars, no code change (`S3Config` switches itself over when
  `S3_ENDPOINT` is set, including to path-style addressing, which R2 needs):
  - `S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com`
  - `AWS_REGION=auto` (R2 wants exactly that), `AWS_S3_BUCKET=<bucket>`
  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — an R2 API token with object
    read+write, not a Cloudflare global key
  - `S3_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev` — the bucket's public URL,
    which is *not* the API endpoint. Buyers' `<img>` tags load from here, so the
    bucket needs public read enabled (R2 dashboard → Settings → Public
    Development URL, or a custom domain in front of it).

  Two things bite if skipped: **bucket CORS**, since the browser PUTs directly to
  R2 — allow `PUT` from the Vercel origin with `Content-Type` in the allowed
  headers, or the upload fails preflight while the API looks fine; and the
  **signed `Content-Type`**, already handled — the presign signs the content type
  the client declared, and the browser sends the same one, so don't change one
  side without the other.

  Verified locally against the SDK: with `S3_ENDPOINT` set, the presigned URL
  comes out as `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>` with
  `content-type` among the signed headers; unset, it stays on the AWS
  virtual-hosted form. Everything except image upload works with none of this
  configured.

- **Memory.** `-XX:MaxRAMPercentage=70` in the Dockerfile keeps the heap inside
  a 512 MB container; the JVM would otherwise size the heap against the host's
  RAM and get OOM-killed. If the service dies on boot with exit 137, that's
  this, not your code.
