"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Trash2, Pencil, Send, Bot, RefreshCw, BarChart2, BookOpen, GitPullRequest, Settings, ShieldAlert, Zap, TrendingUp, Target, Package, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { DailyBriefing } from "@/lib/ai/schemas";
import { BusinessHealthResponse } from "@/lib/ai/schemas";
import { useToastStore } from "@/hooks/use-toast-store";
import { useAuth } from "@/hooks/use-auth";
import { useSearchParams } from "next/navigation";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";

type TabId = "chat" | "insights" | "knowledge" | "decisions" | "tools";
const TAB_IDS: readonly TabId[] = ["chat", "insights", "knowledge", "decisions", "tools"];

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  response?: CommandResponse;
}

async function aiWorkspaceRequest(path: string, init?: RequestInit) {
  const response = await sellerplusApiFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "SellerPlus AI request failed.");
  return body;
}

interface CommandResponse {
  reply: string;
  action: null | {
    type: "navigate" | "proposal";
    to?: string;
    actionType?: string;
    target?: string;
    reasoning?: string;
    riskLevel?: "low" | "medium" | "high";
  };
  proposalId: string | null;
  insights: string[];
  dataSources?: Record<string, string>;
}

export default function AIWorkspace() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabId>(
    TAB_IDS.includes(requestedTab as TabId) ? requestedTab as TabId : "chat",
  );

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
    "How much profit did I make in the last 30 days?",
    "What needs my attention today?",
    "Which advertising campaigns are wasting money?",
    "Which products are low on stock?",
  ];

  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        sender: "assistant",
        text: "Ask SellerPlus about your connected marketplace performance, profit, advertising, or inventory. I will distinguish verified data from missing or stale data, and any requested change will be prepared as a reviewable proposal.",
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
      const response = await sellerplusApiFetch("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: query }),
      });

      const command: CommandResponse & { error?: string } = await response.json();
      if (!response.ok) throw new Error(command.error || command.reply || "The request could not be analyzed.");
      
      const assistantMsg: ChatMessage = {
        id: "assistant_" + Date.now(),
        sender: "assistant",
        text: command.reply,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        response: command,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setMessages((prev) => [...prev, {
        id: "assistant_error_" + Date.now(),
        sender: "assistant",
        text: `Analysis failed: ${msg}`,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-6 p-4 rounded-xl border bg-card/50 no-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex gap-4", msg.sender === "user" ? "ml-auto max-w-[80%]" : "mr-auto w-full")}>
            {msg.sender === "assistant" && (
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

              {msg.sender === "assistant" && msg.text && (
                <div className="bg-muted border p-4 rounded-2xl rounded-tl-none text-sm whitespace-pre-wrap">
                  {msg.text}
                </div>
              )}

              {msg.sender === "assistant" && msg.response && (
                <div className="w-full space-y-3">
                  {msg.response.insights.length > 0 && (
                    <ul className="space-y-2 rounded-xl border bg-card p-4 text-sm">
                      {msg.response.insights.map((insight) => (
                        <li key={insight} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {msg.response.proposalId && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                      <div>
                        <p className="font-medium">Analysis proposal ready for review</p>
                        <p className="mt-1 text-muted-foreground">No external action has been executed.</p>
                      </div>
                      <a href="/automations/approvals" className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground">
                        Review proposal
                      </a>
                    </div>
                  )}
                  {msg.response.action?.type === "navigate" && msg.response.action.to && (
                    <a href={msg.response.action.to} className="inline-flex rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
                      Open requested area
                    </a>
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
              <RefreshCw className="w-4 h-4 animate-spin text-primary" /> Reading your workspace data…
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
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} maxLength={4000} placeholder="Ask about profit, advertising, inventory, or your next action…" className="w-full h-12 pl-4 pr-12 rounded-xl border bg-card focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
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
  const [error, setError] = useState<string | null>(null);
  const workspaceId = useAuth((state) => state.user?.workspaceId);

  useEffect(() => {
    async function fetchInsights() {
      setLoading(true);
      setError(null);
      try {
        const [briefingRes, healthRes] = await Promise.all([
          sellerplusApiFetch("/api/ai/briefing"),
          sellerplusApiFetch("/api/ai/health"),
        ]);

        const [briefingJson, healthJson] = await Promise.all([briefingRes.json(), healthRes.json()]);
        if (!briefingRes.ok) throw new Error(briefingJson.error ?? "Daily briefing is unavailable.");
        if (!healthRes.ok) throw new Error(healthJson.error ?? "Business health is unavailable.");
        if (briefingJson.success) setBriefing(briefingJson.data);
        if (healthJson.success) setHealth(healthJson.data);
      } catch (err) {
        setBriefing(null);
        setHealth(null);
        setError(err instanceof Error ? err.message : "Verified insights are unavailable.");
      } finally {
        setLoading(false);
      }
    }
    if (workspaceId) void fetchInsights();
  }, [workspaceId]);

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Gathering insights...</div>;
  if (error) return <div role="alert" className="m-4 rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300">{error}</div>;

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
                <div className={cn("text-lg font-bold", briefing.yesterdaySummary.profit === null ? "text-muted-foreground" : briefing.yesterdaySummary.profit >= 0 ? "text-green-500" : "text-red-500")}>
                  {briefing.yesterdaySummary.profit === null ? "Unavailable" : `₹${briefing.yesterdaySummary.profit.toFixed(2)}`}
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase">Orders</div>
                <div className="text-lg font-bold">{briefing.yesterdaySummary.orders}</div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-xs text-muted-foreground uppercase">Top Product</div>
                <div className="text-lg font-bold truncate" title={briefing.yesterdaySummary.topProduct ?? undefined}>{briefing.yesterdaySummary.topProduct ?? "No order data"}</div>
              </div>
            </div>
            <div className="mb-4 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              UTC day · {briefing.confidence}% data completeness · sources: {briefing.dataSources.join(", ") || "none"}
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
                  {health.score !== null && <path className={cn("stroke-current", health.score > 75 ? "text-green-500" : health.score > 50 ? "text-yellow-500" : "text-red-500")} strokeWidth="3" strokeDasharray={`${health.score}, 100`} fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />}
                </svg>
                <div className="absolute text-4xl font-black">{health.score ?? "—"}</div>
              </div>
              
              <div className="flex-1 grid grid-cols-2 gap-4">
                <HealthComponent label="Revenue" score={health.components.revenue} icon={<TrendingUp />} />
                <HealthComponent label="Profitability" score={health.components.profitability} icon={<TrendingUp />} />
                <HealthComponent label="Advertising" score={health.components.advertising} icon={<Target />} />
                <HealthComponent label="Inventory" score={health.components.inventory} icon={<Package />} />
              </div>
            </div>

            <div className="mb-6 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              Deterministic score · {health.dataCompleteness}% component coverage · {health.trend} trend
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
            {health.limitations.length > 0 && (
              <div className="mt-6 border-t pt-4">
                <h4 className="mb-2 font-semibold">Data limitations</h4>
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {health.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthComponent({ label, score, icon }: { label: string; score: number | null; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("p-2 rounded-lg", score === null ? "bg-muted text-muted-foreground" : score > 75 ? "bg-green-500/10 text-green-500" : score > 50 ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500")}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground uppercase">{label}</div>
        <div className="font-bold">{score === null ? "Not scored" : `${score}/100`}</div>
      </div>
    </div>
  );
}

// ─── Knowledge Tab ────────────────────────────────────────────────────────

function KnowledgeTab() {
  interface MemoryEntry {
    id: string;
    scope_type: "workspace" | "brand" | "marketplace" | "product" | "workflow";
    scope_id: string | null;
    memory_key: string;
    value: unknown;
    source: "seller" | "approved_inference" | "system_default";
    version: number;
    updated_at: string;
  }

  const user = useAuth((state) => state.user);
  const canManage = Boolean(user?.isSuperAdmin || user?.workspaceRole === "owner" || user?.workspaceRole === "admin");
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<MemoryEntry | null>(null);
  const [scopeType, setScopeType] = useState<MemoryEntry["scope_type"]>("workspace");
  const [scopeId, setScopeId] = useState("");
  const [memoryKey, setMemoryKey] = useState("");
  const [memoryValue, setMemoryValue] = useState("");

  const valueText = (value: unknown) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "text" in value && typeof (value as { text?: unknown }).text === "string") {
      return (value as { text: string }).text;
    }
    return JSON.stringify(value, null, 2);
  };

  useEffect(() => {
    async function fetchKnowledge() {
      try {
        const body = await aiWorkspaceRequest("/api/ai/memories");
        setEntries(body.data ?? []);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "AI memory is unavailable.");
      } finally {
        setLoading(false);
      }
    }
    fetchKnowledge();
  }, [refreshKey]);

  const resetEditor = () => {
    setEditing(null);
    setScopeType("workspace");
    setScopeId("");
    setMemoryKey("");
    setMemoryValue("");
  };

  const startEdit = (entry: MemoryEntry) => {
    setEditing(entry);
    setScopeType(entry.scope_type);
    setScopeId(entry.scope_id ?? "");
    setMemoryKey(entry.memory_key);
    setMemoryValue(valueText(entry.value));
  };

  const saveMemory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!memoryKey.trim() || !memoryValue.trim()) return;
    setSaving(true);
    try {
      let parsedValue: unknown = memoryValue.trim();
      try { parsedValue = JSON.parse(memoryValue); } catch { /* Plain text is valid structured memory. */ }
      await aiWorkspaceRequest("/api/ai/memories", {
        method: "POST",
        body: JSON.stringify({
          scopeType,
          scopeId: scopeType === "workspace" ? null : scopeId.trim() || null,
          memoryKey: memoryKey.trim(),
          value: parsedValue,
        }),
      });
      useToastStore.getState().success(editing ? "Memory version saved" : "Memory saved", "SellerPlus AI will use the active value in this workspace.");
      resetEditor();
      setRefreshKey((value) => value + 1);
    } catch (error) {
      useToastStore.getState().error("Memory not saved", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const deleteMemory = async (entry: MemoryEntry) => {
    if (!window.confirm(`Deactivate memory “${entry.memory_key}”? Its version history will be retained.`)) return;
    try {
      await aiWorkspaceRequest(`/api/ai/memories?id=${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (editing?.id === entry.id) resetEditor();
      useToastStore.getState().success("Memory deactivated", "The historical version remains in the audit trail.");
    } catch (error) {
      useToastStore.getState().error("Memory not removed", error instanceof Error ? error.message : "Try again.");
    }
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Loading knowledge...</div>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div>
        <h2 className="text-2xl font-bold">SellerPlus AI Memory</h2>
        <p className="mt-1 text-sm text-muted-foreground">Structured, tenant-isolated preferences. Seller entries are versioned and can be deactivated.</p>
      </div>

      {loadError && <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">{loadError}</div>}

      {canManage && (
        <form onSubmit={saveMemory} className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{editing ? `Edit ${editing.memory_key}` : "Add seller preference"}</h3>
            {editing && <button type="button" onClick={resetEditor} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <select value={scopeType} disabled={Boolean(editing)} onChange={(event) => setScopeType(event.target.value as MemoryEntry["scope_type"])} className="h-10 rounded-md border bg-background px-3 text-sm disabled:opacity-60">
              <option value="workspace">Workspace</option>
              <option value="brand">Brand</option>
              <option value="marketplace">Marketplace</option>
              <option value="product">Product</option>
              <option value="workflow">Workflow</option>
            </select>
            <input value={memoryKey} disabled={Boolean(editing)} onChange={(event) => setMemoryKey(event.target.value)} maxLength={100} placeholder="Key, e.g. brand.voice" className="h-10 rounded-md border bg-background px-3 text-sm disabled:opacity-60" />
            {scopeType === "workspace" ? (
              <div className="flex h-10 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">Applies to this workspace</div>
            ) : (
              <input value={scopeId} disabled={Boolean(editing)} onChange={(event) => setScopeId(event.target.value)} maxLength={200} placeholder={`${scopeType} identifier`} className="h-10 rounded-md border bg-background px-3 text-sm disabled:opacity-60" />
            )}
          </div>
          <textarea value={memoryValue} onChange={(event) => setMemoryValue(event.target.value)} maxLength={32000} rows={3} placeholder="Preference value (plain text or JSON)" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          <div className="flex justify-end">
            <button type="submit" disabled={saving || !memoryKey.trim() || !memoryValue.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {saving ? "Saving…" : editing ? "Save new version" : "Add memory"}
            </button>
          </div>
        </form>
      )}

      {entries.length === 0 && !loadError ? (
        <div className="p-8 text-center text-muted-foreground border rounded-xl border-dashed">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No active AI memory. Add explicit seller preferences when you want SellerPlus AI to retain them.
        </div>
      ) : <div className="grid md:grid-cols-2 gap-4">
        {entries.map(entry => (
          <div key={entry.id} className="bg-card border rounded-xl p-5">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold font-mono text-sm">{entry.memory_key}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{entry.scope_type}{entry.scope_id ? ` · ${entry.scope_id}` : ""}</p>
              </div>
              {canManage && <div className="flex gap-1">
                <button onClick={() => startEdit(entry)} aria-label={`Edit ${entry.memory_key}`} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => deleteMemory(entry)} aria-label={`Deactivate ${entry.memory_key}`} className="rounded-md p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>}
            </div>
            <pre className="mb-4 whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">{valueText(entry.value)}</pre>
            <div className="text-xs flex justify-between text-muted-foreground border-t pt-3">
              <span>Source: {entry.source.replaceAll("_", " ")}</span>
              <span>v{entry.version} · {new Date(entry.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}

// ─── Decisions Tab ────────────────────────────────────────────────────────

function DecisionsTab() {
  interface DecisionEntry {
    id: string;
    recommendation: string;
    ai_reasoning: string;
    lifecycle: string;
    confidence: number;
    simulation: { expectedCase?: { expectedProfitImpact?: number } } | null;
    created_at: string;
  }
  const [entries, setEntries] = useState<DecisionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDecisions() {
      try {
        const body = await aiWorkspaceRequest("/api/ai/decisions?limit=100");
        setEntries(body.data ?? []);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Decision history is unavailable.");
      } finally {
        setLoading(false);
      }
    }
    fetchDecisions();
  }, []);

  if (loading) return <div className="p-8 text-center animate-pulse">Loading decisions...</div>;

  if (loadError) return <div className="m-6 rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-500">{loadError}</div>;

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
              <div className={cn("font-bold", Number(entry.simulation?.expectedCase?.expectedProfitImpact) > 0 ? "text-green-500" : "text-muted-foreground")}>
                {typeof entry.simulation?.expectedCase?.expectedProfitImpact === "number"
                  ? `${Number(entry.simulation?.expectedCase?.expectedProfitImpact) > 0 ? "+" : ""}₹${Number(entry.simulation?.expectedCase?.expectedProfitImpact)} projected`
                  : "Not quantified"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Outcome not measured</div>
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
  const [error, setError] = useState<string | null>(null);
  const workspaceId = useAuth((state) => state.user?.workspaceId);

  useEffect(() => {
    async function fetchCosts() {
      setLoading(true);
      setError(null);
      try {
        const res = await sellerplusApiFetch("/api/ai/costs");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "AI usage is unavailable.");
        if (json.success) setCosts(json.data);
      } catch (err) {
        setCosts(null);
        setError(err instanceof Error ? err.message : "AI usage is unavailable.");
      } finally {
        setLoading(false);
      }
    }
    if (workspaceId) void fetchCosts();
  }, [workspaceId]);

  return (
    <div className="h-full overflow-y-auto pr-2 pb-8 space-y-8 p-6">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" /> AI Tools
        </h2>
        {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">{error}</div>}
        
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
            Business Scenario Model
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Model explicit percentage changes against verified 30-day data. Ranges are estimates, not forecasts.
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

  const formatImpact = (impact: any) => {
    if (!impact || impact.minimum === null || impact.maximum === null) return "Unavailable";
    const format = (value: number) => `${value > 0 ? "+" : ""}₹${Math.round(value).toLocaleString("en-IN")}`;
    return impact.minimum === impact.maximum
      ? format(impact.minimum)
      : `${format(impact.minimum)} to ${format(impact.maximum)}`;
  };
  
  const handleSimulate = async () => {
    if (!scenario.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await sellerplusApiFetch("/api/ai/simulate", {
        method: "POST",
        body: JSON.stringify({ scenario }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Scenario model is unavailable.");
      if (json.success) setResult(json.data);
    } catch (err) {
      useToastStore.getState().error("Scenario unavailable", err instanceof Error ? err.message : "Try again later.");
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
          
          {!result.supported && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              SellerPlus could not quantify this scenario from verified inputs. Try an explicit percentage change to ad spend, COGS, or Amazon fees.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase">Revenue range</div>
              <div className="font-bold text-sm">{formatImpact(result.revenueImpact)}</div>
              <div className="text-[10px] text-muted-foreground">{result.revenueImpact?.source?.replaceAll("_", " ")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Profit range</div>
              <div className="font-bold text-sm">{formatImpact(result.profitImpact)}</div>
              <div className="text-[10px] text-muted-foreground">{result.profitImpact?.source?.replaceAll("_", " ")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Ad-spend range</div>
              <div className="font-bold text-sm">{formatImpact(result.advertisingImpact)}</div>
              <div className="text-[10px] text-muted-foreground">{result.advertisingImpact?.source?.replaceAll("_", " ")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Confidence</div>
              <div className="font-bold text-lg">{result.confidence}%</div>
            </div>
          </div>
          
          <div className="pt-3 border-t grid gap-2 text-sm text-muted-foreground">
            <p><strong>Inventory:</strong> {result.inventoryImpact}</p>
            <p><strong>Cash Flow:</strong> {result.cashFlowImpact}</p>
            <p><strong>Timeline:</strong> {result.timelineDays?.minimum === null ? "Not quantified" : `${result.timelineDays.minimum}–${result.timelineDays.maximum} days`}</p>
            <p><strong>Data window:</strong> Last {result.dataWindow?.days ?? 30} days</p>
            {result.assumptions?.length > 0 && <p><strong>Assumptions:</strong> {result.assumptions.join(" ")}</p>}
            {result.limitations?.length > 0 && <p><strong>Limitations:</strong> {result.limitations.join(" ")}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
