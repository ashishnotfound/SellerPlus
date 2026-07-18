"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { BookOpen, Search, ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeEntry {
  id: string;
  title: string;
  description: string;
  evidence: string[];
  confidence: number;
  created_at: string;
  last_verified_at: string;
  version: number;
  status: "Verified" | "Deprecated" | "Under Review";
}

export default function KnowledgeCenterPage() {
  const user = useAuth((s) => s.user);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchKnowledge() {
      if (!user) return;
      const { data, error } = await supabase
        .from("ai_knowledge_center")
        .select("*")
        .order("confidence", { ascending: false });
        
      if (data && !error) {
        setEntries(data as KnowledgeEntry[]);
      }
      setLoading(false);
    }
    fetchKnowledge();
  }, [user]);

  const filtered = entries.filter(e => 
    e.title.toLowerCase().includes(search.toLowerCase()) || 
    e.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-primary" />
            AI Knowledge Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Business truths and patterns discovered by your AI COO over time.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search knowledge..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-md border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <div key={i} className="h-64 bg-card rounded-xl border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border">
          <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium">No knowledge discovered yet</h3>
          <p className="text-muted-foreground">The AI will populate this as it learns from your business data.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map(entry => (
            <div key={entry.id} className="bg-card border rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-tight">{entry.title}</h3>
                <div className={cn(
                  "px-2 py-0.5 rounded text-xs whitespace-nowrap flex items-center gap-1",
                  entry.status === "Verified" ? "bg-green-500/10 text-green-500" :
                  entry.status === "Deprecated" ? "bg-red-500/10 text-red-500" :
                  "bg-yellow-500/10 text-yellow-500"
                )}>
                  {entry.status === "Verified" && <ShieldCheck className="w-3 h-3" />}
                  {entry.status === "Deprecated" && <AlertTriangle className="w-3 h-3" />}
                  {entry.status === "Under Review" && <Clock className="w-3 h-3" />}
                  {entry.status}
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground flex-1">
                {entry.description}
              </p>
              
              {entry.evidence && entry.evidence.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Evidence</span>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    {entry.evidence.map((ev, i) => <li key={i}>{ev}</li>)}
                  </ul>
                </div>
              )}

              <div className="pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex flex-col">
                  <span>Confidence</span>
                  <span className={cn(
                    "font-bold text-sm",
                    entry.confidence > 80 ? "text-green-500" : entry.confidence > 50 ? "text-yellow-500" : "text-red-500"
                  )}>{entry.confidence}%</span>
                </div>
                <div className="flex flex-col items-end">
                  <span>Version v{entry.version}</span>
                  <span>Verified {new Date(entry.last_verified_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
