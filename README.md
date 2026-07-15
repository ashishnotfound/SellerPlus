<div align="center">
  <img src="https://via.placeholder.com/150x150.png?text=SellerPlus" alt="SellerPlus Logo" width="150" height="150" />
  <h1>SellerPlus OS</h1>
  <p>The autonomous, AI-driven operating system for modern Amazon Sellers.</p>

  <p>
    <a href="#features">Features</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#deployment">Deployment</a>
  </p>
</div>

---

## 🚀 Overview

**SellerPlus** is a multi-tenant, enterprise-grade B2B SaaS application designed to centralize and automate Amazon FBA operations. Built for high-volume sellers, it replaces fragmented spreadsheets and legacy software with an intelligent, centralized operating system.

By leveraging **autonomous background workers** and an **AI Business Intelligence (BI) Engine**, SellerPlus constantly scans for profit leaks, executes automated advertising adjustments, drafts high-converting listings, and streamlines warehouse operations.

---

## ✨ Core Features

### 🧠 AI & Automation
- **Autonomous BI Engine:** Daily processing of sales and cost data to identify macro trends and anomalies.
- **Profit Leak Detector:** Scans for high-ACOS campaigns, dead inventory, and margin erosion, automatically generating actionable alerts.
- **Automation Engine:** Rule-based execution system (e.g., auto-pausing bleeding campaigns, adjusting bids based on ROI goals).
- **AI Listing Drafter:** Generates SEO-optimized Amazon listings tailored to specific keywords and competitive analysis.

### 📊 Operations & Analytics
- **Amazon SP-API Integration:** Syncs orders, financial events (fees, commissions), and FBA inventory seamlessly.
- **Real-Time Dashboards:** Deep dive into profitability, advertising spend, inventory velocity, and operational KPIs.
- **Warehouse OS:** First-class modules for picking, packing slip generation, shipping operations, and barcode integration.
- **Multi-Tenant Workspaces:** Secure tenant isolation via Supabase Row Level Security (RLS) and environment configurations.

---

## 🏗 Architecture

SellerPlus follows a modular, serverless architecture optimized for high scalability:

1. **AI Gateway:** A centralized unified layer for LLM requests with built-in resilience, caching, fallback providers, and structured schemas.
2. **Background Workers (Cron):** Stateless serverless functions triggered by external cron services to handle heavy lifting asynchronously.
3. **Repository Layer:** Strongly-typed Data Access Objects (DAOs) interfacing with Supabase to abstract away direct database calls.
4. **JobService & BI_Jobs:** Asynchronous task queue tracking state for long-running operations like catalog synchronization and historical BI generation.

---

## 🛠 Tech Stack

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Radix UI, Framer Motion
- **Database & Auth:** [Supabase](https://supabase.com/) (PostgreSQL + RLS)
- **AI Provider:** Google Gemini / unified LLM adapters
- **Deployment:** Vercel

---

## 📦 Getting Started

### Prerequisites

- Node.js >= 20.x
- A Supabase project
- API Keys for Google Gemini (or alternate LLMs)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ashishnotfound/SellerPlus.git
   cd SellerPlus
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env.local` file and populate it with your Supabase and AI keys:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   GEMINI_API_KEY=your_gemini_key
   CRON_SECRET=your_cron_secret
   ```

4. **Run database migrations:**
   Apply the provided SQL schemas located in `supabase/migrations/` via the Supabase Dashboard SQL Editor or CLI.

5. **Start the development server:**
   ```bash
   npm run dev
   ```

---

## 🚀 Deployment

SellerPlus is pre-configured for seamless deployment to **Vercel**. 

1. Push your code to GitHub.
2. Import the repository in Vercel.
3. Add the required Environment Variables in the Vercel dashboard.
4. Deploy!

*(Note: The repository includes a `.npmrc` file configured to bypass strict peer dependency checks specifically for Next 15 / React 19 compatibility.)*

---

<div align="center">
  <p>Built with ❤️ by Ashish.</p>
</div>
