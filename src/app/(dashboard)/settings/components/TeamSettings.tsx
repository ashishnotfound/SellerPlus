"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { useToastStore } from "@/hooks/use-toast-store";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";

interface TeamMember {
  id: string;
  role: string;
  user_id: string;
  created_at: string;
  profiles: { email: string | null; full_name: string | null } | null;
}

export function TeamSettings() {
  const workspaceId = useAuth((state) => state.user?.workspaceId);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await sellerplusApiFetch("/api/settings/team");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Team members could not be loaded.");
      setMembers(payload.data ?? []);
    } catch (error) {
      useToastStore.getState().error("Team unavailable", error instanceof Error ? error.message : "Try again later.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await sellerplusApiFetch("/api/settings/team", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Member could not be added.");
      setEmail("");
      await load();
      useToastStore.getState().success("Member added", "Workspace access was granted.");
    } catch (error) {
      useToastStore.getState().error("Member not added", error instanceof Error ? error.message : "Try again later.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(membershipId: string) {
    setSaving(true);
    try {
      const response = await sellerplusApiFetch("/api/settings/team", {
        method: "DELETE",
        body: JSON.stringify({ membershipId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Member could not be removed.");
      setMembers((current) => current.filter((member) => member.id !== membershipId));
      useToastStore.getState().success("Member removed", "Workspace access was revoked.");
    } catch (error) {
      useToastStore.getState().error("Member not removed", error instanceof Error ? error.message : "Try again later.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard>
      <div className="mb-6 flex items-center gap-2.5">
        <Users className="h-5 w-5 text-indigo-400" />
        <h3 className="text-lg font-bold text-white">Team management</h3>
      </div>

      <div className="mb-6 rounded-xl border border-white/[0.06] bg-black/20 p-4">
        <h4 className="mb-4 text-sm font-semibold text-white">Current members</h4>
        {loading ? (
          <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
        ) : members.length === 0 ? (
          <p className="text-xs text-zinc-500">No team members were returned.</p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{member.profiles?.full_name || member.profiles?.email || "SellerPlus user"}</p>
                  <p className="truncate text-xs text-zinc-500">{member.profiles?.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded bg-white/10 px-2 py-1 text-[10px] font-bold uppercase text-zinc-400">{member.role.replaceAll("_", " ")}</span>
                  {member.role !== "owner" && (
                    <button type="button" disabled={saving} onClick={() => void removeMember(member.id)} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/20 disabled:opacity-50" aria-label="Remove member">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={addMember} className="grid items-end gap-3 md:grid-cols-[1fr_180px_auto]">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-400">Existing SellerPlus user email</span>
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="colleague@example.com" className="h-11 rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm text-white focus:border-indigo-500 focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-zinc-400">Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value)} className="h-11 rounded-xl border border-white/10 bg-[#12121A] px-3 text-sm text-white focus:border-indigo-500 focus:outline-none">
            <option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
            <option value="ppc_manager">PPC Manager</option><option value="catalog_manager">Catalog Manager</option>
            <option value="operations">Operations</option><option value="finance">Finance</option>
          </select>
        </label>
        <button type="submit" disabled={saving} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-xs font-bold text-white hover:bg-indigo-600 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add member
        </button>
      </form>
      <p className="mt-3 text-[11px] text-zinc-600">Email invitation delivery is intentionally unavailable until a verified transactional-email flow is configured.</p>
    </GlassCard>
  );
}
