# SiteMind SaaS foundation — phase 1

This extends the existing dashboard. It is a review branch, **not a production release**. No hosted resources, paid accounts, SMS messages, real checkout sessions, migrations on a hosted database, or deployments were created.

## What works in this phase

- Existing demo state and the `sitemind-dashboard-v1` storage key are preserved; v1/v2 migrations retain tasks and original notes. Journal is an additive optional field. Export backup downloads JSON without uploading it.
- The same navy/white/teal dashboard now has Today, Tasks, Commitments, Schedule, Risks, Journal, compact checklists, active phone navigation, priorities and follow-ups. All original task, commitment, reminder, schedule, risk, briefing and note features remain.
- Local rules stay free and default. Reviewed proposals can create or correct any of the six item types. Correction targets are explicit IDs. Every correction is reviewable, duplicates are checked, original notes are retained, and completing a follow-up does not cascade to physical work.
- A separate Node server supports verified Supabase password sign-in, HTTP-only same-site cookies, refresh, logout, authenticated project selection/creation, workspace reads, confirmed writes with revision conflict detection, and user delivery preferences. The browser never receives OpenAI/service-role credentials and never writes private-mode workspaces or tokens to localStorage. Demo storage is left alone when signing into private mode.
- The server calls the OpenAI Responses API only when `AI_ENABLED=true` **and the user selects server AI**. Project context is read using that user's database permissions. Structured output is validated again server-side, including exact correction targets, dates, enum values, field sizes, and maximum item count. Interpretation has no write side effects.
- Supabase migrations separate tenants, memberships, projects, field updates, typed work items, delivery preferences, phone verification, provider events, billing accounts, audit records and outbox jobs. RLS prevents cross-tenant reads. Confirmed writes are atomic, preserve original notes, and require owner/editor access. Viewers cannot write or elevate membership.
- Twilio signature validation, STOP/START handling, message logs, verified-phone/app-consent checks, local-time delivery selection and secure sign-in-required dashboard links are implemented as preparation. STOP overrides app consent; START does not create app consent. Duplicate inbound events do not replay consent changes. No outbound scheduler is registered.
- Stripe test Checkout preparation requires a payment method for a 14-day subscription trial. Live keys are rejected. Initial checkout uses an idempotency key and a workspace with an existing subscription cannot start another trial through this endpoint. Webhooks verify raw-body signatures, timestamp tolerance and test mode, retrieve canonical subscription state and deduplicate events. Day-13 reminders are queued with a unique outbox key; there is no message sender for this queue yet.

## Exactly what is needed for AI testing

You do **not** need Twilio or Stripe accounts for AI testing.

1. **A development Supabase project** (free tier is suitable). Review and apply `supabase/migrations/001_foundation.sql` in its SQL editor. Obtain its HTTPS **Project URL** and legacy **anon/public API key**. Configure email/password authentication and create a verified test account using an email account you control. Test with fictional project contents only. Do not use production customer data.
2. **An OpenAI API account/project** with access to a structured-output-capable model, and a **server API key**. A ChatGPT subscription does not itself provide API usage credits. Review API pricing and set a small project usage budget. No live AI testing is authorized or performed by this branch. Enabling AI and making requests can incur OpenAI charges and needs your explicit approval first.
3. **A private development server** running Node 20.6+ (Node 22/24 recommended), separate from GitHub Pages. This phase does not provision one. Supply an HTTPS origin for remote/iPhone testing; localhost HTTP is allowed only for development. Use a host you approve; no purchase is required to review or run mocked tests.
4. In that server's secure environment settings, configure:

   | Variable | Value |
   | --- | --- |
   | `APP_MODE` | `service` |
   | `APP_ORIGIN` | Exact development origin, e.g. `https://dev.example.invalid`, no path |
   | `NODE_ENV` | `production` on an HTTPS-hosted server; development for localhost |
   | `SUPABASE_URL` | Your development project's `https://PROJECT.supabase.co` URL |
   | `SUPABASE_ANON_KEY` | Its legacy anon/public key; kept on the server in this architecture |
   | `OPENAI_API_KEY` | API key in the host's secret store, never browser code or chat |
   | `OPENAI_MODEL` | `gpt-4.1-mini` by default, or another compatible model you approve |
   | `AI_ENABLED` | Keep `false` until you approve API test spending, then `true` |
   | `SMS_ENABLED`, `BILLING_ENABLED` | Leave `false` |

   `SUPABASE_SERVICE_ROLE_KEY` is **not needed for ordinary sign-in, project access or AI tests**. It is reserved for later verified webhooks/system jobs. No Stripe/Twilio keys are needed now.
5. Allow outbound HTTPS to `api.openai.com` and your exact `PROJECT.supabase.co` host. Keep TLS verification and the environment proxy/CA configuration intact. In managed Node 24 environments, enable `NODE_USE_ENV_PROXY=1` if required by the supplied HTTP proxy. Do not unset proxies or disable certificate checks.
6. Sign in on the private development server, create a fictional workspace, add a few fictional tasks/commitments and select **Server AI** when entering a note. Verify proposals before confirming. Test corrections against existing items, ambiguous dates, and follow-up completion. Hosted Supabase, real OpenAI responses and iPhone Safari need acceptance testing after configuration.

Never paste secrets into chat, commit `.env`, or put these variables in frontend build settings. `.env.example` contains names only. GitHub Pages remains a fictional static demo; it cannot host this backend or securely store credentials.

## Local operation and tests

Default demo: `npm start`. There is no production package dependency or build step. Keep the original server running for browser tests.

For configured local service testing, copy `.env.example` to `.env` outside Git tracking, fill values securely, then run `node --env-file=.env server.mjs`. Defaults do not contact providers.

- `npm test`: Node tests covering existing behavior, migration, structured proposals, immutable notes, HTTP auth/origin checks, unauthorized project access, conflicts, cookie flags, rate limiting, provider gates, signature validation, consent and trials. Providers are mocked; no billable requests.
- `npm run test:browser`: existing demo interaction and responsive suite, with the local server started separately. Set `BASE_URL` if not using port 3001.
- `npm run test:service-browser`: a mocked private-service HTTP/browser flow. Uses local port 3003 and verifies private data/tokens never enter browser storage; never contacts providers.
- `npm run test:db`: executes the migration in free PGlite with Supabase auth roles mocked. Tests two-tenant isolation, viewer restrictions, no role escalation, immutable notes, revision conflicts, consent idempotency and no anonymous access. This is actual local SQL execution, not a substitute for hosted Supabase acceptance tests.

Optional test tools can be installed outside the checkout, or locally with `npm install --no-save --package-lock=false playwright @electric-sql/pglite` and `npx playwright install chromium`. `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `PGLITE_MODULE` can point to preinstalled tools. Test tooling is free and not required by the app at runtime. Do not enable paid services to run these tests.

## Later phases (not activated)

**Supabase acceptance and auth lifecycle:** verify the hosted migration/RLS with separate test accounts; invitations, password recovery and MFA; team membership administration; retention/export policy and production backups. Account creation/verification currently uses Supabase's controlled dashboard/provider flow, not a public signup page. No demo-to-private import is automatic; this prevents fictional/test data from silently becoming customer records.

**Messaging:** only after approval, supply a Twilio account SID/auth token, an approved number and the exact HTTPS webhook URL. Register `/api/webhooks/twilio` only after review. Add phone verification, consent UX/legal review, provider registration, outbound delivery outbox/claims/retries, delivery-status callbacks and a scheduler. `deliverySlot` and `sendSms` are prepared helpers, not an active scheduler; DST slots require the unique daily idempotency key and operational retry handling. Do not purchase a number or enable `SMS_ENABLED` yet.

**Billing:** only after approval, supply Stripe **test** secret/price ID/webhook secret. No billing button is exposed yet. Use `/api/projects/:id/checkout` in a controlled test only; an owner is required. Register `/api/webhooks/stripe` in test mode after review. The protected `/api/internal/trial-reminders` job queues a once-per-subscription day-13 notice but sends nothing. A `JOB_SECRET` of at least 32 random characters, scheduler, reminder delivery channel and cancellation/billing management UI are future requirements. Live Stripe keys remain blocked in code.

**Production hardening:** single-instance in-memory rate limits must become a shared enforced limit before multi-instance rollout; configure trusted proxy ingress correctly, TLS, subscription entitlement enforcement, account/project quotas, operational logging without request bodies/tokens, monitoring, audit retention, abuse quotas and load tests. Current workspace size limits (256 KiB request body, bounded item/note counts, 100 KiB AI context) are deliberate initial safeguards. Memberships are controlled by bootstrap/admin operations and not editable from the browser. Perform an independent security review before handling real customer information. This branch is a foundation, not a claim of production readiness.

## Merge and deployment

Review the feature branch via a pull request. Merging code is separate from provisioning infrastructure, applying a hosted migration, enabling provider flags or deploying the private server. Do not deploy this branch to production before review. If the public demo's GitHub Pages tracks main, merging will update **only the fictional static demo**; Pages cannot execute the backend. This repository’s source is public, so it must contain no secrets or customer records; `.env` stays untracked. The Node server separately restricts HTTP access to an explicit public-asset list. Do not add customer fixtures or credential files to the public repository.
