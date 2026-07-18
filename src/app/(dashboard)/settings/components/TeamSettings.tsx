"use client";

import React, { useState, useEffect } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { Users, UserPlus, ShieldAlert, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToastStore } from "@/hooks/use-toast-store";

export function TeamSettings() {
  const user = useAuth((s) => s.user);
  const [members, setMembers] = useState<any[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [myRole, setMyRole] = useState("viewer");

  useEffect(() => {
    async function fetchTeam() {
      if (!user?.id) return;
      
      // Get the workspace the user belongs to (optimistically take the first one)
      const { data: wData } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (wData) {
        setActiveWorkspaceId(wData.workspace_id);
        setMyRole(wData.role);
        
        // Fetch all members for this workspace
        const { data: mData } = await supabase
          .from("workspace_members")
          .select("id, role, user_id, created_at, profiles(email, full_name)")
          .eq("workspace_id", wData.workspace_id);
          
        if (mData) {
          setMembers(mData);
        }
      }
    }
    
    fetchTeam();
  }, [user]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspaceId) return;
    if (myRole !== "owner" && myRole !== "admin") {
      useToastStore.getState().error("Access Denied", "Only Owners or Admins can invite new members.");
      return;
    }

    try {
      // 1. Try to find the user by email in profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", inviteEmail)
        .maybeSingle();
        
      let targetUserId = profile?.id;
      
      // If user doesn't exist, we ideally send an invite email. 
      // For this demo, we'll error out if the user doesn't exist, OR we can mock it.
      if (!targetUserId) {
        useToastStore.getState().error("Invite Failed", "Optimistic provisioning requires the user to sign up first before being added.");
        return;
      }

      // Add to workspace
      const { error } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id: activeWorkspaceId,
          user_id: targetUserId,
          role: inviteRole
        });
        
      if (error) {
        if (error.code === '23505') {
          useToastStore.getState().error("Duplicate", "User is already in this workspace.");
        } else {
          throw error;
        }
      } else {
        useToastStore.getState().success("Success", `Added ${inviteEmail} to the team.`);
        setInviteEmail("");
        // Reload
        const { data: mData } = await supabase
          .from("workspace_members")
          .select("id, role, user_id, created_at, profiles(email, full_name)")
          .eq("workspace_id", activeWorkspaceId);
        if (mData) setMembers(mData);
      }
    } catch (err: any) {
      useToastStore.getState().error("Error", err.message);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (myRole !== "owner" && myRole !== "admin") return;
    
    try {
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("id", memberId);
        
      if (error) throw error;
      useToastStore.getState().success("Removed", "Member removed from workspace.");
      setMembers(members.filter(m => m.id !== memberId));
    } catch (err: any) {
      useToastStore.getState().error("Error", err.message);
    }
  };

  return (
    <GlassCard>
      <div className="flex items-center gap-2.5 mb-6">
        <Users className="w-5 h-5 text-indigo-400" />
        <h3 className="text-lg font-bold text-white">Team Management</h3>
      </div>

      <div className="mb-6 bg-black/20 p-4 rounded-xl border border-white/5">
        <h4 className="text-sm font-semibold text-white mb-4">Current Members</h4>
        <div className="flex flex-col gap-3">
          {members.map(member => (
            <div key={member.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div>
                <p className="text-sm text-white font-medium">{member.profiles?.full_name || "Unknown User"}</p>
                <p className="text-xs text-zinc-400">{member.profiles?.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded bg-white/10 ${member.role === 'owner' ? 'text-indigo-400' : 'text-zinc-400'}`}>
                  {member.role}
                </span>
                {(myRole === "owner" || myRole === "admin") && member.role !== "owner" && (
                  <button onClick={() => handleRemove(member.id)} className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {members.length === 0 && <p className="text-xs text-zinc-500">No members found.</p>}
        </div>
      </div>

      {(myRole === "owner" || myRole === "admin") && (
        <form onSubmit={handleInvite} className="flex items-end gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400">Invite by Email</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@sellerplus.in"
              className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 transition-all"
            />
          </div>
          <div className="w-32 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-white/10 bg-[#12121A] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 transition-all"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button
            type="submit"
            className="h-11 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs flex items-center gap-2 transition-all"
          >
            <UserPlus className="w-4 h-4" /> Add
          </button>
        </form>
      )}
    </GlassCard>
  );
}
