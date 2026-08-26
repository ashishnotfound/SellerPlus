# SellerPlus architecture

SellerPlus is a multi-tenant seller operating system made by ReyoStudio. The web application, background workers, and database share one tenant-bound operational model. PostgreSQL is the source of truth; the browser is a view and command surface, not an authority.

## Runtime components

```text
Next.js browser / PWA
        │ same-origin, authenticated route requests
        ▼
Next.js route handlers ──────── durable job processor / cron
        │                               │
        ├── Supabase Auth + SSR         ├── Amazon SP-API
        ├── workspace permissions       ├── AI provider gateway
        └── bounded read models         └── audit + usage ledger
                        │
                Supabase PostgreSQL
          RLS · constraints · functions · events
                        │
              Supabase Realtime Broadcast
```

### Web and API

- `src/app/(dashboard)` contains authenticated product surfaces.
- `src/app/api` contains server-side route handlers. Mutations authenticate, resolve the active workspace from membership, validate input with Zod, enforce permissions, and use tenant-scoped database operations.
- `src/lib/supabase` provides request-scoped SSR clients. Service/secret keys are never imported by Client Components.
- `src/lib/jobs` and `src/app/api/workers` implement durable job claims, retries, deadlines, accounting, and audit records.

### Database

Supabase PostgreSQL stores both seller data and operational history. Tenant keys are present on operational tables and are protected by RLS or service-only functions with explicit workspace checks. Important invariants are database constraints, unique indexes, row locks, compare-and-swap version checks, and idempotency keys—not only React state.

Important domains include:

- `workspaces`, `workspace_members`, and permission helpers for tenancy.
- `orders`, `order_items`, `shipments`, and Amazon source timestamps.
- `jobs`, `reyo_pack_sync_runs`, and `sync_checkpoints` for resumable synchronization.
- `reyo_pack_sessions`, `reyo_pack_packing_events`, and shipment packing state for immutable fulfillment history.
- `reyo_pack_skus`, `reyo_pack_sku_barcodes`, `reyo_pack_locations`, `reyo_pack_sku_locations`, and `reyo_pack_putaway_events` for inventory organization.
- `audit_events`, `audit_logs`, and `ai_usage_records` for traceability and cost controls.

Apply migrations in lexical order from `supabase/migrations/`. Live migration execution and Supabase advisors require a configured project; the source repository intentionally contains no production credentials.

## Amazon integration

Amazon credentials are read server-side from encrypted workspace credentials with environment fallbacks for controlled deployments. The Orders API v2026-01-01 integration validates response schemas, handles pagination and rate limits, checkpoints progress, retries recoverable failures, and persists exact source timestamps.

Reyo Pack requests `FULFILLMENT`, `PROCEEDS`, `CANCELLATION`, and `PACKAGES` data. Package reference IDs are retained as Amazon package identifiers for idempotent imports; they are not inferred to be External Fulfillment shipment IDs. Tracking, carrier, shipping service, Easy Ship program/status fields, ship time, and ship-from address are retained only when Amazon supplies them. Label documents are served only through an authenticated, private route when an authorized workflow has supplied a document.

The barcode path never calls Amazon synchronously. It resolves AWB/tracking data from the synchronized database, then claims the shipment through `claim_reyo_pack_shipment`. A second device receives an authoritative conflict outcome instead of a UI-only duplicate warning.

## Reyo Pack flow

```text
Camera / hardware scanner
        ▼
Normalize barcode in PostgreSQL
        ▼
Workspace-scoped shipment lookup + row lock
        ▼
UNPACKED → PACKING claim lease
        ▼
Worker sees order, AWB, item quantities, shipping method, and label availability
        ▼
Atomic PACKED transition + immutable events + session counters
        ▼
Realtime state-change signal → other clients re-read bounded queue/history pages
```

Cancellation is a separate authoritative transition. A cancellation never deletes a previous `PACK_CONFIRMED` event. Putaway uses a separate session mode and optimistic location-assignment version so a worker cannot confirm against a stale SKU location.

### Realtime

Database triggers broadcast a low-payload `STATE_CHANGED` event to a private `reyo-pack:<workspace-id>` topic. The payload contains table/operation/record identifiers only; it does not contain order or customer data. Realtime authorization checks workspace membership, and clients re-read authorized API pages after receiving the signal.

### Offline behavior

The PWA caches bounded, read-only operational snapshots and exposes an explicit offline state. It never claims or confirms a package/location while disconnected and never replays unsigned browser mutations. A future offline mutation queue must be tenant-bound, idempotent, signed, and reconciled by the server or desktop worker before it can be enabled.

## AI safety and jobs

AI calls pass through one server gateway that reserves workspace budget before dispatch, records provider usage in micro-units, settles failures conservatively, and associates usage with a durable job when applicable. Structured output is schema-validated; money-impacting actions are proposals requiring policy and human approval. Jobs are claimed one at a time within the serverless deadline, and orphaned work remains accounted for rather than silently disappearing.

## Security boundaries

- Browser cookie mutations require same-origin `Origin`/`Referer` checks; bearer-authenticated non-browser workers are supported separately.
- Administrative routes enforce server-side permissions and workspace membership.
- Supabase secret/service-role keys, SP-API credentials, AI keys, webhook secrets, and encryption keyrings are server-only.
- Sensitive label documents are streamed privately and audited.
- Logs redact credentials and user secrets; API responses use safe, actionable error messages.
- Critical changes append audit/event records and use optimistic versions where an edit can race.

## Deployment responsibilities

Vercel (or an equivalent Node.js host) runs the Next.js app and authenticated cron routes. Supabase provides Auth, PostgreSQL, Realtime, and Storage. Production setup must configure environment variables from `.env.example`, apply migrations before worker traffic, set `CRON_SECRET`, and verify Amazon roles/allowlisting for the connected marketplace. Android camera support and live concurrency require device/project validation outside this repository.
