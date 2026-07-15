"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { GlassCard } from "@/components/glass-card";
import { Confetti } from "@/components/confetti";
import { useAuth } from "@/hooks/use-auth";
import { useGoalsStore, Goal } from "@/hooks/use-goals-store";
import { useAnalyticsStore } from "@/hooks/use-analytics-store";
import { formatCurrency } from "@/lib/utils";
import {
  Target, Plus, Trash2, CheckCircle2, Edit3, Trophy,
  TrendingUp, Calendar, Package, Sparkles, X, Star,
  ShoppingBag, Laptop, Camera, Car, Home, Plane, Gift,
  Loader2, ChevronRight, Flame, Clock, Zap,
} from "lucide-react";

const PRIORITY_CONFIG = {
  low:    { label: "Low",   color: "zinc",   ring: "ring-zinc-500/30",   badge: "bg-zinc-800 text-zinc-400" },
  medium: { label: "Medium",color: "blue",   ring: "ring-blue-500/30",   badge: "bg-blue-950 text-blue-400" },
  high:   { label: "High",  color: "amber",  ring: "ring-amber-500/30",  badge: "bg-amber-950 text-amber-400" },
  dream:  { label: "Dream", color: "purple", ring: "ring-purple-500/30", badge: "bg-purple-950 text-purple-400" },
};

const GOAL_COLORS = [
  { name: "Indigo", value: "indigo", from: "from-indigo-500", to: "to-violet-600" },
  { name: "Emerald", value: "emerald", from: "from-emerald-500", to: "to-teal-600" },
  { name: "Amber", value: "amber", from: "from-amber-500", to: "to-orange-600" },
  { name: "Rose", value: "rose", from: "from-rose-500", to: "to-pink-600" },
  { name: "Sky", value: "sky", from: "from-sky-500", to: "to-blue-600" },
  { name: "Purple", value: "purple", from: "from-purple-500", to: "to-fuchsia-600" },
];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  purchase: <ShoppingBag className="w-4 h-4" />,
  tech:     <Laptop className="w-4 h-4" />,
  camera:   <Camera className="w-4 h-4" />,
  vehicle:  <Car className="w-4 h-4" />,
  home:     <Home className="w-4 h-4" />,
  travel:   <Plane className="w-4 h-4" />,
  other:    <Gift className="w-4 h-4" />,
};

const MILESTONES = [25, 50, 75, 100] as const;

function CircularProgress({ percent, color = "indigo", size = 80 }: { percent: number; color?: string; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;

  const strokeMap: Record<string, string> = {
    indigo: "#6366f1", emerald: "#10b981", amber: "#f59e0b",
    rose: "#f43f5e", sky: "#0ea5e9", purple: "#a855f7",
  };
  const stroke = strokeMap[color] || "#6366f1";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} stroke="rgba(255,255,255,0.06)" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} strokeWidth={6}
        stroke={stroke} fill="none"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
    </svg>
  );
}

interface CreateGoalForm {
  name: string;
  description: string;
  imageUrl: string;
  targetAmount: string;
  currentSavings: string;
  deadline: string;
  priority: "low" | "medium" | "high" | "dream";
  color: string;
  category: string;
}

const DEFAULT_FORM: CreateGoalForm = {
  name: "", description: "", imageUrl: "", targetAmount: "",
  currentSavings: "0", deadline: "", priority: "medium",
  color: "indigo", category: "purchase",
};

export default function GoalsPage() {
  const user = useAuth((s) => s.user);
  const goals = useGoalsStore((s) => s.goals);
  const loading = useGoalsStore((s) => s.loading);
  const loadGoals = useGoalsStore((s) => s.loadGoals);
  const createGoal = useGoalsStore((s) => s.createGoal);
  const updateGoal = useGoalsStore((s) => s.updateGoal);
  const deleteGoal = useGoalsStore((s) => s.deleteGoal);
  const completeGoal = useGoalsStore((s) => s.completeGoal);
  const computeMetrics = useGoalsStore((s) => s.computeMetrics);
  const getSummary = useAnalyticsStore((s) => s.getSummary);
  const financialLogs = useAnalyticsStore((s) => s.financialLogs);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreateGoalForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  const [celebrationGoal, setCelebrationGoal] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [addSavingsModal, setAddSavingsModal] = useState<{ goal: Goal; amount: string } | null>(null);

  const searchParams = useSearchParams();

  // Pre-fill from URL params (when AI creates a goal)
  useEffect(() => {
    const create = searchParams?.get("create");
    const name = searchParams?.get("name");
    const amount = searchParams?.get("amount");
    if (create && name) {
      setForm((f) => ({ ...f, name: decodeURIComponent(name), targetAmount: amount || "" }));
      setShowCreateModal(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user?.id) loadGoals(user.id);
  }, [user?.id, loadGoals]);

  const summary = useMemo(() => getSummary(), [getSummary]);

  const { avgDailyProfit, avgProfitPerOrder } = useMemo(() => {
    const logProfit = financialLogs.length > 0
      ? financialLogs.reduce((acc, l) => {
          const profit = (l.revenue || 0) - ((l.cogs || 0) + (l.shippingCost || 0) + (l.amazonFees || 0) + (l.adSpend || 0));
          return acc + profit;
        }, 0) / financialLogs.length
      : (summary.netProfit || 0) / 30;
    const perOrder = (summary.ordersCount !== null && summary.ordersCount > 0 && summary.netProfit !== null) 
      ? summary.netProfit / summary.ordersCount 
      : 0;
    return { avgDailyProfit: logProfit, avgProfitPerOrder: perOrder };
  }, [financialLogs, summary]);

  const activeGoals = useMemo(() => goals.filter((g) => !g.is_completed), [goals]);
  const completedGoals = useMemo(() => goals.filter((g) => g.is_completed), [goals]);
  const topGoal = activeGoals[0];

  const handleCreate = async () => {
    if (!user?.id || !form.name || !form.targetAmount) return;
    setSaving(true);
    const result = await createGoal({
      user_id: user.id,
      name: form.name,
      description: form.description,
      image_url: form.imageUrl,
      target_amount: Number(form.targetAmount),
      current_savings: Number(form.currentSavings) || 0,
      deadline: form.deadline || undefined,
      priority: form.priority,
      color: form.color,
      category: form.category,
    });
    setSaving(false);
    if (result) {
      setShowCreateModal(false);
      setForm(DEFAULT_FORM);
    }
  };

  const handleComplete = async (goal: Goal) => {
    await completeGoal(goal.id);
    setCelebrationGoal(goal.name);
    setConfettiActive(true);
  };

  const handleAddSavings = async () => {
    if (!addSavingsModal) return;
    const amount = Number(addSavingsModal.amount);
    if (isNaN(amount) || amount <= 0) return;
    const { goal } = addSavingsModal;
    const newSavings = Math.min(goal.current_savings + amount, goal.target_amount);
    await updateGoal(goal.id, { current_savings: newSavings });
    if (newSavings >= goal.target_amount) {
      setCelebrationGoal(goal.name);
      setConfettiActive(true);
    }
    setAddSavingsModal(null);
  };

  const colorConfig = (color: string) =>
    GOAL_COLORS.find((c) => c.value === color) || GOAL_COLORS[0];

  return (
    <div className="flex flex-col gap-8 p-6 max-w-7xl mx-auto">
      <Confetti active={confettiActive} onDone={() => setConfettiActive(false)} />

      {/* Celebration toast */}
      {celebrationGoal && confettiActive && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce">
          <Trophy className="w-6 h-6 text-amber-300" />
          <div>
            <p className="font-bold text-base">Congratulations! 🎉</p>
            <p className="text-sm opacity-90">You've achieved your <strong>{celebrationGoal}</strong> goal!</p>
          </div>
          <button onClick={() => setCelebrationGoal(null)} className="ml-4 opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-400" />
            Dream Goals
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Turn your business profits into real-life rewards
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" /> New Goal
        </button>
      </div>

      {/* Top Goal Banner */}
      {topGoal && (() => {
        const metrics = computeMetrics(topGoal, avgDailyProfit, avgProfitPerOrder);
        const cfg = colorConfig(topGoal.color);
        return (
          <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${cfg.from} ${cfg.to} p-6`}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="relative flex items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                {topGoal.image_url ? (
                  <img src={topGoal.image_url} alt={topGoal.name} className="w-20 h-20 rounded-xl object-cover border-2 border-white/20" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-white/10 border-2 border-white/20 flex items-center justify-center">
                    {CATEGORY_ICONS[topGoal.category] || <Target className="w-8 h-8 text-white/60" />}
                  </div>
                )}
                <div>
                  <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">Your Next Goal</p>
                  <h2 className="text-2xl font-bold text-white mt-0.5">{topGoal.name}</h2>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-white/90 font-bold text-lg">
                      {formatCurrency(topGoal.current_savings)} <span className="text-white/50 font-normal text-sm">/ {formatCurrency(topGoal.target_amount)}</span>
                    </span>
                    <span className="bg-white/15 text-white text-xs px-2.5 py-1 rounded-full font-bold">
                      {metrics.percentageCompleted.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="hidden md:grid grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-white/50 text-xs">Remaining</p>
                  <p className="text-white font-bold text-lg">{formatCurrency(metrics.remainingAmount)}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs">Est. Completion</p>
                  <p className="text-white font-bold text-sm">{metrics.expectedCompletionDate || "—"}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs">Orders Needed</p>
                  <p className="text-white font-bold text-lg">{metrics.ordersNeeded?.toLocaleString() || "—"}</p>
                </div>
              </div>
            </div>
            {/* Progress bar */}
            <div className="relative mt-4 h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-white/80 transition-all duration-700"
                style={{ width: `${metrics.percentageCompleted}%` }}
              />
            </div>
            <div className="flex justify-between text-white/40 text-[10px] mt-1">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>
        );
      })()}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      )}

      {/* No goals empty state */}
      {!loading && goals.length === 0 && (
        <GlassCard className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Target className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">No goals yet</h3>
            <p className="text-zinc-500 text-sm mt-1">Create your first dream purchase goal and track your progress!</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all"
          >
            <Plus className="w-4 h-4 inline mr-1.5" /> Create First Goal
          </button>
        </GlassCard>
      )}

      {/* Active Goals Grid */}
      {activeGoals.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Active Goals</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeGoals.map((goal) => {
              const metrics = computeMetrics(goal, avgDailyProfit, avgProfitPerOrder);
              const cfg = colorConfig(goal.color);
              const pCfg = PRIORITY_CONFIG[goal.priority];

              return (
                <GlassCard key={goal.id} className="flex flex-col gap-4 relative overflow-hidden group">
                  {/* Top accent */}
                  <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${cfg.from} ${cfg.to}`} />

                  {/* Goal header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {goal.image_url ? (
                        <img src={goal.image_url} alt={goal.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.from} ${cfg.to} flex items-center justify-center flex-shrink-0`}>
                          {CATEGORY_ICONS[goal.category] || <Target className="w-5 h-5 text-white" />}
                        </div>
                      )}
                      <div>
                        <h3 className="text-sm font-bold text-white leading-tight">{goal.name}</h3>
                        {goal.description && (
                          <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{goal.description}</p>
                        )}
                        <span className={`mt-1 text-[10px] px-1.5 py-0.5 rounded font-bold inline-block ${pCfg.badge}`}>
                          {pCfg.label}
                        </span>
                      </div>
                    </div>
                    <div className="relative flex-shrink-0">
                      <CircularProgress percent={metrics.percentageCompleted} color={goal.color} size={52} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-white">{metrics.percentageCompleted.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Savings progress */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-zinc-400">
                        <span className="text-white font-bold">{formatCurrency(goal.current_savings)}</span>
                        <span className="text-zinc-600"> / {formatCurrency(goal.target_amount)}</span>
                      </span>
                      <span className="text-xs text-zinc-500">{formatCurrency(metrics.remainingAmount)} left</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${cfg.from} ${cfg.to} transition-all duration-700`}
                        style={{ width: `${metrics.percentageCompleted}%` }}
                      />
                    </div>
                  </div>

                  {/* Milestone dots */}
                  <div className="flex items-center gap-2">
                    {MILESTONES.map((m) => (
                      <div key={m} className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full transition-all ${
                          metrics.percentageCompleted >= m
                            ? `bg-gradient-to-r ${cfg.from} ${cfg.to} shadow-sm`
                            : "bg-white/10"
                        }`} />
                        <span className="text-[9px] text-zinc-600">{m}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/[0.03] rounded-lg p-2.5 border border-white/5">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Clock className="w-2.5 h-2.5 text-zinc-500" />
                        <span className="text-[9px] text-zinc-500 uppercase tracking-wide">Est. Days</span>
                      </div>
                      <p className="text-sm font-bold text-white">
                        {metrics.estimatedDaysRemaining ? `${metrics.estimatedDaysRemaining}d` : "—"}
                      </p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-2.5 border border-white/5">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Package className="w-2.5 h-2.5 text-zinc-500" />
                        <span className="text-[9px] text-zinc-500 uppercase tracking-wide">Orders</span>
                      </div>
                      <p className="text-sm font-bold text-white">
                        {metrics.ordersNeeded ? metrics.ordersNeeded.toLocaleString() : "—"}
                      </p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-2.5 border border-white/5">
                      <div className="flex items-center gap-1 mb-0.5">
                        <TrendingUp className="w-2.5 h-2.5 text-zinc-500" />
                        <span className="text-[9px] text-zinc-500 uppercase tracking-wide">Daily Save</span>
                      </div>
                      <p className="text-sm font-bold text-white">
                        {metrics.dailySavingsNeeded ? formatCurrency(metrics.dailySavingsNeeded) : "—"}
                      </p>
                    </div>
                    <div className="bg-white/[0.03] rounded-lg p-2.5 border border-white/5">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Calendar className="w-2.5 h-2.5 text-zinc-500" />
                        <span className="text-[9px] text-zinc-500 uppercase tracking-wide">Completion</span>
                      </div>
                      <p className="text-[10px] font-bold text-white leading-tight">
                        {metrics.expectedCompletionDate || "—"}
                      </p>
                    </div>
                  </div>

                  {/* Weekly progress bar */}
                  {avgDailyProfit > 0 && (
                    <div className="bg-white/[0.03] rounded-lg p-2.5 border border-white/5">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1">
                          <Flame className="w-2.5 h-2.5 text-orange-400" />
                          <span className="text-[9px] text-zinc-500">Weekly Progress</span>
                        </div>
                        <span className="text-[10px] font-bold text-white">{formatCurrency(metrics.weeklyProgress)}</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orange-500"
                          style={{ width: `${Math.min(100, (metrics.weeklyProgress / goal.target_amount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setAddSavingsModal({ goal, amount: "" })}
                      className={`flex-1 h-8 rounded-lg bg-gradient-to-r ${cfg.from} ${cfg.to} text-white text-[11px] font-bold hover:opacity-90 transition-all`}
                    >
                      + Add Savings
                    </button>
                    <button
                      onClick={() => handleComplete(goal)}
                      className="h-8 px-3 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-[11px] font-bold transition-all"
                      title="Mark as completed"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteGoal(goal.id)}
                      className="h-8 px-3 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 text-[11px] font-bold transition-all"
                      title="Delete goal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" /> Achieved Goals ({completedGoals.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {completedGoals.map((goal) => (
              <div
                key={goal.id}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5"
              >
                {goal.image_url ? (
                  <img src={goal.image_url} alt={goal.name} className="w-10 h-10 rounded-lg object-cover opacity-80" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{goal.name}</p>
                  <p className="text-[10px] text-emerald-400">{formatCurrency(goal.target_amount)} achieved 🎉</p>
                </div>
                <button onClick={() => deleteGoal(goal.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Goal Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0E0E12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/8">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Create Dream Goal</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
              {/* Goal name */}
              <div>
                <label className="text-xs text-zinc-400 font-semibold block mb-1.5">Goal Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Lenovo Legion Pro 5"
                  className="w-full h-10 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>

              {/* Target amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 font-semibold block mb-1.5">Target Amount (₹) *</label>
                  <input
                    type="number"
                    value={form.targetAmount}
                    onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))}
                    placeholder="150000"
                    className="w-full h-10 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 font-semibold block mb-1.5">Current Savings (₹)</label>
                  <input
                    type="number"
                    value={form.currentSavings}
                    onChange={(e) => setForm((f) => ({ ...f, currentSavings: e.target.value }))}
                    placeholder="0"
                    className="w-full h-10 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              {/* Image URL */}
              <div>
                <label className="text-xs text-zinc-400 font-semibold block mb-1.5">Product Image URL</label>
                <input
                  value={form.imageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://... (paste image link from Amazon, Google, etc.)"
                  className="w-full h-10 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50"
                />
                {form.imageUrl && (
                  <img src={form.imageUrl} alt="Preview" className="w-16 h-16 rounded-lg object-cover mt-2" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </div>

              {/* Deadline */}
              <div>
                <label className="text-xs text-zinc-400 font-semibold block mb-1.5">Deadline (optional)</label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                  className="w-full h-10 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50 [color-scheme:dark]"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="text-xs text-zinc-400 font-semibold block mb-1.5">Priority</label>
                <div className="flex gap-2">
                  {(["low", "medium", "high", "dream"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setForm((f) => ({ ...f, priority: p }))}
                      className={`flex-1 h-8 rounded-lg text-[11px] font-bold capitalize border transition-all ${
                        form.priority === p ? PRIORITY_CONFIG[p].badge + " border-current" : "border-white/10 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {PRIORITY_CONFIG[p].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="text-xs text-zinc-400 font-semibold block mb-1.5">Card Color</label>
                <div className="flex gap-2">
                  {GOAL_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setForm((f) => ({ ...f, color: c.value }))}
                      className={`w-8 h-8 rounded-full bg-gradient-to-br ${c.from} ${c.to} transition-all ${
                        form.color === c.value ? "ring-2 ring-white ring-offset-2 ring-offset-[#0E0E12] scale-110" : "opacity-60 hover:opacity-90"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-zinc-400 font-semibold block mb-1.5">Description (optional)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Why do you want this?"
                  rows={2}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-5 border-t border-white/8">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 h-10 rounded-xl border border-white/10 text-sm text-zinc-400 hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.name || !form.targetAmount}
                className="flex-1 h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 disabled:opacity-50 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                Create Goal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Savings Modal */}
      {addSavingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-80 bg-[#0E0E12] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-1">Add Savings</h3>
            <p className="text-[11px] text-zinc-500 mb-4">How much are you adding to <strong className="text-zinc-300">{addSavingsModal.goal.name}</strong>?</p>
            <input
              type="number"
              autoFocus
              value={addSavingsModal.amount}
              onChange={(e) => setAddSavingsModal((m) => m ? { ...m, amount: e.target.value } : m)}
              placeholder="Amount in ₹"
              className="w-full h-10 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50 mb-4"
              onKeyDown={(e) => e.key === "Enter" && handleAddSavings()}
            />
            <div className="flex gap-3">
              <button onClick={() => setAddSavingsModal(null)} className="flex-1 h-9 rounded-xl border border-white/10 text-xs text-zinc-400 hover:bg-white/5">Cancel</button>
              <button onClick={handleAddSavings} className="flex-1 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
