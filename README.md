# SellerPlus

**AI-first seller operating system**
**Made by ReyoStudio**

SellerPlus is a multi-tenant Next.js and Supabase application for Amazon seller operations. It combines source-qualified analytics, controlled AI assistance, durable background jobs, marketplace synchronization, and the Reyo Pack fulfillment workflow in one workspace-bound product.

## Product areas

- **Seller operations:** Amazon orders, listings, inventory, refunds, expenses, goals, analytics, and reports.
- **AI workspace:** structured generation, tenant memory, reviewable proposals, deterministic validation, server-side spend budgets, and durable job accounting.
- **Reyo Pack:** mobile-first camera scanning, atomic shipment claims and packing confirmation, sessions, immutable packing events, cancellation handling, secure label delivery, putaway locations, realtime refresh, and safe offline read snapshots.
- **Administration:** workspace permissions, Amazon sync controls, SKU/barcode mappings, warehouse locations, settings, audit history, and connection health.

## Architecture

```text
Browser / PWA
      │ authenticated same-origin API requests
      ▼
Next.js route handlers and workers
      │ tenant-bound service operations
      ├── Supabase Auth + SSR session
      ├── PostgreSQL / RLS / immutable events
      ├── Supabase Realtime Broadcast (state-change signals)
      ├── durable jobs and cron claims
      └── Amazon SP-API (server-side credentials only)
```

PostgreSQL is the source of truth. Browser clients never authoritatively mutate packing, cancellation, location, or synchronization state. Reyo Pack reads bounded pages and revalidates after realtime signals; it does not load an unbounded order history into a device.

See [ARCHITECTURE.md](ARCHITECTURE.md) for module boundaries, data flow, security assumptions, and deployment notes.

## Requirements

- Node.js 20 or newer
- npm (the committed `package-lock.json` is authoritative)
- A Supabase project with PostgreSQL, Auth, Realtime, and Storage configured
- Amazon SP-API credentials and the required seller permissions for the marketplaces you connect
- Optional AI provider credentials if AI features are enabled

## Local setup

```bash
git clone <repository-url>
cd sellerplus
npm ci
cp .env.example .env.local
# fill the required values in .env.local
npm run dev
```

The public Supabase URL and publishable key are required in the browser. Server routes additionally require `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`). Production authentication fails closed; `SELLERPLUS_ALLOW_INSECURE_DEV_AUTH=true` is development-only and is never accepted in production.

All supported environment variables are documented, without credentials, in [.env.example](.env.example). Amazon and workspace notification credentials are encrypted at rest and are never returned to browser clients. Email delivery uses the optional platform-level `RESEND_API_KEY`; Discord and Telegram destinations are stored per workspace.

## Database migrations

Apply the ordered files in `supabase/migrations/` to the target Postgres database. For a direct Postgres connection:

```bash
SUPABASE_DB_CONN='postgres://…' node scripts/run-migrations-direct.js
```

Review the migration files before applying them to production. The repository includes tenant/RLS and operational-schema checks, but a live migration run requires a configured Supabase/Postgres project; this checkout does not contain production credentials.

## Validation

```bash
npm run build                 # Next.js production build + PWA generation
npm test                      # Vitest behavior suite
./node_modules/.bin/tsc --noEmit
git diff --check
```

The current suite covers authentication boundaries, tenant isolation, Amazon parsing/sync checkpoints, packing/putaway APIs, idempotency, realtime contracts, offline fail-closed behavior, AI budget accounting, and concurrent packing conflict handling. A live Postgres race test and Android camera validation require external infrastructure or hardware.

`npm run lint` uses the committed ESLint 9 and Next.js configuration. It currently reports non-blocking legacy hook-dependency and image-optimization warnings; those remain visible so they can be removed incrementally rather than being hidden by the build.

## Deployment

The app is structured for Vercel or an equivalent Node.js deployment:

1. Configure all required production variables from `.env.example` in the deployment environment.
2. Apply migrations before enabling worker traffic.
3. Configure the two cron routes in `vercel.json` (job runner every minute and Reyo Pack scheduler every five minutes), or invoke equivalent authenticated worker endpoints.
4. Set `CRON_SECRET` and keep it out of browser-visible variables.
5. Verify Supabase Realtime private-channel authorization, Storage access for label documents, and Amazon credentials/roles.
6. Run the production build and a real scan → claim → pack → history workflow with a test shipment before warehouse use.

The local build is currently green. A Vercel check on the source repository is not actionable from this checkout because no matching Vercel project is connected to the available account; inspect the deployment environment separately rather than weakening application code to satisfy an unknown remote failure.

## Security notes

- Keep SP-API, Ads, Supabase secret/service-role, AI, webhook, cron, and encryption credentials server-side.
- Use workspace-bound APIs and database constraints; do not trust a workspace ID supplied by the browser.
- Realtime sends only a low-payload state-change signal. Clients re-read authorized, bounded data.
- Label documents are streamed through an authenticated route and are not public URLs.
- Offline mode never queues consequential packing or warehouse mutations in browser storage.
- Critical corrections append audit/event records instead of silently rewriting operational history.

## Branding

SellerPlus is an independent ReyoStudio product. The in-app About section exposes the product name, **Made by ReyoStudio** attribution, version/build metadata, legal links when configured, and connected desktop-worker status.
