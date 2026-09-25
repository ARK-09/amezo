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

## Environment variables

`backend/.env.example` is the authoritative copy, with a comment per variable.
Every one has a local-dev default in `application.yml`, so an empty environment
still runs locally; this table is what a *deployment* cares about.

| Variable | Default | Set it when deploying? |
| --- | --- | --- |
| `PORT` | `8080` | Host-injected — don't set it yourself |
| `JDBC_DATABASE_URL` | local Postgres | **Yes** — JDBC form, `?sslmode=require` |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | `postgres` / `root` | **Yes** |
| `DATABASE_POOL_SIZE` | `5` | Recommended — `3` on a 512 MB instance |
| `FLYWAY_ENABLED` | `true` | No — leave on, it creates the schema |
| `APP_FRONTEND_URL` | `localhost:5173` | **Yes** — magic-link emails point here |
| `APP_CORS_ALLOWED_ORIGINS` | localhost origins | **Yes** — exact origins, comma-separated |
| `APP_SESSION_COOKIE_SAME_SITE` | `Lax` | **Yes — `None`**, or seller sign-in 401s |
| `APP_SESSION_COOKIE_SECURE` | `false` | **Yes — `true`** (required by `SameSite=None`) |
| `APP_SESSION_COOKIE_NAME` | `mp_session` | No |
| `APP_SESSION_TTL_DAYS` | `30` | No |
| `APP_MAGIC_LINK_TTL_MINUTES` | `15` | No |
| `RESEND_API_KEY` | empty (log the link) | **Yes**, for real sign-in emails |
| `APP_EMAIL_FROM` | `onboarding@resend.dev` | Yes, once a domain is verified |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | Image upload only |
| `AWS_SESSION_TOKEN` | — | Only for temporary credentials |
| `AWS_S3_BUCKET` | `amezo-dev` | Image upload only |
| `AWS_REGION` | `us-east-1` | Image upload only — `auto` for R2 |
| `S3_ENDPOINT` | empty (AWS) | Image upload only — R2/MinIO endpoint |
| `S3_PUBLIC_BASE_URL` | empty (AWS URL) | Image upload only — the public bucket URL |
| `S3_MAX_TOTAL_BYTES` | `10737418240` (10 GiB) | Match your provider's free allowance |
| `S3_MAX_UPLOAD_BYTES` | `10485760` (10 MiB) | Per-file ceiling |
| `SQL_LOG_LEVEL` | `debug` | Recommended — `warn` |
| `HIBERNATE_FORMAT_SQL` | `true` | Recommended — `false` |
| `API_DOCS_ENABLED` / `API_DOCS_PATH` | `true` / `/v3/api-docs` | No |

Anything under `spring.*` is additionally overridable through Spring Boot's own
`SPRING_*` env names without being listed here. Two values stay hardcoded on
purpose, being facts about the artifact rather than the environment:
`spring.jpa.hibernate.ddl-auto=validate` (Flyway owns the schema; Hibernate only
checks the entities match it) and `spring.flyway.locations` (the migrations ship
inside the jar). An env override for either would only let a deploy break
itself.

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

3. **Frontend (Vercel).** Already pointed at the live backend —
   `frontend/.env.production` now sets `VITE_API_URL=https://amezo.onrender.com`,
   `VITE_USE_MSW=false` and `VITE_DEMO_SELLER_AUTH=false`. Vercel rebuilds from
   the repo, so nothing to set in its dashboard unless you'd rather manage the URL
   there — in which case delete that file so there's no ambiguity about which wins.

   Seller sign-in is the one rough edge of turning the mock off:
   `LoggingEmailSender` writes the magic link to the server log instead of sending
   it, so signing in means copying the token out of Render's log stream. Wiring a
   real sender (Resend, Brevo — both free at this volume) is what makes it a normal
   sign-in.

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

- **Email / sign-in.** Magic-link delivery goes through
  [Resend](https://resend.com)'s HTTP API — chosen over SMTP because Render's free
  plan blocks outbound SMTP ports. Set `RESEND_API_KEY` and it sends; leave it
  empty and `EmailSenderConfig` falls back to writing the link to the log, which
  works but means anyone who can read your logs can sign in as anyone.

  **The sandbox catch, worth knowing before you demo:** until you verify a domain
  in Resend, you can only send *from* `onboarding@resend.dev` and only *to* the
  address the Resend account was created with. Every other recipient is refused.
  So with an unverified domain, the seeded `demo@example.com` seller cannot receive
  a link — sign in with your own Resend account address, or verify a domain
  (Resend dashboard → Domains, three DNS records) and set `APP_EMAIL_FROM` to an
  address on it.

  A refusal surfaces as a 502 `ProblemDetail` from `POST /auth/seller/magic-link`,
  with the provider's own reason in the server log. It is deliberately not
  swallowed: that endpoint sends for every address it is given without checking
  whether an account exists, so failing loudly reveals nothing about who has one,
  and the alternative is a seller waiting on a link that was never sent.
- **How an image gets in, end to end.** The seller's browser never sends bytes to
  this API: `POST /products/{id}/images/upload-url` creates a `pending` image row
  and returns a presigned PUT (path-style, against `S3_ENDPOINT`) → the browser
  PUTs the file straight to R2 → `POST /products/{id}/images/confirm` HEADs the
  object, and only then is the row `stored` and the image rendered. Confirm answers
  `409 upload-not-found` if nothing landed, so a broken image can't become
  permanent. Deleting a product deletes its objects from the bucket too. Because
  the browser PUTs directly, **the bucket needs CORS** allowing `PUT` from your
  Vercel origin with `Content-Type` in the allowed headers — that is dashboard
  config, not code, and it is the one step nothing in the app can do for you.
- **Add to cart makes no request.** `GET /products` returns each card's
  `defaultVariantId` and `defaultVariantPrice`, derived from offers the search
  query already loaded, so a card's Add-to-cart button is a reducer dispatch
  against the localStorage cart. It used to fetch the whole product on click just
  to learn a variant id — which on a sleeping free instance meant the cart sat
  empty for the length of a cold start.
- **Storage cap.** `POST /products/{id}/images/upload-url` refuses to issue a URL
  once stored-plus-reserved bytes reach `S3_MAX_TOTAL_BYTES` (507), and refuses any
  single file over `S3_MAX_UPLOAD_BYTES` (413). The declared size is signed into the
  URL as `Content-Length`, so a client can't presign for 1 MB and then PUT 5 GB.
  Set the total to whatever your provider gives away free — 10 GiB matches R2 and
  B2 — and remember it's the whole deployment's budget, not per seller.
- **Image upload without credentials.** Skipping the `AWS_*`/`S3_*` vars is
  supported: everything except image upload works, and upload answers 503 naming
  the missing configuration rather than 500ing.
- **What the live API still doesn't do.** `ProductSummary.avgRating` is in the
  frontend contract but not returned — reviews' query interface answers one product
  at a time, so a page of 16 cards would be 16 extra queries; it needs a batch
  method first. Warranty filtering belongs to the unbuilt offer-warranty model in
  next-build.md. And the page envelope is Spring's (`number`), while the contract
  names `page`; nothing reads either field, so it's drift to fix when the contract
  is next touched, not a break.
- **`GET /sessions/current`.** Implemented (`identity/SessionController`). It
  answers 200 with `{ identityType, identityId, email, fullName, expiresAt }` for
  whichever identity the `mp_session` cookie names, and 401 for a visitor with no
  cookie or an expired one — so a 401 here is normal traffic, not an incident.
  It used to have SecurityConfig rules and no controller, which meant an
  authenticated caller got a **404** and the deployed frontend logged one on every
  page load. `DELETE /sessions/current` had the same dead rule; it is gone rather
  than implemented, because `DELETE /auth/seller/session` already revokes the
  session row and expires the cookie.
- **Cold starts are handled in the frontend, not papered over.** A free instance
  sleeps after 15 minutes idle, so the first request after a quiet spell can take
  up to a minute or come back as a gateway error. `src/lib/api/transient.ts` holds
  the whole policy: each attempt gets 20s (`fetchWithTimeout` in
  `lib/api/client.ts`), and a failure is retried up to 3 times with 1s/2s/4s
  backoff **only** if it is infrastructure — a network-level fetch failure, that
  deadline, or 408/425/429/502/503/504. A 4xx is never retried, and neither is a
  500: a 500 carries a ProblemDetail, which means the application answered and
  retrying would just hide the bug. Worst case for a backend that is genuinely
  down is about 90 seconds, then an error. While retries are in flight the app
  shows `BackendWakingBanner` ("Waking the server up…") instead of an error panel,
  and `apiErrorMessage` gives exhausted transient failures the "may still be
  starting up" wording rather than a raw 502. Mutations deliberately do **not**
  retry (`createAppQueryClient`): a checkout POST that timed out may already have
  been committed, and a retry would place a second order — those surface the
  failure and let the user press the button again.
- **Memory.** `-XX:MaxRAMPercentage=70` in the Dockerfile keeps the heap inside
  a 512 MB container; the JVM would otherwise size the heap against the host's
  RAM and get OOM-killed. If the service dies on boot with exit 137, that's
  this, not your code.
