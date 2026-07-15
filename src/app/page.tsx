// Trigger redeployment to force Vercel build of all TS fixes
"use client";

import Link from "next/link";
import { ArrowRight, Bot, Compass, Cpu, LineChart, Shield, Zap, Check, Star } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  const features = [
    {
      icon: <Bot className="w-6 h-6 text-indigo-400" />,
      title: "AI Listing Judge™",
      description: "Audit listings instantly. Obtain numeric conversions, keyword relevancy, and image scorecards with granular suggestions."
    },
    {
      icon: <Cpu className="w-6 h-6 text-emerald-400" />,
      title: "Gemini Keyword Engine™",
      description: "Extract high-opportunity search terms using competitive intelligence and search volumes optimized for Indian buyers."
    },
    {
      icon: <LineChart className="w-6 h-6 text-indigo-400" />,
      title: "Profit Analytics",
      description: "Real-time insights across platforms. Monitor actual returns, shipping commissions, ad costs, and real GST breakdowns."
    },
    {
      icon: <Compass className="w-6 h-6 text-emerald-400" />,
      title: "Master SKU System",
      description: "Single core catalog linking ASINs, Flipkart Listings, Meesho catalog layouts, and Shopify inventories simultaneously."
    },
    {
      icon: <Zap className="w-6 h-6 text-indigo-400" />,
      title: "Automation Engine",
      description: "Define trigger actions: Automatically pause out-of-stock listings, dynamically adjust pricing, and flag profit alerts."
    },
    {
      icon: <Shield className="w-6 h-6 text-emerald-400" />,
      title: "Enterprise Security",
      description: "Fine-grained team permissions, absolute Row-Level Security, multi-factor authentication, and deep action audit logs."
    }
  ];

  const plans = [
    {
      name: "Free",
      price: "₹0",
      period: "forever",
      desc: "For exploring the platform",
      features: ["10 AI Generations", "3 Listing Audits", "Email support"],
      color: "border-white/5 bg-white/[0.01]",
      btn: "Start Free",
      href: "/auth/signup"
    },
    {
      name: "Weekly",
      price: "₹50",
      period: "week",
      desc: "Perfect for quick auditing sprints",
      features: ["50 AI Generations", "15 Listing Audits", "Keyword Engine", "Competitor analysis"],
      color: "border-amber-500/10 bg-amber-500/[0.01]",
      btn: "Get Weekly",
      href: "/auth/signup",
      highlight: true
    },
    {
      name: "Pro",
      price: "₹500",
      period: "month",
      desc: "Ultimate toolkit for growing brands",
      features: ["200 AI Generations", "50 Listing Audits", "Full listing mode", "Etsy/Shopify support", "A+ & Brand Story support"],
      color: "border-emerald-500/20 bg-emerald-500/[0.01] shadow-[0_0_30px_rgba(16,185,129,0.02)]",
      btn: "Get Pro",
      href: "/auth/signup",
      popular: true
    },
    {
      name: "Business",
      price: "₹6,000",
      period: "6 months",
      desc: "Enterprise power for power sellers",
      features: ["Unlimited generations", "Unlimited audits", "Everything in Pro", "Dedicated Account Manager", "API Credentials"],
      color: "border-rose-500/10 bg-rose-500/[0.01]",
      btn: "Join Business",
      href: "/auth/signup"
    }
  ];

  const testimonials = [
    {
      quote: "SellerPlus audited my listings and helped me identify missing keywords. Within 2 weeks my conversion went from 2.1% to 4.8% on my top products.",
      author: "Ananya S.",
      role: "Founder, SleepyTech Ortho",
      stars: 5
    },
    {
      quote: "Generating Shopify and Etsy descriptions in the Pro Plan saved our copywriting team hundreds of hours. Tone adjustment is incredibly accurate.",
      author: "Rohan D.",
      role: "eCommerce Lead, CraftVibe India",
      stars: 5
    }
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050506]">
      {/* Background glow graphics */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-900/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-5 border-b backdrop-blur-md bg-black/30 border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-emerald-400">
            <span className="text-sm font-black text-black">S+</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">SellerPlus</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/auth/login" className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            Login
          </Link>
          <Link href="/auth/signup" className="px-4 py-2 text-sm font-medium text-black bg-gradient-to-r from-indigo-400 to-emerald-400 hover:opacity-90 rounded-lg transition-opacity">
            Sign Up
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-20 lg:py-32 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-indigo-300 mb-8"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
          The AI Commerce Operating System for Modern Sellers
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl leading-[1.1] mb-8"
        >
          Replace Helium 10, Sellerboard, and spreadsheet workflows.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg sm:text-xl text-zinc-400 max-w-3xl mb-12"
        >
          An all-in-one system with real databases, real-time sync, and Gemini-driven listing optimizations to manage Amazon, Flipkart, Meesho, and Shopify.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 mb-24"
        >
          <Link href="/auth/signup" className="flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold text-black bg-gradient-to-r from-indigo-400 to-emerald-400 hover:opacity-90 rounded-lg shadow-xl shadow-indigo-500/10 transition-opacity">
            Start Free Trial <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/auth/login" className="flex items-center justify-center px-8 py-4 text-base font-semibold border border-white/10 rounded-lg hover:bg-white/5 transition-colors">
            Enter Workspace
          </Link>
        </motion.div>

        {/* Feature Grid */}
        <div className="flex flex-col gap-4 items-center mb-16 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Full-Suite Optimization Suite</h2>
          <p className="text-sm text-zinc-400 max-w-xl">Every tool necessary to accelerate conversion and dominate organic search indices.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full text-left mb-32">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="glass-panel glass-panel-hover p-8 rounded-2xl flex flex-col gap-4"
            >
              <div className="p-3 bg-white/5 rounded-xl w-fit">
                {f.icon}
              </div>
              <h3 className="text-xl font-bold text-white">{f.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>

        {/* Pricing Tiers Section */}
        <div className="flex flex-col gap-4 items-center mb-16 text-center w-full">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Flexible Pricing Plans</h2>
          <p className="text-sm text-zinc-400 max-w-xl">Start completely free or scale up features on-demand as your listing volume increases.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full text-left mb-32">
          {plans.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className={cn(
                "p-6 rounded-2xl border flex flex-col justify-between relative transition-all duration-300 hover:shadow-2xl hover:border-white/20",
                p.color,
                p.popular && "border-emerald-500/40 shadow-[0_0_40px_rgba(16,185,129,0.05)]"
              )}
            >
              {p.popular && (
                <span className="absolute -top-3 left-6 bg-emerald-500 text-black text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full animate-pulse">
                  Most Popular
                </span>
              )}
              {p.highlight && (
                <span className="absolute -top-3 left-6 bg-amber-500 text-black text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full">
                  Best Value
                </span>
              )}

              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-base font-bold text-white">{p.name}</h3>
                  <p className="text-[10px] text-zinc-500 mt-1">{p.desc}</p>
                  <div className="flex items-baseline gap-1 mt-4">
                    <span className="text-3xl font-black text-white">{p.price}</span>
                    <span className="text-xs text-zinc-500">/{p.period}</span>
                  </div>
                </div>

                <ul className="flex flex-col gap-2.5 text-xs text-zinc-300">
                  {p.features.map((feat, idx) => (
                    <li key={idx} className="flex gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link href={p.href} className={cn(
                "w-full h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 mt-8 border transition-all",
                p.popular 
                  ? "bg-gradient-to-r from-indigo-400 to-emerald-400 text-black hover:opacity-90 border-transparent"
                  : "border-white/10 text-zinc-300 hover:bg-white/5"
              )}>
                {p.btn} <ArrowRight className="w-3 h-3" />
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Testimonials Section */}
        <div className="flex flex-col gap-4 items-center mb-16 text-center w-full">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Merchant Validation</h2>
          <p className="text-sm text-zinc-400 max-w-xl">See how professional eCommerce operators scale their operations with SellerPlus.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full text-left mb-12">
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass-panel p-8 rounded-2xl flex flex-col justify-between gap-6 border border-white/5 bg-white/[0.01]"
            >
              <div className="flex flex-col gap-4">
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400 stroke-amber-400" />
                  ))}
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed italic">"{t.quote}"</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-white">{t.author}</span>
                <span className="text-[10px] text-zinc-500">{t.role}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-8 text-center text-zinc-600 text-sm">
        <p>&copy; {new Date().getFullYear()} SellerPlus. Built for modern Indian commerce.</p>
      </footer>
    </div>
  );
}
