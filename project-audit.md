# SellerPlus — Current Production Audit

Updated 26 August 2026 for the `production-hardening` branch.

This document describes the code that is actually present in the repository. It supersedes the original prototype-era audit, which referred to client-side Gemini calls, local fallback authentication, fabricated analytics, and simulated payment success paths that have since been removed or hardened.

## Verified locally

- Next.js production build passes for all 103 routes.
- TypeScript strict checking passes.
- 33 Vitest files and 207 tests pass.
- All 58 SQL migration files are present; the latest forward-only security migration enforces active workspace access in both request authentication and tenant RLS helpers.
- ESLint completes with zero errors. It reports 29 visible non-blocking legacy warnings, primarily image optimization and hook dependency cleanup.
- The latest local branch and `origin/production-hardening` point to the same tree at commit `f36364a`.

## Implemented foundations

### Authentication and tenancy

- Browser sessions use Supabase SSR authentication and fail closed when a session is missing or expired.
- Every authenticated request resolves workspace membership server-side; browser-supplied tenant IDs are not trusted.
- Workspace roles and permissions protect administrative, finance, AI, Amazon, packing, and putaway operations.
- Suspended or closed workspaces are rejected before request handling and excluded by the database membership/RLS helper.
- Cookie-authenticated browser mutations are same-origin protected. Bearer-authenticated workers are handled separately.
- Supabase service credentials are server-only. The browser receives only the publishable Supabase configuration.

### AI safety and accounting

- Provider credentials are encrypted in the workspace credential store and never returned to the client.
- All normal generation and provider-connection tests use the tenant-scoped AI gateway.
- The provider test endpoint no longer accepts raw API keys or calls providers directly.
- AI calls reserve and settle workspace budgets, record provider usage, respect retries/deadlines, and expose source-qualified cost status.
- Structured outputs are schema-validated; model-generated financial/chart numbers are not treated as verified facts.
- Payment checkout remains unavailable until a server-owned price catalog and signed webhook entitlement lifecycle are configured. No client-side payment success path is used.

### Amazon and Seller operations

- Amazon SP-API credentials are encrypted and server-side.
- Orders, listings, Ads daily facts, refunds, expenses, goals, and analytics use tenant-scoped API/database paths.
- Amazon synchronization is durable, resumable, idempotent, rate-limit aware, and checkpointed.
- Missing Amazon fee or keyword-provider evidence is represented as unavailable rather than zero or an invented estimate.

### Reyo Pack fulfillment

- Package-level states, immutable packing events, sessions, cancellation history, locations, SKU/barcode mappings, and audit records are backed by PostgreSQL constraints and security-definer service functions.
- Barcode scan → shipment lookup → server-side claim → packing confirmation is atomic and idempotent.
- Concurrent pack attempts return one authoritative success and a conflict/already-packed result.
- Amazon cancellation preserves prior packing events and blocks further packing.
- The mobile PWA provides camera scanning through the browser BarcodeDetector API, manual/hardware fallback, sound/vibration feedback, realtime refresh, and safe read-only offline snapshots.
- Label documents are streamed through an authenticated, no-store route; permanent public label URLs are not exposed.
- Putaway mode, versioned location assignment, movement history, and admin controls are tenant-scoped.

## Known limitations and external validation still required

These are not silently represented as complete:

1. A live Supabase/Postgres project is required to execute migrations, validate RLS/advisors, and run a real database race/realtime test.
2. Amazon production credentials, seller authorization, marketplace roles, and real orders are required to validate SP-API sync and Easy Ship/shipping responses.
3. Android Chrome hardware validation is still required for camera permissions, BarcodeDetector behavior, audio, vibration, and long-session operation.
4. Vercel deployment cannot be verified from this checkout because no matching Vercel project is available to the connected account.
5. Amazon external-fulfillment label generation requires the relevant Amazon allowlisting and shipment identifier. Reyo Pack does not infer unsupported identifiers from package references.
6. Quantitative keyword metrics require a legitimate keyword-data provider; the current engine intentionally returns qualitative candidates or an explicit unavailable result.

## Release posture

The codebase is substantially hardened and locally buildable, but it is not honestly “production connected” until the external requirements above are configured and exercised. The repository is currently on the existing `ashishnotfound/SellerPlus` remote; creation of a separate private GitHub repository is blocked by the available GitHub connector capability, not by the application code.
