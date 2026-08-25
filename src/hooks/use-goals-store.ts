"use client";

import { create } from "zustand";
import { useToastStore } from "@/hooks/use-toast-store";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  image_url?: string;
  target_amount: number;
  current_savings: number;
  deadline?: string;
  priority: "low" | "medium" | "high" | "dream";
  is_completed: boolean;
  completed_at?: string;
  color: string;
  category: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface GoalMetrics {
  remainingAmount: number;
  percentageCompleted: number;
  estimatedDaysRemaining: number | null;
  ordersNeeded: number | null;
  dailySavingsNeeded: number | null;
  expectedCompletionDate: string | null;
  weeklyProgress: number;
  milestoneReached: 0 | 25 | 50 | 75 | 100;
}

export interface GoalPlanningContext {
  available: boolean;
  averageDailyProfit: number | null;
  averageProfitPerOrder: number | null;
  verifiedProfit: number | null;
  dataWindow: { since: string; until: string };
  cogsCoverage: number;
  adsDataAvailable: boolean;
  sourceUpdatedAt: { orders: string | null; ads: string | null };
  limitations: string[];
  methodology: "verified_30_day_profit_run_rate_v1";
}

interface GoalsStore {
  goals: Goal[];
  planningContext: GoalPlanningContext | null;
  loading: boolean;
  loadGoals: (userId: string) => Promise<void>;
  createGoal: (goal: Partial<Goal> & { user_id: string; name: string; target_amount: number }) => Promise<Goal | null>;
  updateGoal: (id: string, patch: Partial<Goal>) => Promise<boolean>;
  deleteGoal: (id: string) => Promise<boolean>;
  completeGoal: (id: string) => Promise<boolean>;
  addSavings: (id: string, amount: number) => Promise<boolean>;
  computeMetrics: (goal: Goal, avgDailyProfit: number, avgProfitPerOrder: number) => GoalMetrics;
}

async function goalsRequest(path: string, init?: RequestInit) {
  const response = await sellerplusApiFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Goal request failed.");
  return body;
}

function goalPayload(goal: Partial<Goal> & Pick<Goal, "name" | "target_amount" | "current_savings" | "priority" | "color" | "category" | "is_completed">) {
  return {
    id: goal.id ?? null,
    expectedVersion: goal.version ?? null,
    name: goal.name,
    description: goal.description ?? "",
    imageUrl: goal.image_url ?? "",
    targetAmount: Number(goal.target_amount),
    currentSavings: Number(goal.current_savings),
    deadline: goal.deadline ?? null,
    priority: goal.priority,
    color: goal.color,
    category: goal.category,
    isCompleted: goal.is_completed,
  };
}

function showFailure(title: string, error: unknown) {
  useToastStore.getState().error(title, error instanceof Error ? error.message : "Try again.");
}

export const useGoalsStore = create<GoalsStore>((set, get) => ({
  goals: [],
  planningContext: null,
  loading: false,

  loadGoals: async () => {
    set({ loading: true });
    try {
      const body = await goalsRequest("/api/goals");
      set({
        goals: (body.data ?? []) as Goal[],
        planningContext: (body.planningContext ?? null) as GoalPlanningContext | null,
      });
    } catch (error) {
      showFailure("Goals unavailable", error);
      set({ goals: [], planningContext: null });
    } finally {
      set({ loading: false });
    }
  },

  createGoal: async (goal) => {
    try {
      const body = await goalsRequest("/api/goals", {
        method: "POST",
        body: JSON.stringify(goalPayload({
          ...goal,
          current_savings: Number(goal.current_savings ?? 0),
          priority: goal.priority ?? "medium",
          color: goal.color ?? "indigo",
          category: goal.category ?? "purchase",
          is_completed: false,
        })),
      });
      const created = body.data as Goal;
      set((state) => ({ goals: [created, ...state.goals] }));
      return created;
    } catch (error) {
      showFailure("Goal not created", error);
      return null;
    }
  },

  updateGoal: async (id, patch) => {
    const current = get().goals.find((goal) => goal.id === id);
    if (!current) return false;
    try {
      const merged = { ...current, ...patch };
      const body = await goalsRequest("/api/goals", {
        method: "POST",
        body: JSON.stringify(goalPayload(merged)),
      });
      const saved = body.data as Goal;
      set((state) => ({ goals: state.goals.map((goal) => goal.id === id ? saved : goal) }));
      return true;
    } catch (error) {
      showFailure("Goal not updated", error);
      return false;
    }
  },

  deleteGoal: async (id) => {
    const goal = get().goals.find((item) => item.id === id);
    if (!goal) return false;
    try {
      await goalsRequest(`/api/goals?id=${encodeURIComponent(id)}&version=${goal.version}`, { method: "DELETE" });
      set((state) => ({ goals: state.goals.filter((item) => item.id !== id) }));
      return true;
    } catch (error) {
      showFailure("Goal not deleted", error);
      return false;
    }
  },

  completeGoal: async (id) => {
    const goal = get().goals.find((item) => item.id === id);
    if (!goal) return false;
    return get().updateGoal(id, { is_completed: true, current_savings: goal.target_amount });
  },

  addSavings: async (id, amount) => {
    const goal = get().goals.find((item) => item.id === id);
    if (!goal || !Number.isFinite(amount) || amount <= 0) return false;
    const currentSavings = Math.min(goal.current_savings + amount, goal.target_amount);
    return get().updateGoal(id, {
      current_savings: currentSavings,
      is_completed: currentSavings >= goal.target_amount,
    });
  },

  computeMetrics: (goal, avgDailyProfit, avgProfitPerOrder) => {
    const remainingAmount = Math.max(0, goal.target_amount - goal.current_savings);
    const percentageCompleted = goal.target_amount > 0
      ? Math.min(100, (goal.current_savings / goal.target_amount) * 100)
      : 0;
    const estimatedDaysRemaining = avgDailyProfit > 0 ? Math.ceil(remainingAmount / avgDailyProfit) : null;
    const ordersNeeded = avgProfitPerOrder > 0 ? Math.ceil(remainingAmount / avgProfitPerOrder) : null;
    const dailySavingsNeeded = goal.deadline
      ? remainingAmount / Math.max(1, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86_400_000))
      : null;
    const expectedCompletionDate = estimatedDaysRemaining === null ? null : new Date(Date.now() + estimatedDaysRemaining * 86_400_000)
      .toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const milestoneReached: 0 | 25 | 50 | 75 | 100 = percentageCompleted >= 100 ? 100
      : percentageCompleted >= 75 ? 75 : percentageCompleted >= 50 ? 50 : percentageCompleted >= 25 ? 25 : 0;
    return {
      remainingAmount,
      percentageCompleted,
      estimatedDaysRemaining,
      ordersNeeded,
      dailySavingsNeeded,
      expectedCompletionDate,
      weeklyProgress: avgDailyProfit > 0 ? avgDailyProfit * 7 : 0,
      milestoneReached,
    };
  },
}));
