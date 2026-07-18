"use client";

import React, { useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { User, Save } from "lucide-react";
import { useToastStore } from "@/hooks/use-toast-store";

export function ProfileSettings() {
  const user = useAuth((s) => s.user);
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [role, setRole] = useState(user?.role || "Owner");

  return (
    <GlassCard>
      <div className="flex items-center gap-2.5 mb-6">
        <User className="w-5 h-5 text-indigo-400" />
        <h3 className="text-lg font-bold text-white">Profile Configurations</h3>
      </div>

      <form className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-400">Merchant Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-400">Account Role</label>
          <input
            type="text"
            value={role}
            disabled
            className="w-full h-11 px-4 rounded-xl border border-white/5 bg-white/[0.01] text-zinc-500 text-sm cursor-default"
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-400">Authorized Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full h-11 px-4 rounded-xl border border-white/5 bg-white/[0.01] text-zinc-500 text-sm cursor-default"
          />
        </div>

        <div className="sm:col-span-2 flex justify-end mt-2">
          <button
            type="button"
            onClick={() => useToastStore.getState().success("Saved", "Profile configurations saved.")}
            className="h-11 px-6 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs flex items-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" /> Save Profile Details
          </button>
        </div>
      </form>
    </GlassCard>
  );
}
