# Architectural Decision Log — SellerPlus OS

This document records the critical judgment calls, scoping choices, and technical trade-offs made during the development of SellerPlus OS.

---

* **2026-07-09: Charts Selection** — Selected `recharts` for layout graph components because of its Next.js CSR alignment, responsive wrapper layouts, and smooth transition animations.
* **2026-07-10: Local Auth Fallback** — Created local storage fallback authentication stores (`sp_auth_user`) to enable seamless local execution when Supabase keys are not set, preventing white-screen developer blocks.
* **2026-07-10: Market Location defaults** — Set Amazon India (amazon.in) and INR (₹) as the default marketplace region and currency parameters.
* **2026-07-11: Transient AI memory resolution** — Configured ARIA Chatbot tool-calling callbacks to instantly commit schema updates (cost fields, links, configurations) to the Postgres database rather than retaining state in chat memory histories.
* **2026-07-11: Multi-Attribute Listing Matching** — Linked orders sync ingestion to automatically query listings by SKU or ASIN to retrieve matching `listing_id` references, enabling clean relational joins.
* **2026-07-12: Multi-LLM Gateway Priority Selection** — Designed routing system inside `/api/ai/chat` using random weighted selection based on user-configured priorities, with automatic cascading fallback to other active models if a provider call fails.
* **2026-07-12: Server-side Connection Test Isolation** — Implemented `/api/ai/test-gateway` endpoint to perform test requests entirely on the server-side, protecting API keys from leakage into browser console logs and preventing client CORS issues.
* **2026-07-12: Database Trigger for Workspace Seeding** — Updated the Postgres trigger function `handle_new_user` to automatically insert standard workspaces and add users to `workspace_members` on account signup, ensuring zero-configuration workspace bootstrapping.
* **2026-07-12: Print-Optimized Stylesheet for PDF Reports** — Built print-media container stylesheets using print media blocks (`print:hidden`, `hidden print:flex`) to allow users to generate a unified 2-page consolidated document containing both financials and SKU catalogs directly from browser windows, avoiding server-side PDF engine runtimes.
* **2026-07-12: Server-side Webhook Dispatch Channels** — Mapped Discord and Telegram notification engines completely to Next.js route endpoints, ensuring API keys and webhook tokens are never exposed to browser context logs.
* **2026-07-12: Cron-triggered Inventory Alert Worker** — Implemented `/api/workers/inventory-alert` as a GET endpoint that can be queried by external timers or serverless cron tasks to execute background queries on stockout thresholds.
* **2026-07-12: SECURITY DEFINER for RLS Recursion Prevention** — Created a security definer helper function `public.is_super_admin(user_id)` to evaluate administrative credentials in select/update RLS checks. Executing inside postgres database definer contexts prevents circular RLS loops when reading the `profiles` table.
* **2026-07-12: Client-side Context Impersonation** — Developed user impersonation entirely inside client-side auth stores (`useAuth`) using local session substitutions (`sp_real_admin` backups), ensuring dynamic workspace context swapping without needing complex backend session tokens.
* **2026-07-12: Postgres SECURITY DEFINER to Bypass RLS Recursion on workspace_members** — Implemented `public.is_workspace_member(user_id, workspace_id)` as a security definer database function. Evaluated inside RLS checks on the `workspaces` and `workspace_members` tables, it retrieves user workspace memberships cleanly without triggering infinite recursion loop warnings in PostgreSQL.
