# System Architecture — SellerPlus OS

SellerPlus OS is a production-grade Amazon Seller Management platform. This document outlines the system architecture, directory structures, data flows, and database designs.

---

## 1. Core Tech Stack
* **Frontend**: Next.js 15 (App Router), React, TypeScript, TailwindCSS, Zustand.
* **Backend**: Next.js Route Handlers, Supabase (PostgreSQL, Realtime, row-level security).
* **Payment Processor**: Razorpay (sandbox integrations mapped to Zustands).
* **AI Engine**: Google Gemini API, OpenAI, Anthropic (Claude), DeepSeek, OpenRouter, and Ollama (integrated with a server-side dynamic load balancer and cascading fallback gateway).
* **Notifications**: Discord embeds, Telegram messages, and Resend email dispatches.

---

## 2. Directory Structure

```
f:\SellerPlus\
├── src/
│   ├── app/
│   │   ├── (auth)/             # Login and signup routes
│   │   ├── (dashboard)/        # Main user console dashboard and sub-pages
│   │   │   ├── admin/          # Super-admin console panel
│   │   │   ├── ai-chat/        # AI Workspace page
│   │   │   ├── amazon-kw/      # Amazon KW project modules
│   │   │   ├── analytics/      # Products, inventory, and P&L reports
│   │   │   │   └── reports/    # Consolidated reports page with PDF print styles
│   │   │   ├── billing/        # Plan selections & Razorpay gate
│   │   │   ├── copywriter/     # Marketplace listing generator
│   │   │   ├── costs/          # Cost profile mapping and ARIA cost chatbot
│   │   │   ├── dashboard/      # Primary performance dashboards
│   │   │   ├── expenses/       # Manual expense journals
│   │   │   ├── goals/          # Target-based achievements tracker
│   │   │   ├── listings/       # Seller Central mirrored listings catalog
│   │   │   ├── settings/       # Connections, keys, notifications & LLM configs
│   │   │   └── layout.tsx
│   │   ├── api/                # Next.js Server Route Handlers
│   │   │   ├── ai/             # Cost Chatbot, Test Gateway, & AI Copywriter
│   │   │   ├── amazon/         # SP-API auth and order synchronizers
│   │   │   ├── billing/        # Razorpay signatures and subscription logs
│   │   │   ├── db/             # Migration scripts
│   │   │   ├── notifications/  # Integration test webhooks
│   │   │   └── workers/        # Inventory safety stockout cron triggers
│   │   ├── globals.css
│   │   └── page.tsx            # Product landing page
│   ├── components/             # Reusable UI controls (Sidebar, GlassCard, ErrorBoundary)
│   ├── hooks/                  # Client-side stores (Zustand) and React hooks
│   └── lib/                    # Core libraries (sp-api, notifications, gemini, utils)
└── supabase/
    └── migrations/             # Consolidated Postgres SQL files and RLS policies
```

---

## 3. Database Normalization & Security
All tenant-scoped tables implement **Row-Level Security (RLS)** using PostgreSQL RLS policies linked directly to `auth.uid() = user_id`.

Key tables:
* `profiles`: Extends user identities with role mapping. Includes `is_super_admin` and `is_suspended` flags.
* `workspaces` & `workspace_members`: Multi-tenant structural tables mapping user membership roles to distinct workspaces.
  * *Security Protection*: Queries are wrapped in a non-recursive `public.is_workspace_member(user_id, workspace_id)` SECURITY DEFINER SQL function to prevent database loop locks during SELECT/UPDATE statements.
* `llm_settings`: Stores active model configurations, API keys, endpoints, and priorities per user.
* `notification_settings`: Stores user-configured webhook parameters, email alert destinations, and toggle configs.
* `cost_profiles`: Stores line-item rates mapped to listings.
* `listings`: Holds synced Seller Central records.
* `orders` & `order_items`: Tracks transaction events and SKU mappings.
* `expenses`: Logs custom operating costs.
* `goals`: Manages milestone markers.
* `inventory_planner`: Forecasts restocks based on order sales velocity.

---

## 4. User Impersonation Mechanism
```
             ┌────────────────────────────────────────────────────────┐
             │       Admin clicks "Impersonate" in /admin view        │
             └───────────────────────────┬────────────────────────────┘
                                         │
                                         ▼
             ┌────────────────────────────────────────────────────────┐
             │     useAuth store copies active user session state     │
             │   - Backup original admin credentials to sp_real_admin │
             │   - Update active session with merchant details        │
             └───────────────────────────┬────────────────────────────┘
                                         │
                                         ▼
             ┌────────────────────────────────────────────────────────┐
             │  Dashboard layout renders floating Impersonation Bar   │
             │   - Click "Exit Mode" to restore admin credentials     │
             └────────────────────────────────────────────────────────┘
```
