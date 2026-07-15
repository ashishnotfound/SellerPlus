# Project Progress Checklist — SellerPlus OS

## Build Phase Checklist

### Phase 0 — Foundations
- [x] Repository scaffold setup
- [x] Basic design system tokens
- [x] Authentication (Email/Password & Google Auth config)
- [x] Multi-tenant Profile & Subscription schemas
- [x] Base Row-Level Security (RLS) policies on profiles

### Phase 1 — Amazon Connect & Core Sync
- [x] OAuth client credentials connect page
- [x] SP-API reports endpoint integration (Listings Reports)
- [x] Orders & Order Items incremental delta sync (using `LastUpdatedAfter`)
- [x] Amazon LWA Refresh Token exchange
- [x] Real-time data pipeline mapping order items to listings in Postgres database
- [x] Dashboard metrics and statistics dynamically populated from active DB orders and listings data

### Phase 2 — Cost & Profit Engine + Expenses
- [x] Custom Cost Configuration profiles setup (printing, packaging, materials, shipping, labor)
- [x] ARIA natural language AI chatbot cost modifications integration
- [x] Dynamic margins calculations live in settings and listings tables
- [x] Expense management ledger tracking custom payments (bank, credit card, cash, UPI)

### Phase 3 — Inventory Intelligence, Listings Management, Goals
- [x] Listings catalog mirrored and synced from Seller Central
- [x] FBA inventory planner showing available, reserved, inbound count
- [x] Low-stock restock suggestions and forecast completion indicators
- [x] Milestone-based goal tracking tied to live profits, revenue, or units sold

### Phase 4 — AI Assistant + Admin Routing
- [x] Streams assistant chat responses and formats tabular data
- [x] Integration of multi-LLM configuration panels (Gemini, OpenAI, Claude, DeepSeek, OpenRouter, Ollama)
- [x] AI gateway route mapping priority routing & model load balancers
- [x] Human confirmation prompt step for destructive actions via Chatbot

### Phase 5 — PDF Reports + Notifications
- [x] Downloadable and printable financial PDF report generation (Consolidated multi-page format combining finances & SKUs with page breaks)
- [x] User-configured notifications destinations (Email, Telegram, Discord webhooks config panels and verify tests)
- [x] Background workers alerting low-stock warning thresholds (Serverless route query `/api/workers/inventory-alert` dispatching alert messages)

### Phase 6 — Admin Super-Panel & RBAC
- [x] RBAC roles configuration (Owner, Manager, Employee permissions)
- [x] Super-Admin overview table for monitoring all user subscriptions & audit logs
- [x] User impersonation & account suspension tools

### Phase 7 — Security, Hardening & Launch Readiness
- [x] Full security audit of client-side key storage (moving remaining key calls to API handlers)
- [x] Final validation of RLS policies with dual workspace isolation tests
- [x] Performance caching and viewport compliance checks
