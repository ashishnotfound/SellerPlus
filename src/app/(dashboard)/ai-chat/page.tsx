"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles, Trash2, Send, Bot, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BIResponse } from "@/lib/ai/schemas";
import { WidgetRenderer } from "@/components/ui/widgets/WidgetRenderer";
import { RecommendationCard } from "@/components/ui/recommendation-card";
import { supabase } from "@/lib/supabase";
import { useToastStore } from "@/hooks/use-toast-store";

interface ChatMessage {
  id: string;
  sender: "user" | "aria";
  text?: string;
  timestamp: string;
  payload?: BIResponse;
}

export default function AIConsultantWorkspace() {
  const user = useAuth((s) => s.user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    "Run a full store audit",
    "Why are my sales dropping this week?",
    "Which advertising campaigns are wasting money?",
    "Which listings should I improve first?",
    "Where am I losing profit?",
  ];

  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        sender: "aria",
        text: `Hello! I am ARIA, your AI Business Consultant. 
        
I can run advanced store audits, analyze your advertising spend, and detect profit leaks. Every recommendation I make is backed by real data from your connected databases.

What would you like me to analyze today?`,
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
      // Direct the request to the deterministic BI Engine
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/ai/bi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          mode: "Custom Query",
          customPrompt: query,
        }),
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
    useToastStore.getState().success(
      `Recommendation ${action}`,
      action === "Executing" ? "Automation Engine will process this action." : undefined
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-5xl mx-auto w-full pb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            AI Business Consultant
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Data-driven strategic advice for your Amazon business.
          </p>
        </div>
        <button 
          onClick={() => {
            if (window.confirm("Clear all active workspace conversation history?")) {
              window.location.reload();
            }
          }}
          className="p-2 rounded hover:bg-muted text-muted-foreground flex items-center gap-2 transition-all text-sm"
        >
          <Trash2 className="w-4 h-4" /> Clear
        </button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto space-y-6 p-4 rounded-xl border bg-card/50">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex gap-4", msg.sender === "user" ? "ml-auto max-w-[80%]" : "mr-auto w-full")}>
            {msg.sender === "aria" && (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}
            
            <div className={cn("flex flex-col gap-2", msg.sender === "user" ? "items-end" : "w-full")}>
              {/* User Text */}
              {msg.sender === "user" && (
                <div className="bg-primary text-primary-foreground p-4 rounded-2xl rounded-tr-none text-sm">
                  {msg.text}
                </div>
              )}

              {/* Aria Response */}
              {msg.sender === "aria" && msg.text && (
                <div className="bg-muted border p-4 rounded-2xl rounded-tl-none text-sm whitespace-pre-wrap">
                  {msg.text}
                </div>
              )}

              {/* Aria Structured BI Payload */}
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
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-muted border p-4 rounded-2xl rounded-tl-none text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              Analyzing business data...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="mt-4 shrink-0 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {suggestions.map((sug, i) => (
            <button
              key={i}
              onClick={() => handleSend(sug)}
              className="text-xs bg-muted hover:bg-accent border px-3 py-1.5 rounded-full whitespace-nowrap transition-colors"
            >
              {sug}
            </button>
          ))}
        </div>
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="relative"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for an audit, optimization strategies, or profit analysis..."
            className="w-full h-12 pl-4 pr-12 rounded-xl border bg-card focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2 top-2 w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 hover:opacity-90"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
