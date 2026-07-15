"use client";

import React, { useState, useEffect, useMemo } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import {
  DollarSign, Plus, Trash2, Edit3, Save, Loader2,
  Calendar, CreditCard, PieChart, Info, AlertTriangle, X
} from "lucide-react";
import { useToastStore } from "@/hooks/use-toast-store";

interface Expense {
  id: string;
  category: string;
  amount: number;
  currency: string;
  description: string;
  date: string;
  is_recurring: boolean;
  recurrence_interval: "daily" | "weekly" | "monthly" | "yearly" | null;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  Rent: "🏢",
  Software: "💻",
  Salary: "👥",
  Advertising: "📈",
  Office: "📦",
  Miscellaneous: "⚙️"
};

export default function ExpensesPage() {
  const user = useAuth((s) => s.user);

  // States
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Form states
  const [category, setCategory] = useState("Software");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadExpenses();
    }
  }, [user?.id]);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user?.id)
        .order("date", { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (e) {
      console.error("Failed to load expenses:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingExpense(null);
    setCategory("Software");
    setAmount("");
    setDescription("");
    setDate(new Date().toISOString().split("T")[0]);
    setIsRecurring(false);
    setRecurrenceInterval("monthly");
    setShowFormModal(true);
  };

  const handleOpenEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setCategory(exp.category);
    setAmount(exp.amount.toString());
    setDescription(exp.description || "");
    setDate(exp.date);
    setIsRecurring(exp.is_recurring);
    setRecurrenceInterval(exp.recurrence_interval || "monthly");
    setShowFormModal(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !amount) return;
    setSaving(true);

    const payload = {
      user_id: user.id,
      category,
      amount: parseFloat(amount) || 0,
      currency: "INR",
      description: description.trim(),
      date,
      is_recurring: isRecurring,
      recurrence_interval: isRecurring ? recurrenceInterval : null
    };

    try {
      if (editingExpense) {
        const { error } = await supabase
          .from("expenses")
          .update(payload)
          .eq("id", editingExpense.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("expenses")
          .insert(payload);
        if (error) throw error;
      }
      setShowFormModal(false);
      loadExpenses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().error("Save Failed", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense ledger item?")) return;
    try {
      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", id);
      if (error) throw error;
      loadExpenses();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      useToastStore.getState().error("Delete Failed", msg);
    }
  };

  // Summary Metrics calculations
  const metrics = useMemo(() => {
    let total = 0;
    let recurringTotal = 0;
    let oneOffTotal = 0;
    const catMap: Record<string, number> = {};

    expenses.forEach((e) => {
      total += e.amount;
      if (e.is_recurring) {
        recurringTotal += e.amount;
      } else {
        oneOffTotal += e.amount;
      }
      catMap[e.category] = (catMap[e.category] || 0) + e.amount;
    });

    return { total, recurringTotal, oneOffTotal, categories: catMap };
  }, [expenses]);

  return (
    <div className="flex flex-col gap-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-indigo-400" />
            Operating expenses (OpEx)
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Track rent, subscription software, salaries, PPC advertising, and other business overheads.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" /> Log Expense
        </button>
      </div>

      {/* KPI Cards row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="p-5 flex items-center justify-between overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl" />
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Total OpEx Overhead</span>
            <span className="text-2xl font-black text-white mt-1.5">{formatCurrency(metrics.total)}</span>
            <span className="text-[10px] text-zinc-400 mt-2">All categories logged</span>
          </div>
          <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
            <CreditCard className="w-6 h-6 text-indigo-400" />
          </div>
        </GlassCard>

        <GlassCard className="p-5 flex items-center justify-between overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">Recurring Commitments</span>
            <span className="text-2xl font-black text-emerald-400 mt-1.5">{formatCurrency(metrics.recurringTotal)}</span>
            <span className="text-[10px] text-zinc-400 mt-2">Software, Rent & Salaries</span>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
            <Calendar className="w-6 h-6 text-emerald-400" />
          </div>
        </GlassCard>

        <GlassCard className="p-5 flex items-center justify-between overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 uppercase font-extrabold tracking-wider">One-Off Disbursements</span>
            <span className="text-2xl font-black text-amber-400 mt-1.5">{formatCurrency(metrics.oneOffTotal)}</span>
            <span className="text-[10px] text-zinc-400 mt-2">PPC Spend, Misc packaging</span>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
            <PieChart className="w-6 h-6 text-amber-400" />
          </div>
        </GlassCard>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Categorized breakdowns */}
        <div className="lg:col-span-1 flex flex-col gap-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Overhead Breakdown</h3>
          
          <GlassCard className="p-5 border-white/5 flex flex-col gap-4">
            {Object.keys(metrics.categories).length === 0 ? (
              <span className="text-xs text-zinc-500 text-center py-6">No data mappings available</span>
            ) : (
              Object.entries(metrics.categories).map(([cat, val]) => {
                const percent = Math.round((val / (metrics.total || 1)) * 100);
                
                return (
                  <div key={cat} className="flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between items-center text-zinc-300">
                      <span className="font-semibold flex items-center gap-1.5">
                        <span className="text-sm leading-none">{CATEGORY_ICONS[cat] || "⚙️"}</span>
                        {cat}
                      </span>
                      <span className="font-black text-zinc-200">
                        {formatCurrency(val)} <span className="text-[10px] text-zinc-500 font-normal">({percent}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 rounded-full" 
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </GlassCard>
        </div>

        {/* Right Column: Ledger List */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Expense Ledger History</h3>

          <GlassCard className="p-4 border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 font-bold uppercase tracking-wider h-9">
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th className="text-right">Amount</th>
                    <th className="w-16 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="h-32 text-center text-zinc-500">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-600" />
                        Loading OpEx history logs...
                      </td>
                    </tr>
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="h-24 text-center text-zinc-500 font-medium">
                        No operational expenses logged yet. Click "Log Expense" to begin tracking overheads.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((e) => (
                      <tr key={e.id} className="h-12 hover:bg-white/[0.01] transition-colors">
                        <td className="text-zinc-300 font-semibold">{new Date(e.date).toLocaleDateString()}</td>
                        <td className="font-bold text-zinc-200">
                          <span className="mr-1.5">{CATEGORY_ICONS[e.category] || "⚙️"}</span>
                          {e.category}
                        </td>
                        <td className="max-w-[200px] truncate text-zinc-400 font-medium" title={e.description}>
                          {e.description || "—"}
                        </td>
                        <td>
                          {e.is_recurring ? (
                            <span className="inline-flex items-center text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full capitalize">
                              🔄 {e.recurrence_interval}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-medium text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full">
                              One-Off
                            </span>
                          )}
                        </td>
                        <td className="text-right font-bold text-rose-400">
                          - ₹{e.amount.toLocaleString("en-IN")}
                        </td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => handleOpenEdit(e)} className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-white">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteExpense(e.id)} className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-rose-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* --- Log/Modify Expense Modal --- */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0E0E12] p-6 shadow-2xl relative overflow-hidden animate-zoomIn">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-400" />
                {editingExpense ? "Modify Expense Entry" : "Log Expense Entry"}
              </h3>
              <button onClick={() => setShowFormModal(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Expense Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-white/10 bg-[#0E0E12] text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Software">💻 Software subscriptions</option>
                  <option value="Rent">🏢 Rent & Space</option>
                  <option value="Salary">👥 Payroll & Contractors</option>
                  <option value="Advertising">📈 Advertising & Ads spend</option>
                  <option value="Office">📦 Office supplies & Warehouse</option>
                  <option value="Miscellaneous">⚙️ Miscellaneous bills</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Amount (INR)</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="₹ Amount paid"
                  className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Date Charged</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-white/10 bg-[#0E0E12] text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Description / Note</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Software name, bill reference..."
                  rows={2}
                  className="w-full p-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.01] border border-white/5 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  id="isRecurringCheck"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="rounded border-white/10 bg-white/5 text-indigo-500"
                />
                <label htmlFor="isRecurringCheck" className="font-semibold cursor-pointer flex-1">Recurring expense?</label>
                
                {isRecurring && (
                  <select
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(e.target.value as any)}
                    className="h-7 px-2 rounded border border-white/10 bg-[#0E0E12] text-[10px] text-white focus:outline-none"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                )}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="h-11 w-full mt-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save Expense Item
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
