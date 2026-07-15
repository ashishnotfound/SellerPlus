"use client";

import { create } from "zustand";
import { supabase } from "@/lib/supabase";

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

interface GoalsStore {
  goals: Goal[];
  loading: boolean;
  loadGoals: (userId: string) => Promise<void>;
  createGoal: (goal: Partial<Goal> & { user_id: string; name: string; target_amount: number }) => Promise<Goal | null>;
  updateGoal: (id: string, patch: Partial<Goal>) => Promise<boolean>;
  deleteGoal: (id: string) => Promise<boolean>;
  completeGoal: (id: string) => Promise<boolean>;
  addSavings: (id: string, amount: number) => Promise<boolean>;
  computeMetrics: (goal: Goal, avgDailyProfit: number, avgProfitPerOrder: number) => GoalMetrics;
}

export const useGoalsStore = create<GoalsStore>((set, get) => ({
  goals: [],
  loading: false,

  loadGoals: async (userId: string) => {
    if (get().goals.length > 0 && get().goals[0].user_id === userId) {
      return;
    }
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        // Table might not exist yet — trigger migration and retry once
        if (error.code === "42P01" || error.message?.includes("relation") || error.message?.includes("does not exist")) {
          console.log("[Goals] Table missing, running auto-migration...");
          try {
            await fetch("/api/db/migrate", { method: "POST" });
            // Retry after migration
            const { data: retryData } = await supabase
              .from("goals")
              .select("*")
              .eq("user_id", userId)
              .order("created_at", { ascending: false });
            set({ goals: (retryData || []) as Goal[] });
          } catch (migErr) {
            console.warn("[Goals] Auto-migration failed:", migErr);
          }
        } else {
          console.error("[Goals] Load error:", error);
        }
      } else if (data) {
        set({ goals: data as Goal[] });
      }
    } catch (e) {
      console.error("[Goals] Failed to load goals:", e);
    } finally {
      set({ loading: false });
    }
  },

  createGoal: async (goalData) => {
    try {
      const { data, error } = await supabase
        .from("goals")
        .insert({
          user_id: goalData.user_id,
          name: goalData.name,
          description: goalData.description || "",
          image_url: goalData.image_url || "",
          target_amount: goalData.target_amount,
          current_savings: goalData.current_savings || 0,
          deadline: goalData.deadline || null,
          priority: goalData.priority || "medium",
          color: goalData.color || "indigo",
          category: goalData.category || "purchase",
          is_completed: false,
        })
        .select()
        .single();

      if (!error && data) {
        set((s) => ({ goals: [data as Goal, ...s.goals] }));
        return data as Goal;
      }
      console.error("[Goals] Create error:", error);
      return null;
    } catch (e) {
      console.error("[Goals] Failed to create goal:", e);
      return null;
    }
  },

  updateGoal: async (id, patch) => {
    try {
      const { error } = await supabase
        .from("goals")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (!error) {
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        }));
        return true;
      }
      console.error("[Goals] Update error:", error);
      return false;
    } catch (e) {
      console.error("[Goals] Failed to update goal:", e);
      return false;
    }
  },

  deleteGoal: async (id) => {
    try {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (!error) {
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
        return true;
      }
      return false;
    } catch (e) {
      console.error("[Goals] Failed to delete goal:", e);
      return false;
    }
  },

  completeGoal: async (id) => {
    return get().updateGoal(id, {
      is_completed: true,
      completed_at: new Date().toISOString(),
      current_savings: get().goals.find((g) => g.id === id)?.target_amount || 0,
    });
  },

  addSavings: async (id, amount) => {
    const goal = get().goals.find((g) => g.id === id);
    if (!goal) return false;
    const newSavings = Math.min(goal.current_savings + amount, goal.target_amount);
    const isCompleted = newSavings >= goal.target_amount;
    return get().updateGoal(id, {
      current_savings: newSavings,
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : undefined,
    });
  },

  computeMetrics: (goal, avgDailyProfit, avgProfitPerOrder): GoalMetrics => {
    const remainingAmount = Math.max(0, goal.target_amount - goal.current_savings);
    const percentageCompleted = Math.min(100, (goal.current_savings / goal.target_amount) * 100);

    const estimatedDaysRemaining =
      avgDailyProfit > 0 ? Math.ceil(remainingAmount / avgDailyProfit) : null;

    const ordersNeeded =
      avgProfitPerOrder > 0 ? Math.ceil(remainingAmount / avgProfitPerOrder) : null;

    const dailySavingsNeeded = goal.deadline
      ? (() => {
          const daysLeft = Math.max(
            1,
            Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          );
          return remainingAmount / daysLeft;
        })()
      : null;

    const expectedCompletionDate =
      estimatedDaysRemaining !== null
        ? new Date(Date.now() + estimatedDaysRemaining * 86400000).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : null;

    // Weekly progress: how much was saved in last 7 days (simplified)
    const weeklyProgress = avgDailyProfit > 0 ? avgDailyProfit * 7 : 0;

    const milestoneReached: 0 | 25 | 50 | 75 | 100 =
      percentageCompleted >= 100
        ? 100
        : percentageCompleted >= 75
        ? 75
        : percentageCompleted >= 50
        ? 50
        : percentageCompleted >= 25
        ? 25
        : 0;

    return {
      remainingAmount,
      percentageCompleted,
      estimatedDaysRemaining,
      ordersNeeded,
      dailySavingsNeeded,
      expectedCompletionDate,
      weeklyProgress,
      milestoneReached,
    };
  },
}));
