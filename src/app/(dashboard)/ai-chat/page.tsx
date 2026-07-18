"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles, Trash2, Send, Bot, RefreshCw, BarChart2, BookOpen, GitPullRequest, Settings, ShieldAlert, Zap, TrendingUp, TrendingDown, Target, Package, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { BIResponse } from "@/lib/ai/schemas";
import { WidgetRenderer } from "@/components/ui/widgets/WidgetRenderer";
import { RecommendationCard } from "@/components/ui/recommendation-card";
import { supabase } from "@/lib/supabase";
import { useToastStore } from "@/hooks/use-toast-store";
import { DailyBriefing } from "@/lib/ai/schemas";
import { BusinessHealthResponse } from "@/lib/ai/schemas";

type TabId = "chat" | "insights" | "knowledge" | "decisions" | "tools";

interface ChatMessage {
  id: string;
  sender: "user" | "aria";
  text?: string;
  timestamp: string;
  payload?: BIResponse;
}

export default function AIWorkspace() {
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const user = useAuth((s) => s.user);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-6xl mx-auto w-full pb-4 px-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            AI Workspace
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your intelligent business operating system.
          </p>
        </div>
      </div>

      <div className="flex border-b mb-4 space-x-1">
        <TabButton id="chat" active={activeTab} setActive={setActiveTab} icon={<Bot className="w-4 h-4" />} label="Chat" />
        <TabButton id="insights" active={activeTab} setActive={setActiveTab} icon={<BarChart2 className="w-4 h-4" />} label="Insights" />
        <TabButton id="knowledge" active={activeTab} setActive={setActiveTab} icon={<BookOpen className="w-4 h-4" />} label="Knowledge" />
        <TabButton id="decisions" active={activeTab} setActive={setActiveTab} icon={<GitPullRequest className="w-4 h-4" />} label="Decisions" />
        <TabButton id="tools" active={activeTab} setActive={setActiveTab} icon={<Settings className="w-4 h-4" />} label="Tools" />
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "chat" && <ChatTab />}
        {activeTab === "insights" && <InsightsTab />}
        {activeTab === "knowledge" && <KnowledgeTab />}
        {activeTab === "decisions" && <DecisionsTab />}
        {activeTab === "tools" && <ToolsTab />}
      </div>
    </div>
  );
}

function TabButton({ id, active, setActive, icon, label }: { id: TabId; active: TabId; setActive: (id: TabId) => void; icon: React.ReactNode; label: string }) {
  const isActive = active === id;
  return (
    <button
      onClick={() => setActive(id)}
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
        isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      )}
    >
      {icon} {label}
    </button>
  );
}

// ─── Chat Tab ─────────────────────────────────────────────────────────────

function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    "Run a full store audit",
    "Why are my sales dropping this week?",
    "Which advertising campaigns are wasting money?",
    "Which listings should I improve first?",
  ];

  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        sender: "aria",
        text: "Hello! I am ARIA, your AI Business Consultant. I can run advanced store audits, analyze your advertising spend, and detect profit leaks. Every recommendation I make is backed by real data from your connected databases.\n\nWhat would you like me to analyze today?",
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      }
    ]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (query: string) => {
    if (!query.trim() || loading) return;
    
    const userMsg: ChatMessage = {
      id: "user_" + Date.now(),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/ai/bi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ mode: "Custom Query", customPrompt: query }),
      });

      if (!response.ok) throw new Error("Failed to process analysis.");

      const biData: BIResponse = await response.json();
      
      const ariaMsg: ChatMessage = {
        id: "aria_" + Date.now(),
        sender: "aria",
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        payload: biData
      };

      setMessages((prev) => [...prev, ariaMsg]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setMessages((prev) => [...prev, {
        id: "aria_error_" + Date.now(),
        sender: "aria",
        text: `Analysis failed: ${msg}`,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRecommendationAction = async (id: string, action: "Approved" | "Archived" | "Executing") => {
    await supabase.from("ai_recommendation_history").update({ lifecycle: action }).eq("id", id);
    useToastStore.getState().success(`Recommendation ${action}`);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-6 p-4 rounded-xl border bg-card/50 no-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex gap-4", msg.sender === "user" ? "ml-auto max-w-[80%]" : "mr-auto w-full")}>
            {msg.sender === "aria" && (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}
            
            <div className={cn("flex flex-col gap-2", msg.sender === "user" ? "items-end" : "w-full")}>
              {msg.sender === "user" && (
                <div className="bg-primary text-primary-foreground p-4 rounded-2xl rounded-tr-none text-sm">
                  {msg.text}
                </div>
              )}

              {msg.sender === "aria" && msg.text && (
                <div className="bg-muted border p-4 rounded-2xl rounded-tl-none text-sm whitespace-pre-wrap">
                  {msg.text}
                </div>
              )}

              {msg.sender === "aria" && msg.payload && (
                <div className="flex flex-col gap-6 w-full">
                  <div className="bg-muted border p-4 rounded-2xl rounded-tl-none text-sm">
                    {msg.payload.summary}
                  </div>
                  {msg.payload.widgets.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                      {msg.payload.widgets.map((widget) => (
                        <WidgetRenderer key={widget.id} widget={widget} />
                      ))}
                    </div>
                  )}
                  {msg.payload.recommendations.length > 0 && (
                    <div className="space-y-4 w-full">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Actionable Recommendations</h3>
                      {msg.payload.recommendations.map((rec) => (
                        <RecommendationCard 
                          key={rec.id} 
                          recommendation={rec}
                          onApprove={(id) => handleRecommendationAction(id, "Approved")}
                          onReject={(id) => handleRecommendationAction(id, "Archived")}
                          onExecute={(id) => handleRecommendationAction(id, "Executing")}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-primary" /></div>
            <div className="bg-muted border p-4 rounded-2xl rounded-tl-none text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" /> Analyzing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="mt-4 shrink-0 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {suggestions.map((sug, i) => (
            <button key={i} onClick={() => handleSend(sug)} className="text-xs bg-muted hover:bg-accent border px-3 py-1.5 rounded-full whitespace-nowrap transition-colors">
              {sug}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handleSend(input); }} className="relative">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask for an audit, optimization strategies, or profit analysis..." className="w-full h-12 pl-4 pr-12 rounded-xl border bg-card focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
          <button type="submit" disabled={loading || !input.trim()} className="absolute right-2 top-2 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 hover:opacity-90">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Insights Tab ─────────────────────────────────────────────────────────

function InsightsTab() {
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [health, setHealth] = useState<BusinessHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInsights() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers = { ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) };
        
        const [briefingRes, healthRes] = await Promise.all([
          fetch("/api/ai/briefing", { headers }),
          fetch("/api/ai/health", { headers })
        ]);

        if (briefingRes.ok) {
          const json = await briefingRes.json();
          if (json.success) setBriefing(json.data);
        }
        if (healthRes.ok) {
          const json = await healthRes.json();
          if (json.success) setHealth(json.data);
        }
      } catch (err) {
        console.error("Failed to load insights", err);
      } finally {
        setLoading(false);
      }
    }
    fetchInsights();
  }, []);

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Gathering insights...</div>;

  return (
    <div className="h-full overflow-y-auto pr-2 pb-8 space-y-8">
      {briefing && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-500" /> Daily Briefing
          </h2>
          <div className="bg-card border rounded-xl p-6">
            <p className="text-muted-foreground mb-4">{briefing.greeting}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase">Yesterday Revenue</div>
                <div className="text-lg font-bold">₹{briefing.yesterdaySummary.revenue.toFixed(2)}</div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase">Yesterday Profit</div>
                <div className="text-lg font-bold text-green-500">₹{briefing.yesterdaySummary.profit.toFixed(2)}</div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase">Orders</div>
                <div className="text-lg font-bold">{briefing.yesterdaySummary.orders}</div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase">Top Product</div>
                <div className="text-lg font-bold truncate" title={briefing.yesterdaySummary.topProduct}>{briefing.yesterdaySummary.topProduct}</div>
              </div>
            </div>
            
            <div className="space-y-2 text-sm text-muted-foreground">
              <p><strong>Ads:</strong> {briefing.advertisingSummary}</p>
              {briefing.inventoryAlerts.length > 0 && <p><strong>Inventory:</strong> {briefing.inventoryAlerts.join(", ")}</p>}
              <p><strong>Goals:</strong> {briefing.goalProgress}</p>
              <p className="mt-4 pt-4 border-t text-foreground"><strong>Today's Mission:</strong> {briefing.todaysMission}</p>
            </div>
          </div>
        </div>
      )}

      {health && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-blue-500" /> Business Health
          </h2>
          <div className="bg-card border rounded-xl p-6">
            <div className="flex items-center gap-8 mb-8">
              <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path className="text-muted stroke-current" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className={cn("stroke-current", health.score > 75 ? "text-green-500" : health.score > 50 ? "text-yellow-500" : "text-red-500")} strokeWidth="3" strokeDasharray={`${health.score}, 100`} fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute text-4xl font-black">{health.score}</div>
              </div>
              
              <div className="flex-1 grid grid-cols-2 gap-4">
                <HealthComponent label="Revenue" score={health.components.revenue} icon={<TrendingUp />} />
                <HealthComponent label="Profitability" score={health.components.profitability} icon={<TrendingUp />} />
                <HealthComponent label="Advertising" score={health.components.advertising} icon={<Target />} />
                <HealthComponent label="Inventory" score={health.components.inventory} icon={<Package />} />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-green-500 mb-2">Strengths</h4>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {health.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-red-500 mb-2">Risks & Weaknesses</h4>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {health.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HealthComponent({ label, score, icon }: { label: string; score: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("p-2 rounded-lg", score > 75 ? "bg-green-500/10 text-green-500" : score > 50 ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500")}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <div className="font-bold">{score}/100</div>
      </div>
    </div>
  );
}

// ─── Knowledge Tab ────────────────────────────────────────────────────────

function KnowledgeTab() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchKnowledge() {
      const { data } = await supabase.from("ai_knowledge_center").select("*").order("confidence", { ascending: false });
      setEntries(data || []);
      setLoading(false);
    }
    fetchKnowledge();
  }, []);

  if (loading) return <div className="p-8 text-center animate-pulse">Loading knowledge...</div>;
  
  if (entries.length === 0) return (
    <div className="p-8 text-center text-muted-foreground border rounded-xl m-6 border-dashed">
      <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
      No knowledge discovered yet. ARIA will populate this automatically over time.
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <h2 className="text-2xl font-bold mb-4">AI Knowledge Center</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {entries.map(entry => (
          <div key={entry.id} className="bg-card border rounded-xl p-5">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold">{entry.title}</h3>
              <span className={cn("text-xs px-2 py-0.5 rounded", entry.status === "Verified" ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500")}>
                {entry.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{entry.description}</p>
            <div className="text-xs flex justify-between text-muted-foreground border-t pt-3">
              <span>Confidence: {entry.confidence}%</span>
              <span>Version: v{entry.version}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Decisions Tab ────────────────────────────────────────────────────────

function DecisionsTab() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDecisions() {
      const { data } = await supabase.from("ai_recommendation_history").select("*").order("created_at", { ascending: false });
      setEntries(data || []);
      setLoading(false);
    }
    fetchDecisions();
  }, []);

  if (loading) return <div className="p-8 text-center animate-pulse">Loading decisions...</div>;

  if (entries.length === 0) return (
    <div className="p-8 text-center text-muted-foreground border rounded-xl m-6 border-dashed">
      <GitPullRequest className="w-8 h-8 mx-auto mb-2 opacity-50" />
      No decisions recorded yet.
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <h2 className="text-2xl font-bold mb-4">Decision Journal</h2>
      <div className="space-y-4">
        {entries.map(entry => (
          <div key={entry.id} className="bg-card border rounded-xl p-5 flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">{entry.recommendation || "Strategic Action"}</h3>
                <span className={cn("text-xs px-2 py-0.5 rounded", entry.lifecycle === "Approved" || entry.lifecycle === "Completed" ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground")}>
                  {entry.lifecycle || "Pending"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{entry.ai_reasoning}</p>
            </div>
            <div className="w-32 text-right shrink-0">
              <div className="text-xs text-muted-foreground uppercase">Expected Impact</div>
              <div className={cn("font-bold", entry.simulation?.expectedCase?.expectedProfitImpact > 0 ? "text-green-500" : "text-muted-foreground")}>
                {entry.simulation?.expectedCase?.expectedProfitImpact ? `+₹${entry.simulation.expectedCase.expectedProfitImpact}` : "N/A"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tools Tab ────────────────────────────────────────────────────────────

function ToolsTab() {
  const [costs, setCosts] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCosts() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers = { ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) };
        
        const res = await fetch("/api/ai/costs", { headers });
        if (res.ok) {
          const json = await res.json();
          if (json.success) setCosts(json.data);
        }
      } catch (err) {
        console.error("Failed to load AI costs", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCosts();
  }, []);

  return (
    <div className="h-full overflow-y-auto pr-2 pb-8 space-y-8 p-6">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" /> AI Tools
        </h2>
        
        {/* Cost Manager Card */}
        <div className="bg-card border rounded-xl p-6">
          <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
            <BarChart2 className="w-5 h-5 text-indigo-500" />
            AI Cost Manager
          </h3>
          
          {loading ? (
            <div className="h-24 bg-muted animate-pulse rounded-lg"></div>
          ) : costs ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase">Estimated Bill (MTD)</div>
                <div className="text-2xl font-black mt-1 text-primary">
                  ${costs.totalCostUsd?.toFixed(4) || "0.0000"}
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase">Total AI Operations</div>
                <div className="text-2xl font-black mt-1">{costs.totalRequests || 0}</div>
              </div>
              <div className="bg-muted p-4 rounded-lg flex flex-col justify-center">
                <div className="text-xs text-muted-foreground uppercase mb-2">Model Split</div>
                <div className="space-y-1">
                  {Object.entries(costs.providerSplit || {}).map(([provider, cost]) => (
                    <div key={provider} className="flex justify-between text-sm">
                      <span>{provider}</span>
                      <span className="font-semibold">${Number(cost).toFixed(4)}</span>
                    </div>
                  ))}
                  {Object.keys(costs.providerSplit || {}).length === 0 && (
                    <div className="text-sm text-muted-foreground">No data</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">Failed to load cost data.</div>
          )}
        </div>

        {/* Business Simulator Card */}
        <div className="bg-card border rounded-xl p-6">
          <h3 className="font-semibold text-lg flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5 text-green-500" />
            Business Simulator
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Run "what-if" scenarios to predict impacts on profit, revenue, and inventory.
          </p>
          <SimulatorWidget />
        </div>
      </div>
    </div>
  );
}

function SimulatorWidget() {
  const [scenario, setScenario] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  
  const handleSimulate = async () => {
    if (!scenario.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) 
      };
      
      const res = await fetch("/api/ai/simulate", { 
        method: "POST",
        headers,
        body: JSON.stringify({ scenario })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setResult(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input 
          type="text" 
          value={scenario}
          onChange={e => setScenario(e.target.value)}
          placeholder="e.g., What if I cut ad spend by 20%?" 
          className="flex-1 h-10 px-3 rounded-md border bg-background text-sm"
          onKeyDown={e => e.key === 'Enter' && handleSimulate()}
        />
        <button 
          onClick={handleSimulate}
          disabled={loading || !scenario.trim()}
          className="px-4 h-10 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Simulating..." : "Run"}
        </button>
      </div>
      
      {result && (
        <div className="bg-muted p-4 rounded-lg space-y-4 animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-start">
            <h4 className="font-semibold text-lg">{result.scenarioName}</h4>
            <span className={cn("text-xs font-medium px-2 py-1 rounded uppercase tracking-wider", result.riskLevel === "Critical" || result.riskLevel === "High" ? "bg-rose-500/10 text-rose-500" : "bg-yellow-500/10 text-yellow-500")}>
              {result.riskLevel} Risk
            </span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase">Revenue Impact</div>
              <div className={cn("font-bold text-lg", result.expectedRevenueImpact > 0 ? "text-green-500" : "text-rose-500")}>
                {result.expectedRevenueImpact > 0 ? "+" : ""}₹{result.expectedRevenueImpact}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Profit Impact</div>
              <div className={cn("font-bold text-lg", result.expectedProfitImpact > 0 ? "text-green-500" : "text-rose-500")}>
                {result.expectedProfitImpact > 0 ? "+" : ""}₹{result.expectedProfitImpact}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Ad Impact</div>
              <div className="font-bold text-lg">₹{result.expectedAdvertisingImpact}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Confidence</div>
              <div className="font-bold text-lg">{result.confidence}%</div>
            </div>
          </div>
          
          <div className="pt-3 border-t grid gap-2 text-sm text-muted-foreground">
            <p><strong>Inventory:</strong> {result.inventoryImpact}</p>
            <p><strong>Cash Flow:</strong> {result.cashFlowImpact}</p>
            <p><strong>Timeline:</strong> {result.timelineDays} days</p>
          </div>
        </div>
      )}
    </div>
  );
}
