"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { GitPullRequest, Search, CheckCircle, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface DecisionEntry {
  id: string;
  recommendation: string;
  ai_reasoning: string;
  confidence: number;
  lifecycle: string; // Draft, Validated, Pending Approval, Approved, Executing, Completed, Rolled Back, Archived
  created_at: string;
  simulation: { expectedCase?: { expectedProfitImpact?: number } } | null;
}

export default function DecisionJournalPage() {
  const user = useAuth((s) => s.user);
  const [entries, setEntries] = useState<DecisionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDecisions() {
      if (!user) return;
      try {
        const response = await sellerplusApiFetch("/api/ai/decisions?limit=200");
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Decision history is unavailable.");
        setEntries(body.data ?? []);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Decision history is unavailable.");
      } finally {
        setLoading(false);
      }
    }
    fetchDecisions();
  }, [user]);

  const filtered = entries.filter(e => 
    e.recommendation?.toLowerCase().includes(search.toLowerCase()) || 
    e.ai_reasoning?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <GitPullRequest className="w-8 h-8 text-primary" />
            Decision Journal
          </h1>
          <p className="text-muted-foreground mt-1">
            Track historical AI recommendations, projected outcomes, and measurement status.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search decisions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-md border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="h-32 bg-card rounded-xl border animate-pulse" />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-500">
          {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border">
          <GitPullRequest className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium">No decisions recorded</h3>
          <p className="text-muted-foreground">Approve or reject AI recommendations to see them here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(entry => (
            <div key={entry.id} className="bg-card border rounded-xl p-5 flex flex-col md:flex-row gap-6">
              
              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-lg leading-tight mb-1">{entry.recommendation || "No title"}</h3>
                    <p className="text-sm text-muted-foreground">{entry.ai_reasoning}</p>
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1.5",
                    entry.lifecycle === "Approved" || entry.lifecycle === "Completed" ? "bg-green-500/10 text-green-500" :
                    entry.lifecycle === "Archived" || entry.lifecycle === "Rolled Back" ? "bg-red-500/10 text-red-500" :
                    "bg-yellow-500/10 text-yellow-500"
                  )}>
                    {(entry.lifecycle === "Approved" || entry.lifecycle === "Completed") && <CheckCircle className="w-3.5 h-3.5" />}
                    {(entry.lifecycle === "Archived" || entry.lifecycle === "Rolled Back") && <XCircle className="w-3.5 h-3.5" />}
                    {(entry.lifecycle === "Draft" || entry.lifecycle === "Pending Approval" || entry.lifecycle === "Executing") && <Clock className="w-3.5 h-3.5" />}
                    {entry.lifecycle || "Pending"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Expected Outcome</span>
                    <p className="text-sm">
                      {typeof entry.simulation?.expectedCase?.expectedProfitImpact === "number" ? (
                        <span className={entry.simulation.expectedCase.expectedProfitImpact > 0 ? "text-green-500" : "text-red-500"}>
                          {entry.simulation.expectedCase.expectedProfitImpact > 0 ? "+" : ""}₹{entry.simulation.expectedCase.expectedProfitImpact} projected
                        </span>
                      ) : "N/A"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Actual Result</span>
                    <p className="text-sm text-muted-foreground">
                      Not measured
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">No automatic outcome attribution is configured.</p>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-48 bg-muted rounded-lg p-4 flex flex-col justify-center items-center text-center shrink-0">
                <span className="text-xs text-muted-foreground uppercase mb-1">AI Confidence</span>
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <path className="text-background stroke-current" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className={cn("stroke-current", entry.confidence > 80 ? "text-green-500" : entry.confidence > 50 ? "text-yellow-500" : "text-red-500")} strokeWidth="3" strokeDasharray={`${entry.confidence}, 100`} fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div className="absolute text-sm font-bold">{entry.confidence || 0}%</div>
                </div>
                <span className="text-xs text-muted-foreground mt-3 block">
                  {new Date(entry.created_at).toLocaleDateString()}
                </span>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
