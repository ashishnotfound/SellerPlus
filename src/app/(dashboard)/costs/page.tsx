"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import {
  Calculator, Plus, Trash2, Edit3, Save, Sparkles,
  RefreshCw, Search, Tag, Package, Check, Copy,
  AlertCircle, Loader2, X, Send, Bot, User, CheckCircle
} from "lucide-react";
import { useToastStore } from "@/hooks/use-toast-store";

interface CostProfile {
  id: string;
  name: string;
  printing_cost: number;
  material_cost: number;
  packaging_cost: number;
  shipping_cost: number;
  labor_cost: number;
  misc_cost: number;
  created_at: string;
}

interface ListingItem {
  id: string;
  sku: string;
  asin: string;
  title: string;
  price: number;
  cost_profile_id: string | null;
  main_image: string | null;
}

export default function CostsPage() {
  const user = useAuth((s) => s.user);
  
  // States
  const [profiles, setProfiles] = useState<CostProfile[]>([]);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  
  // Selected listings for bulk mapping
  const [selectedListings, setSelectedListings] = useState<string[]>([]);
  const [bulkProfileId, setBulkProfileId] = useState("");
  
  // Form modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CostProfile | null>(null);
  const [profileName, setProfileName] = useState("");
  const [printingCost, setPrintingCost] = useState("0");
  const [materialCost, setMaterialCost] = useState("0");
  const [packagingCost, setPackagingCost] = useState("0");
  const [shippingCost, setShippingCost] = useState("0");
  const [laborCost, setLaborCost] = useState("0");
  const [miscCost, setMiscCost] = useState("0");
  const [savingProfile, setSavingProfile] = useState(false);
  
  // Profit Preview Live Calculations state inside modal
  const [previewPrice, setPreviewPrice] = useState("199");
  
  // Chatbot State
  const [messages, setMessages] = useState<any[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hello! I am **ARIA**, your AI Cost Assistant. Ask me to create profiles, edit packaging costs, or link your products to catalog listings. I'm ready!",
      timestamp: new Date()
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  // Action hook to handle filters from assistant commands
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.action?.type === "show_unassigned") {
      setFilterUnassigned(true);
    }
  }, [messages]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Cost Profiles
      const { data: pData } = await supabase
        .from("cost_profiles")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });
        
      setProfiles(pData || []);

      // 2. Fetch Listings
      const { data: lData } = await supabase
        .from("listings")
        .select("id, sku, asin, title, price, cost_profile_id, main_image")
        .eq("user_id", user?.id)
        .order("sku", { ascending: true });
        
      setListings(lData || []);
    } catch (e) {
      console.error("Failed to load Cost Configurations:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingProfile(null);
    setProfileName("");
    setPrintingCost("0");
    setMaterialCost("0");
    setPackagingCost("0");
    setShippingCost("0");
    setLaborCost("0");
    setMiscCost("0");
    setPreviewPrice("199");
    setShowFormModal(true);
  };

  const handleOpenEdit = (p: CostProfile) => {
    setEditingProfile(p);
    setProfileName(p.name);
    setPrintingCost(p.printing_cost.toString());
    setMaterialCost(p.material_cost.toString());
    setPackagingCost(p.packaging_cost.toString());
    setShippingCost(p.shipping_cost.toString());
    setLaborCost(p.labor_cost.toString());
    setMiscCost(p.misc_cost.toString());
    
    // Default preview price to average of mapped listings
    const mapped = listings.filter(l => l.cost_profile_id === p.id);
    if (mapped.length > 0) {
      const avg = mapped.reduce((sum, l) => sum + l.price, 0) / mapped.length;
      setPreviewPrice(Math.round(avg).toString());
    } else {
      setPreviewPrice("199");
    }
    
    setShowFormModal(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !profileName.trim()) return;
    setSavingProfile(true);

    const payload = {
      user_id: user.id,
      name: profileName.trim(),
      printing_cost: parseFloat(printingCost) || 0,
      material_cost: parseFloat(materialCost) || 0,
      packaging_cost: parseFloat(packagingCost) || 0,
      shipping_cost: parseFloat(shippingCost) || 0,
      labor_cost: parseFloat(laborCost) || 0,
      misc_cost: parseFloat(miscCost) || 0
    };

    try {
      if (editingProfile) {
        const { error } = await supabase
          .from("cost_profiles")
          .update(payload)
          .eq("id", editingProfile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cost_profiles")
          .insert(payload);
        if (error) throw error;
      }
      setShowFormModal(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().error("Save Failed", msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm("Are you sure you want to delete this Cost Profile? Listings mapped to it will be unassigned.")) return;
    try {
      const { error } = await supabase
        .from("cost_profiles")
        .delete()
        .eq("id", id);
      if (error) throw error;
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      useToastStore.getState().error("Delete Failed", msg);
    }
  };

  // Bulk profile assignment
  const handleBulkAssign = async () => {
    if (selectedListings.length === 0 || !bulkProfileId) return;
    setLoading(true);
    try {
      const profileVal = bulkProfileId === "unassign" ? null : bulkProfileId;
      
      const { error } = await supabase
        .from("listings")
        .update({ cost_profile_id: profileVal })
        .in("id", selectedListings);

      if (error) throw error;
      
      setSelectedListings([]);
      setBulkProfileId("");
      loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      useToastStore.getState().error("Assignment Failed", msg);
      setLoading(false);
    }
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !user?.id) return;

    const key = localStorage.getItem("gemini_api_key") || "";
    if (!key) {
      useToastStore.getState().warning("API Key Required", "Please paste your Gemini API Key in the Settings page first.");
      return;
    }

    const userMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      text: chatInput.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const originalInput = chatInput.trim();
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/ai/cost-chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-gemini-key": key
        },
        body: JSON.stringify({
          message: userMessage.text,
          chatHistory: messages.slice(-10).map(m => ({ role: m.role, text: m.text })),
          listings,
          profiles
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        const reply = json.data;
        const aiMessage = {
          id: `ai_${Date.now()}`,
          role: "assistant",
          text: reply.message,
          action: reply.action,
          pendingAction: reply.action,
          timestamp: new Date(),
          originalPrompt: originalInput
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error(json.error || "Failed to process message.");
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: "assistant",
        text: `⚠️ Error: ${err.message}`,
        timestamp: new Date()
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const applyPendingAction = async (messageId: string, action: any) => {
    if (!user?.id) return;
    try {
      if (action.type === "create_profile") {
        const payload = action.payload;
        const { error } = await supabase
          .from("cost_profiles")
          .insert({
            user_id: user.id,
            name: payload.name || "Custom NLP Profile",
            printing_cost: parseFloat(payload.printing_cost || 0),
            material_cost: parseFloat(payload.material_cost || 0),
            packaging_cost: parseFloat(payload.packaging_cost || 0),
            shipping_cost: parseFloat(payload.shipping_cost || 0),
            labor_cost: parseFloat(payload.labor_cost || 0),
            misc_cost: parseFloat(payload.misc_cost || 0)
          });
        if (error) throw error;
        
        setMessages(prev => [
          ...prev.map(m => m.id === messageId ? { ...m, pendingAction: null } : m),
          {
            id: `success_${Date.now()}`,
            role: "assistant",
            text: `✓ Created cost profile **${payload.name}** successfully.`,
            timestamp: new Date()
          }
        ]);
        loadData();
      }
      else if (action.type === "assign_sku") {
        const { sku, profile_name } = action.payload;
        const matchedProfile = profiles.find(p => p.name.toLowerCase() === profile_name.toLowerCase());
        if (!matchedProfile) {
          throw new Error(`Could not find a cost profile named "${profile_name}". Please create it first.`);
        }
        const { error } = await supabase
          .from("listings")
          .update({ cost_profile_id: matchedProfile.id })
          .eq("sku", sku)
          .eq("user_id", user.id);
        if (error) throw error;
        
        setMessages(prev => [
          ...prev.map(m => m.id === messageId ? { ...m, pendingAction: null } : m),
          {
            id: `success_${Date.now()}`,
            role: "assistant",
            text: `✓ Linked SKU **${sku}** to profile **${profile_name}**!`,
            timestamp: new Date()
          }
        ]);
        loadData();
      }
      else if (action.type === "update_cost") {
        const { profile_name, cost_type, value } = action.payload;
        const matchedProfile = profiles.find(p => p.name.toLowerCase() === profile_name.toLowerCase());
        if (!matchedProfile) {
          throw new Error(`Could not find a cost profile named "${profile_name}".`);
        }
        const { error } = await supabase
          .from("cost_profiles")
          .update({ [cost_type]: parseFloat(value || 0) })
          .eq("id", matchedProfile.id);
        if (error) throw error;
        
        setMessages(prev => [
          ...prev.map(m => m.id === messageId ? { ...m, pendingAction: null } : m),
          {
            id: `success_${Date.now()}`,
            role: "assistant",
            text: `✓ Updated **${cost_type.replace('_', ' ')}** on **${profile_name}** to **₹${value}**.`,
            timestamp: new Date()
          }
        ]);
        loadData();
      }
    } catch (e: any) {
      useToastStore.getState().error("Action Failed", "Action execution failed: " + e.message);
    }
  };

  const rejectPendingAction = (messageId: string) => {
    setMessages(prev => [
      ...prev.map(m => m.id === messageId ? { ...m, pendingAction: null } : m),
      {
        id: `reject_${Date.now()}`,
        role: "assistant",
        text: "Action cancelled.",
        timestamp: new Date()
      }
    ]);
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 1500);
  };

  const handleRegenerate = (originalPrompt: string) => {
    if (!originalPrompt) return;
    setChatInput(originalPrompt);
    setTimeout(() => {
      handleSendChat();
    }, 100);
  };

  // Inline formatting renderer for Assistant messages with basic Markdown formatting
  const renderMessageText = (txt: string) => {
    if (!txt) return null;
    const lines = txt.split("\n");
    return (
      <div className="flex flex-col gap-1 text-[13px] leading-relaxed select-text">
        {lines.map((line, idx) => {
          if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
            return (
              <ul key={idx} className="list-disc pl-4 text-zinc-300 my-0.5">
                <li>{renderInlineStyles(line.trim().substring(2))}</li>
              </ul>
            );
          }
          if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
            const cells = line.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
            if (cells.every(c => c.startsWith("-"))) return null;
            return (
              <div key={idx} className="grid grid-flow-col gap-4 py-1 border-b border-white/5 font-mono text-[10px] text-zinc-400">
                {cells.map((cell, cIdx) => (
                  <span key={cIdx}>{renderInlineStyles(cell)}</span>
                ))}
              </div>
            );
          }
          return <p key={idx}>{renderInlineStyles(line)}</p>;
        })}
      </div>
    );
  };

  const renderInlineStyles = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx} className="text-white font-bold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={idx} className="bg-white/10 px-1 py-0.5 rounded text-[11px] font-mono text-indigo-300">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const renderActionCard = (m: any) => {
    const action = m.pendingAction;
    if (!action) return null;
    
    let title = "";
    let subtitle = "";
    
    switch (action.type) {
      case "create_profile":
        title = `Create Profile: ${action.payload.name || "Custom"}`;
        subtitle = `Print: ₹${action.payload.printing_cost || 0} • Packaging: ₹${action.payload.packaging_cost || 0} • Other: ₹${(Number(action.payload.material_cost || 0) + Number(action.payload.shipping_cost || 0) + Number(action.payload.labor_cost || 0) + Number(action.payload.misc_cost || 0))}`;
        break;
      case "assign_sku":
        title = `Link SKU: ${action.payload.sku}`;
        subtitle = `Profile: ${action.payload.profile_name}`;
        break;
      case "update_cost":
        title = `Update Profile: ${action.payload.profile_name}`;
        subtitle = `${action.payload.cost_type.replace('_', ' ')} ➔ ₹${action.payload.value}`;
        break;
      default:
        return null;
    }
    
    return (
      <div className="mt-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between gap-4 max-w-sm w-full shadow-lg backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold text-white truncate">{title}</div>
          <div className="text-[9px] text-zinc-500 truncate mt-0.5">{subtitle}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => applyPendingAction(m.id, action)}
            className="h-7 px-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-black text-[10px] font-black transition-all"
          >
            Apply
          </button>
          <button
            onClick={() => rejectPendingAction(m.id)}
            className="h-7 px-3 rounded-lg bg-transparent border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 text-[10px] font-bold transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  // Multi-Attribute listings catalog search
  const filteredListings = useMemo(() => {
    return listings.filter(l => {
      const profile = profiles.find(p => p.id === l.cost_profile_id);
      const q = searchQuery.toLowerCase().trim();
      
      const matchesSearch = !q ? true : (
        l.sku.toLowerCase().includes(q) ||
        l.title.toLowerCase().includes(q) ||
        (l.asin && l.asin.toLowerCase().includes(q)) ||
        (profile && profile.name.toLowerCase().includes(q)) ||
        l.price.toString().includes(q)
      );

      const matchesFilter = !filterUnassigned || l.cost_profile_id === null;
      return matchesSearch && matchesFilter;
    });
  }, [listings, profiles, searchQuery, filterUnassigned]);

  // Contextual chips generator
  const suggestionChips = useMemo(() => {
    if (selectedListings.length > 0) {
      const firstProfile = profiles[0]?.name || "Standard";
      return [
        { label: `Assign Selected to ${firstProfile}`, prompt: `Assign ${firstProfile} profile to selected items` },
        { label: "Clear profiles from selection", prompt: "Clear profile assigned to selected items" }
      ];
    }

    const unassignedCount = listings.filter(l => l.cost_profile_id === null).length;
    const suggestions = [
      { label: "Create profile A3 Poster", prompt: "Create profile for A3 Posters" },
      { label: "Tube costs ₹7", prompt: "Tube costs ₹7" },
      { label: "A3 printing costs ₹7", prompt: "A3 printing costs ₹7" },
      { label: "Calculate profits", prompt: "Calculate profit margins" }
    ];

    if (unassignedCount > 0) {
      suggestions.unshift({ label: `Find products without profile (${unassignedCount})`, prompt: "Show products without profiles" });
    }
    
    return suggestions;
  }, [selectedListings, profiles, listings]);

  // Expected profit calculator for profile cards
  const getExpectedProfitForProfile = (profile: CostProfile) => {
    const mapped = listings.filter(l => l.cost_profile_id === profile.id);
    if (mapped.length === 0) return 0;
    
    const avgPrice = mapped.reduce((sum, l) => sum + l.price, 0) / mapped.length;
    const totalCost = 
      profile.printing_cost + profile.material_cost + profile.packaging_cost + 
      profile.shipping_cost + profile.labor_cost + profile.misc_cost;
      
    const fees = avgPrice * 0.15; // Amazon Fee ~15%
    const profit = avgPrice - totalCost - fees;
    return Math.max(0, Math.round(profit));
  };

  // Live calculation values inside create/edit profile modal
  const liveCalculations = useMemo(() => {
    const sellPrice = parseFloat(previewPrice) || 0;
    const fee = sellPrice * 0.15;
    const print = parseFloat(printingCost) || 0;
    const pack = parseFloat(packagingCost) || 0;
    const other = 
      (parseFloat(materialCost) || 0) + 
      (parseFloat(shippingCost) || 0) + 
      (parseFloat(laborCost) || 0) + 
      (parseFloat(miscCost) || 0);

    const totalCogs = print + pack + other;
    const netProfit = sellPrice - fee - totalCogs;
    const margin = sellPrice > 0 ? (netProfit / sellPrice) * 100 : 0;

    return {
      fee: Math.round(fee),
      cogs: Math.round(totalCogs),
      profit: Math.round(netProfit),
      margin: Math.round(margin)
    };
  }, [previewPrice, printingCost, materialCost, packagingCost, shippingCost, laborCost, miscCost]);

  return (
    <div className="flex flex-col gap-8 p-6 max-w-7xl mx-auto min-h-screen text-zinc-100 antialiased font-sans select-none">
      
      {/* Premium Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Calculator className="w-6 h-6 text-indigo-400" />
            Cost Configuration
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Construct product cost profile frameworks and sync mappings to your live listings catalog.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-all"
        >
          <Plus className="w-4 h-4" /> Create Profile
        </button>
      </div>

      {/* Modern ChatGPT-style Chat Assistant */}
      <GlassCard className="p-6 border-white/5 bg-white/[0.01] rounded-2xl relative overflow-hidden flex flex-col gap-4 shadow-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/[0.02] rounded-full blur-3xl -z-10" />
        
        {/* Assistant Header info bar */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <Bot className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-white tracking-wide flex items-center gap-2">
                ARIA Cost Assistant
                <span className="text-[8px] uppercase tracking-wider font-extrabold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/10">Interactive</span>
              </h4>
              <p className="text-[10px] text-zinc-500 mt-0.5 leading-none">Enter raw cost queries in natural language to update your catalog rules</p>
            </div>
          </div>
          {typeof window !== "undefined" && !localStorage.getItem("gemini_api_key") && (
            <span className="text-[10px] bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 animate-pulse">
              <AlertCircle className="w-3.5 h-3.5" /> API Key Missing
            </span>
          )}
        </div>

        {/* Chat History Panel */}
        <div className="flex flex-col gap-4 min-h-[160px] max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3.5 max-w-[85%] ${
                m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              }`}
            >
              {/* Avatar Icon */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border text-xs font-bold leading-none ${
                m.role === "user" 
                  ? "bg-white/5 border-white/10 text-white"
                  : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
              }`}>
                {m.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                {/* Chat bubble body */}
                <div
                  className={`px-4 py-3 rounded-2xl relative group transition-all duration-200 border ${
                    m.role === "user"
                      ? "bg-white/[0.03] border-white/5 text-white rounded-tr-none"
                      : "bg-[#0E0E12]/80 border-white/5 text-zinc-300 rounded-tl-none"
                  }`}
                >
                  {renderMessageText(m.text)}
                  
                  {/* Tool Call Action Panel */}
                  {m.role === "assistant" && m.pendingAction && renderActionCard(m)}

                  {/* Bubble Actions - Copy/Regenerate */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                    <button
                      onClick={() => handleCopyText(m.id, m.text)}
                      className="p-1.5 rounded hover:bg-white/5 text-zinc-500 hover:text-white transition-colors"
                      title="Copy message"
                    >
                      {copiedMessageId === m.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    {m.role === "assistant" && m.originalPrompt && (
                      <button
                        onClick={() => handleRegenerate(m.originalPrompt)}
                        className="p-1.5 rounded hover:bg-white/5 text-zinc-500 hover:text-white transition-colors"
                        title="Regenerate action"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Time Indicator */}
                <span className={`text-[9px] text-zinc-500 px-1 ${
                  m.role === "user" ? "text-right" : "text-left"
                }`}>
                  {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {/* typing animation state */}
          {chatLoading && (
            <div className="flex gap-3.5 mr-auto">
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="bg-[#0E0E12]/80 border border-white/5 text-zinc-500 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2.5 text-xs">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest font-black">ARIA is typing</span>
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-white/5">
          {suggestionChips.map((chip) => (
            <button
              key={chip.label}
              disabled={chatLoading}
              onClick={() => setChatInput(chip.prompt)}
              className="text-[10px] font-semibold text-zinc-400 hover:text-white bg-white/[0.02] border border-white/5 hover:border-white/10 px-2.5 py-1.5 rounded-lg transition-all"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Chat input box */}
        {typeof window !== "undefined" && !localStorage.getItem("gemini_api_key") ? (
          <div className="p-3 bg-rose-950/10 border border-rose-500/10 rounded-xl text-center text-xs text-rose-300">
            Please configure your <a href="/settings" className="underline font-bold text-rose-200">Gemini API Key in Settings</a> to enable natural language cost assistant features.
          </div>
        ) : (
          <form onSubmit={handleSendChat} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask ARIA to create profiles, edit packaging costs, or link your products..."
              disabled={chatLoading}
              className="flex-1 h-11 px-4 rounded-xl border border-white/5 bg-[#0E0E12] text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-white/10 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="h-11 w-11 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold transition-all flex items-center justify-center disabled:opacity-40 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </GlassCard>

      {/* Grid Layout for Active Profiles and Product SKU list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Profiles List */}
        <div className="flex flex-col gap-5 lg:col-span-1">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Active Cost Profiles</h3>
            <span className="text-[10px] text-zinc-500 font-semibold">{profiles.length} total</span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 border border-white/5 rounded-2xl bg-white/[0.01]">
              <Loader2 className="w-6 h-6 text-zinc-600 animate-spin mb-2" />
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono">Loading profiles</span>
            </div>
          ) : profiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-white/5 rounded-2xl bg-white/[0.01] text-center max-w-sm mx-auto my-8">
              <Calculator className="w-10 h-10 text-zinc-650 mb-3" />
              <h4 className="text-sm font-bold text-zinc-300">You haven't created any cost profiles.</h4>
              <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                Create one to begin automatic profit calculations.
              </p>
              <button
                onClick={handleOpenCreate}
                className="mt-5 px-4 py-2 rounded-xl bg-white text-black hover:bg-zinc-200 text-xs font-bold transition-all"
              >
                Create Profile
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {profiles.map((p) => {
                const totalCost = 
                  p.printing_cost + p.material_cost + p.packaging_cost + 
                  p.shipping_cost + p.labor_cost + p.misc_cost;
                
                const expectedProfit = getExpectedProfitForProfile(p);
                const mappedCount = listings.filter(l => l.cost_profile_id === p.id).length;

                return (
                  <GlassCard key={p.id} className="p-5 border-white/5 hover:border-white/10 transition-all flex flex-col justify-between rounded-xl relative group">
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-sm text-zinc-100 tracking-tight">{p.name}</h4>
                          <span className="text-[9px] text-zinc-500 font-mono block mt-1">Updated Today</span>
                        </div>
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleOpenEdit(p)} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-zinc-400 hover:text-white">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteProfile(p.id)} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-zinc-400 hover:text-rose-450">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Breakdowns */}
                      <div className="flex flex-col gap-2 mt-5 text-xs">
                        <div className="flex justify-between border-b border-white/[0.02] pb-1.5">
                          <span className="text-zinc-500">Printing Cost</span>
                          <span className="text-zinc-300 font-medium">₹{p.printing_cost.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/[0.02] pb-1.5">
                          <span className="text-zinc-500">Packaging Cost</span>
                          <span className="text-zinc-300 font-medium">₹{p.packaging_cost.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/[0.02] pb-1.5">
                          <span className="text-zinc-500">Other Costs</span>
                          <span className="text-zinc-300 font-medium">
                            ₹{(p.material_cost + p.shipping_cost + p.labor_cost + p.misc_cost).toFixed(1)}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-white/[0.02] pb-1.5">
                          <span className="text-zinc-500">Expected Profit</span>
                          <span className="text-emerald-450 font-bold">₹{expectedProfit.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex justify-between pt-0.5">
                          <span className="text-zinc-500">Mapped Products</span>
                          <span className="text-zinc-355 font-bold font-mono">{mappedCount} SKUs</span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-white/5 mt-5 pt-3.5 flex items-center justify-between">
                      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Total Profile COGS</span>
                      <span className="font-extrabold text-sm text-white font-mono">{formatCurrency(totalCost)}</span>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Listing Mappings Catalog */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">SKU Catalog mapping</h3>
            
            <div className="flex items-center gap-2">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search SKU, ASIN, title, price, profile..."
                  className="h-9 pl-9 pr-3 rounded-lg border border-white/5 bg-[#0E0E12] text-xs text-white focus:outline-none focus:border-white/10 w-64"
                />
              </div>
            </div>
          </div>

          <GlassCard className="p-4 border-white/5 bg-white/[0.005] rounded-xl">
            {/* Bulk Action Controls */}
            {selectedListings.length > 0 && (
              <div className="flex items-center justify-between p-3 mb-4 rounded-xl bg-white/[0.02] border border-white/5 text-xs">
                <span className="text-zinc-300 font-medium">{selectedListings.length} items selected</span>
                <div className="flex items-center gap-2">
                  <select
                    value={bulkProfileId}
                    onChange={(e) => setBulkProfileId(e.target.value)}
                    className="h-8.5 px-3 rounded-lg border border-white/10 bg-[#0E0E12] text-xs text-white focus:outline-none"
                  >
                    <option value="">Select Profile...</option>
                    <option value="unassign">Clear Assignments</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkAssign}
                    disabled={!bulkProfileId}
                    className="h-8.5 px-4 rounded-lg bg-white hover:bg-zinc-200 disabled:opacity-40 text-black text-xs font-bold transition-all"
                  >
                    Apply Bulk Map
                  </button>
                </div>
              </div>
            )}

            {/* Catalog list table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 font-bold uppercase tracking-wider h-10 text-[10px]">
                    <th className="w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedListings.length === filteredListings.length && filteredListings.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedListings(filteredListings.map(l => l.id));
                          } else {
                            setSelectedListings([]);
                          }
                        }}
                        className="rounded border-white/10 bg-white/5 text-indigo-500"
                      />
                    </th>
                    <th>Product details</th>
                    <th className="text-right">Selling Price</th>
                    <th className="pl-8">Profile Mapping</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="h-32 text-center text-zinc-500">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-650" />
                        Refreshing listings database...
                      </td>
                    </tr>
                  ) : filteredListings.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="h-32 text-center text-zinc-500">No matching listings resolved.</td>
                    </tr>
                  ) : (
                    filteredListings.map((l) => {
                      const isSelected = selectedListings.includes(l.id);
                      const profile = profiles.find(p => p.id === l.cost_profile_id);

                      return (
                        <tr key={l.id} className={`h-16 hover:bg-white/[0.01] transition-colors ${isSelected && 'bg-white/[0.01]'}`}>
                          <td className="text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedListings([...selectedListings, l.id]);
                                } else {
                                  setSelectedListings(selectedListings.filter(id => id !== l.id));
                                }
                              }}
                              className="rounded border-white/10 bg-white/5 text-indigo-500"
                            />
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-3">
                              {l.main_image ? (
                                <img 
                                  src={l.main_image} 
                                  alt={l.title} 
                                  className="w-10 h-10 rounded-lg object-cover border border-white/10 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center text-zinc-500 flex-shrink-0">
                                  <Package className="w-5 h-5 text-zinc-600" />
                                </div>
                              )}
                              <div className="flex flex-col min-w-0 max-w-sm">
                                <span className="font-bold text-xs text-white truncate leading-normal" title={l.title}>
                                  {l.title}
                                </span>
                                <div className="flex items-center gap-2 mt-1 text-[10px] font-mono leading-none">
                                  <span className="text-zinc-400 font-bold bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5">{l.sku}</span>
                                  {l.asin && <span className="text-zinc-500">ASIN: {l.asin}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="text-right font-semibold text-zinc-200">
                            {formatCurrency(l.price)}
                          </td>
                          <td className="pl-8">
                            {profile ? (
                              <span className="inline-flex items-center gap-1.5 text-[9px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full">
                                <Tag className="w-3 h-3" />
                                {profile.name}
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-zinc-600">Unassigned</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* --- Create/Edit Cost Profile Modal & Live Profit Preview --- */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0E0E12] p-6 shadow-2xl relative overflow-hidden flex flex-col md:flex-row gap-6 animate-zoomIn">
            
            {/* Left Side: Inputs Form */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-indigo-400" />
                  {editingProfile ? "Modify Profile" : "New Cost Profile"}
                </h3>
              </div>

              <form onSubmit={handleSaveProfile} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Profile Name</label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="e.g. A3 Matte Packaging Profile"
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Printing cost (INR)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={printingCost}
                      onChange={(e) => setPrintingCost(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-white/10 bg-[#0A0A0C] text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Material Cost (INR)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={materialCost}
                      onChange={(e) => setMaterialCost(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-white/10 bg-[#0A0A0C] text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Packaging Box (INR)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={packagingCost}
                      onChange={(e) => setPackagingCost(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-white/10 bg-[#0A0A0C] text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Shipping Rate (INR)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-white/10 bg-[#0A0A0C] text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Labor / handling (INR)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={laborCost}
                      onChange={(e) => setLaborCost(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-white/10 bg-[#0A0A0C] text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Misc Charges (INR)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={miscCost}
                      onChange={(e) => setMiscCost(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-white/10 bg-[#0A0A0C] text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="flex-1 h-10 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-40"
                  >
                    {savingProfile ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" /> Save Configuration
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="h-10 px-4 rounded-xl border border-white/5 text-zinc-400 hover:text-white hover:bg-white/5 text-xs font-semibold transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>

            {/* Right Side: Live Profit Preview */}
            <div className="w-full md:w-60 shrink-0 border-t md:border-t-0 md:border-l border-white/5 pt-5 md:pt-0 md:pl-6 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-4">Live Profit Preview</span>

                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex flex-col gap-1">
                    <span className="text-zinc-500 text-[10px]">Selling Price (INR)</span>
                    <input
                      type="number"
                      value={previewPrice}
                      onChange={(e) => setPreviewPrice(e.target.value)}
                      className="w-full h-8 px-2.5 rounded border border-white/10 bg-[#0A0A0C] text-xs font-bold text-white focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-between pt-1 border-b border-white/[0.02] pb-1">
                    <span className="text-zinc-500">Amazon Fees (15%)</span>
                    <span className="text-zinc-400">-₹{liveCalculations.fee}</span>
                  </div>
                  
                  <div className="flex justify-between border-b border-white/[0.02] pb-1">
                    <span className="text-zinc-500">Printing Cost</span>
                    <span className="text-zinc-400">-₹{parseFloat(printingCost) || 0}</span>
                  </div>

                  <div className="flex justify-between border-b border-white/[0.02] pb-1">
                    <span className="text-zinc-500">Packaging Box</span>
                    <span className="text-zinc-400">-₹{parseFloat(packagingCost) || 0}</span>
                  </div>

                  <div className="flex justify-between border-b border-white/[0.02] pb-1">
                    <span className="text-zinc-500">Other Costs</span>
                    <span className="text-zinc-400">-₹{(parseFloat(materialCost) || 0) + (parseFloat(shippingCost) || 0) + (parseFloat(laborCost) || 0) + (parseFloat(miscCost) || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Dynamic margins calculations */}
              <div className="mt-6 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Net Profit</span>
                  <span className={`text-base font-black font-mono ${liveCalculations.profit >= 0 ? 'text-emerald-450' : 'text-rose-450'}`}>
                    {liveCalculations.profit >= 0 ? `₹${liveCalculations.profit}` : `-₹${Math.abs(liveCalculations.profit)}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Profit Margin</span>
                  <span className={`text-xs font-extrabold font-mono ${liveCalculations.margin >= 20 ? 'text-emerald-450' : liveCalculations.margin >= 10 ? 'text-indigo-400' : 'text-rose-400'}`}>
                    {liveCalculations.margin}%
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
