"use client";

import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeRecommendations } from "@/hooks/use-realtime-recommendations";
import { RecommendationCard } from "@/components/ui/recommendation-card";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, Activity, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AutomationRecommendationCenter() {
  const user = useAuth((s) => s.user);
  const { recommendations, loading } = useRealtimeRecommendations(user?.id);
  const [filter, setFilter] = useState<string>("All");

  const handleAction = async (id: string, action: "Approved" | "Archived" | "Executing") => {
    await supabase.from("ai_recommendation_history").update({ lifecycle: action }).eq("id", id);
  };

  const filteredRecs = recommendations.filter(r => {
    if (filter === "All") return true;
    return r.lifecycle === filter;
  });

  const proposedCount = recommendations.filter(r => r.lifecycle === "Pending Approval").length;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Activity className="w-7 h-7 text-primary" />
            Recommendation Center & Timeline
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review AI-proposed actions, track execution history, and monitor automation impact.
          </p>
        </div>
      </div>

      {/* Stats & Filters */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-center bg-card/50 border rounded-xl p-4">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total</span>
            <span className="text-xl font-bold">{recommendations.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Action Required</span>
            <span className="text-xl font-bold text-orange-400">{proposedCount}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {["All", "Pending Approval", "Approved", "Executing", "Completed", "Archived"].map((f) => (
            <Button 
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="text-xs h-8"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {/* Recommendations Feed */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Activity className="w-8 h-8 animate-spin mb-4 text-primary" />
          <p className="text-sm font-semibold">Syncing Automation Engine...</p>
        </div>
      ) : filteredRecs.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-xl bg-card/20">
          <ShieldCheck className="w-12 h-12 text-primary mb-4" />
          <h3 className="text-lg font-bold mb-2">Inbox Zero</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            No recommendations match this filter. The BI Engine is continuously analyzing your store for new optimization opportunities.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredRecs.map(rec => (
            <RecommendationCard 
              key={rec.id} 
              recommendation={rec}
              onApprove={(id) => handleAction(id, "Approved")}
              onReject={(id) => handleAction(id, "Archived")}
              onExecute={(id) => handleAction(id, "Executing")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
