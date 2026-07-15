"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, Lock, Mail, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuth((s) => s.login);
  const user = useAuth((s) => s.user);
  const checkSession = useAuth((s) => s.checkSession);
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

    if (!email || !password) {
      setError("Please fill in all credentials.");
      setIsSubmitting(false);
      return;
    }

    try {
      const success = await login(email, password);
      if (success) {
        router.push("/dashboard");
      } else {
        setError("Invalid email or password.");
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
          <h2 className="text-2xl font-bold tracking-tight text-white mt-2">Welcome to SellerPlus</h2>
          <p className="text-xs text-zinc-400">Enter your credentials to access your operating workspace.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 flex items-start gap-3 text-xs text-rose-300">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400">Store Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="email"
                placeholder="you@store.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/10 bg-white/[0.02] focus:bg-white/[0.04] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-zinc-600"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-400">Password</label>
              <a href="#" className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                Forgot password?
              </a>
            </div>
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
            {isSubmitting ? "Syncing..." : "Login to Workspace"}
          </button>
        </form>

        {/* Alternate log-in triggers */}
        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col gap-4 text-center">
          <div className="flex items-center justify-center gap-4">
            <button className="flex-1 h-10 rounded-lg border border-white/5 hover:border-white/10 bg-white/[0.01] hover:bg-white/[0.03] text-xs font-semibold text-zinc-300 hover:text-white transition-all">
              Google Workspace
            </button>
            <button className="flex-1 h-10 rounded-lg border border-white/5 hover:border-white/10 bg-white/[0.01] hover:bg-white/[0.03] text-xs font-semibold text-zinc-300 hover:text-white transition-all">
              OTP via Phone
            </button>
          </div>

          <p className="text-xs text-zinc-500">
            Don't have an account?{" "}
            <Link href="/auth/signup" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
              Request Invite
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
