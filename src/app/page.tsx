import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

const capabilities = [
  {
    icon: BarChart3,
    title: "Profit intelligence",
    description: "Revenue, fees, advertising, COGS, returns, and contribution margin in one operating view.",
  },
  {
    icon: RefreshCw,
    title: "Amazon operations",
    description: "Durable, incremental synchronization for listings, orders, inventory, refunds, and advertising reports.",
  },
  {
    icon: Bot,
    title: "Controlled AI",
    description: "Tenant-scoped model routing and editable recommendations, with deterministic validation before external actions.",
  },
  {
    icon: Boxes,
    title: "Catalog workflows",
    description: "Manage listings, inventory, bulk work, and marketplace data without loading an entire catalog into the browser.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#070708] text-white">
      <header className="border-b border-white/5 bg-[#070708]/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-500/10 text-sm font-black text-indigo-300">S+</div>
            <div>
              <p className="text-sm font-bold tracking-tight">SellerPlus</p>
              <p className="text-[10px] font-semibold text-zinc-500">Made by ReyoStudio</p>
            </div>
          </div>
          <nav className="flex items-center gap-2" aria-label="Account">
            <Link href="/auth/login" className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white">Sign in</Link>
            <Link href="/auth/signup" className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600">Create account</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              AI-first seller operating system
            </div>
            <h1 className="max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
              Run Amazon operations from one fast, accountable workspace.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              SellerPlus combines marketplace data, profitability, advertising, inventory, and AI-assisted workflows while preserving manual control and an auditable approval boundary.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/auth/signup" className="flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 text-sm font-bold hover:bg-indigo-600">
                Open a workspace <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/auth/login" className="rounded-lg border border-white/10 px-5 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5">Enter SellerPlus</Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d0d10] p-6 shadow-2xl shadow-black/30">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">Operating principles</p>
            <div className="mt-5 space-y-4">
              {[
                "Every marketplace record is tenant scoped",
                "Long-running work runs as a durable job",
                "LLMs propose; policies and users authorize",
                "Official APIs are preferred over browser automation",
                "Data sources and freshness remain visible",
              ].map((principle) => (
                <div key={principle} className="flex items-start gap-3 text-sm text-zinc-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  {principle}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-white/[0.015]">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">One coherent system</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Operational depth without dashboard clutter</h2>
            </div>
            <div className="mt-9 grid gap-px overflow-hidden rounded-2xl border border-white/5 bg-white/5 md:grid-cols-2">
              {capabilities.map(({ icon: Icon, title, description }) => (
                <article key={title} className="bg-[#0a0a0c] p-6">
                  <Icon className="h-5 w-5 text-indigo-400" />
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-6 py-10 text-xs text-zinc-600 sm:flex-row">
        <p>© {new Date().getFullYear()} ReyoStudio. SellerPlus.</p>
        <p>SellerPlus is an independent product. Amazon is an integration provider.</p>
      </footer>
    </div>
  );
}
