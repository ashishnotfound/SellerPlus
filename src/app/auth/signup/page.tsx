"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, Lock, Mail, ShieldAlert, Store } from "lucide-react";
import { motion } from "framer-motion";

export default function SignupPage() {
  const router = useRouter();
  const signup = useAuth((s) => s.signup);
  const user = useAuth((s) => s.user);
  const checkSession = useAuth((s) => s.checkSession);
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (user?.isAuthenticated) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    if (!storeName || !email || !password) {
      setError("Please fill in all details.");
      setIsSubmitting(false);
      return;
    }

    try {
      const success = await signup(email, password, storeName);
      if (success) {
        router.push("/dashboard");
      } else {
        setError("Failed to create account. Email may already exist.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#050506] px-4">
      {/* Background glow graphics */}
      <div className="absolute top-1/4 left-1/4 w-[40%] h-[40%] rounded-full bg-indigo-900/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[40%] h-[40%] rounded-full bg-emerald-900/10 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md p-8 rounded-2xl glass-panel relative z-10"
      >
        {/* Brand header */}
        <div className="flex flex-col items-center text-center gap-2 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400">
            <span className="text-sm font-black text-black">S+</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white mt-2">Initialize Workspace</h2>
          <p className="text-xs text-zinc-400">Setup your centralized Multi-Marketplace Seller profile.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 flex items-start gap-3 text-xs text-rose-300">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Store / Business Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400">Store / Company Name</label>
            <div className="relative">
              <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Mahadev Commerce"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.02] focus:bg-white/[0.04] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-zinc-600"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400">Store Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="email"
                placeholder="seller@sellerplus.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.02] focus:bg-white/[0.04] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-zinc-600"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 pl-10 pr-10 rounded-xl border border-white/10 bg-white/[0.02] focus:bg-white/[0.04] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-zinc-600"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-400 to-emerald-400 hover:opacity-90 font-bold text-sm text-black flex items-center justify-center transition-all disabled:opacity-50 mt-2"
          >
            {isSubmitting ? "Creating..." : "Initialize Free Workspace"}
          </button>
        </form>

        {/* Alternate redirect */}
        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-zinc-500">
            Already registered?{" "}
            <Link href="/auth/login" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
              Access Workspace
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
