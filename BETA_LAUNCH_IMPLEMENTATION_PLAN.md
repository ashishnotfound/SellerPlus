# SellerPlus Private Beta Launch Implementation Plan

## Summary

The current codebase is functionally strong and the test suite is healthy, but the private beta launch is still blocked by a small set of production-sensitive issues:

- The TypeScript build is not currently clean.
- There is a missing Amazon orders API route that the UI expects.
- Feature access and auth state are still partly controlled by client-side state, which is not suitable for a production-facing beta.
- Sensitive credentials and session state are stored in browser storage in a way that should be tightened before wider rollout.

This plan preserves the existing architecture: Next.js route handlers, existing auth middleware, current AI gateway abstractions, Supabase RLS, and the existing job/BI/automation services.

---

## P0 — Critical blockers

### 1) Restore the TypeScript build and missing orders endpoint
Why it exists:
- The UI calls `/api/amazon/orders`, but the project does not currently implement that route.
- The TypeScript compiler is also failing in a few service files because of overly broad types and untyped payload access.

Why it matters:
- This blocks compile validation and can break the Settings and Amazon integration flow during beta.
- It creates risk for regressions in the order sync experience during launch.

Affected files:
- `src/app/api/amazon/orders/route.ts` (new)
- `src/app/(dashboard)/settings/page.tsx`
- `src/lib/amazon-sync-service.ts`
- `src/lib/ai/recommendation-optimizer.ts`

Exact solution:
- Implement a small route handler for `/api/amazon/orders` using the existing auth middleware and the current Amazon sync abstractions.
- Return a normalized orders payload for the existing Settings UI.
- Tighten the types in the Amazon sync service and recommendation optimizer so strict mode compiles cleanly.
- Keep the fix local to the existing service boundaries and avoid introducing new infrastructure.

---

### 2) Remove client-side privilege bypass from plan gating
Why it exists:
- Subscription access is partially enforced by client-side Zustand state and UI checks.
- A user can tamper with browser state to bypass local gating.

Why it matters:
- This is a direct security and trust issue for a paid beta.
- It could allow unauthorized access to premium features and undermine billing integrity.

Affected files:
- `src/hooks/use-subscription.ts`
- `src/app/api/billing/verify-plan/route.ts`
- Relevant feature pages that use subscription gating

Exact solution:
- Keep the existing server API as the authoritative source of truth.
- Ensure the client only reflects server-verified access and never becomes the enforcement mechanism.
- Add defensive checks so feature access is derived from server-returned state and not from mutable local store values alone.
- Preserve the existing hook pattern and route structure rather than introducing a new permissions architecture.

---

## P1 — High-priority hardening

### 3) Reduce browser persistence of sensitive auth and credential state
Why it exists:
- Auth state and Amazon credentials are persisted in browser storage in several places.
- This is convenient for development, but it is not ideal for a beta that may be used by real merchants.

Why it matters:
- Browser storage is accessible to XSS-style attacks and is not appropriate for long-lived secrets.
- It increases the blast radius of a front-end compromise.

Affected files:
- `src/hooks/use-auth.ts`
- `src/app/(dashboard)/settings/page.tsx`
- Any settings-related credential flows that currently write to `localStorage`

Exact solution:
- Stop writing long-lived secrets such as Amazon credentials to browser storage where possible.
- Keep only non-sensitive UI state in browser storage.
- Continue using the existing auth middleware and server-side API routes for protected operations.
- Preserve the current UX by keeping the session flow intact while removing the most sensitive persistence paths.

---

## P2 — Medium-priority quality improvements

### 4) Improve accessibility and resilience of launch-critical flows
Why it exists:
- Several high-traffic UI surfaces are visually polished but still rely on fragile empty states and limited accessibility affordances.

Why it matters:
- Beta users will quickly notice awkward empty states and keyboard/label issues.
- This affects trust and usability during onboarding and first-run experiences.

Affected files:
- High-use pages under `src/app/(dashboard)`
- Shared components in `src/components`

Exact solution:
- Add keyboard-friendly focus states, labels, and meaningful error messaging where missing.
- Keep the existing visual system intact and improve only the user-facing friction points that would affect beta adoption.

---

## Implementation order

1. Fix the missing orders route and TypeScript build blockers.
2. Harden subscription gating so the server remains the source of truth.
3. Remove the most sensitive browser-side persistence paths.
4. Apply small accessibility and resilience improvements.

## Acceptance criteria

- `npx tsc --noEmit` succeeds.
- The test suite remains green.
- The Settings page can use the orders endpoint without runtime breakage.
- Premium feature gating is no longer effectively controlled by client-side state alone.
