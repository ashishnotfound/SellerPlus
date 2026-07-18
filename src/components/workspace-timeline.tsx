"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Target, GitPullRequest, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  id: string;
  type: "goal" | "decision";
  title: string;
  description: string;
  date: Date;
  status: string;
  impact?: string;
}

export function WorkspaceTimeline() {
  const user = useAuth((s) => s.user);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTimeline() {
      if (!user) return;
      
      const [goalsRes, decisionsRes] = await Promise.all([
        supabase.from("goals").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("ai_recommendation_history").select("*").in("lifecycle", ["Approved", "Completed"]).order("created_at", { ascending: false }).limit(20)
      ]);

      const timeline: TimelineEvent[] = [];

      goalsRes.data?.forEach((g: any) => {
        timeline.push({
          id: `goal_${g.id}`,
          type: "goal",
          title: g.title,
          description: g.description || "Goal created",
          date: new Date(g.created_at),
          status: g.status
        });
      });

      decisionsRes.data?.forEach((d: any) => {
        timeline.push({
          id: `dec_${d.id}`,
          type: "decision",
          title: d.recommendation || "Strategic Decision",
          description: d.ai_reasoning,
          date: new Date(d.created_at),
          status: d.lifecycle,
          impact: d.simulation?.expectedCase?.expectedProfitImpact ? `Expected +₹${d.simulation.expectedCase.expectedProfitImpact} Profit` : undefined
        });
      });

      timeline.sort((a, b) => b.date.getTime() - a.date.getTime());
      setEvents(timeline);
      setLoading(false);
    }
    
    fetchTimeline();
  }, [user]);

  if (loading) {
    return <div className="h-64 animate-pulse bg-muted rounded-xl"></div>;
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 border rounded-xl border-dashed">
        <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">Your workspace timeline will appear here as you complete goals and execute AI decisions.</p>
      </div>
    );
  }

  return (
    <div className="relative border-l border-border ml-4 space-y-8 py-4">
      {events.map((event, index) => (
        <div key={event.id} className="relative pl-8">
          <div className={cn(
            "absolute -left-4 w-8 h-8 rounded-full border-4 border-background flex items-center justify-center",
            event.type === "goal" ? "bg-blue-500" : "bg-purple-500"
          )}>
            {event.type === "goal" ? <Target className="w-3.5 h-3.5 text-white" /> : <GitPullRequest className="w-3.5 h-3.5 text-white" />}
          </div>
          
          <div className="bg-card border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-semibold text-base">{event.title}</h4>
              <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                {event.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            
            <p className="text-sm text-muted-foreground mb-3">{event.description}</p>
            
            <div className="flex gap-3 items-center">
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {event.status === "completed" ? "Goal Achieved" : event.status}
              </div>
              
              {event.impact && (
                <div className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">
                  {event.impact}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
