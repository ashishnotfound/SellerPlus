"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToastStore } from "@/hooks/use-toast-store";
import {
  CalendarClock, Plus, Trash2, Play, Pause, RefreshCw,
  CheckCircle2, Clock, AlertCircle, Zap, X, ChevronDown,
  BarChart2, Package, FileText, Search, TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRESET_SCHEDULES, PresetScheduleKey } from "@/lib/jobs/cron-utils";
import { JOB_REGISTRY, ALL_JOB_TYPES, type JobType } from "@/lib/jobs/job-registry";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiSchedule {
  id: string;
  title: string;
  task_type: JobType;
  cron_schedule: string;
  status: "active" | "paused";
  last_run: string | null;
  next_run: string;
  created_at: string;
}

// ─── Task type config (display metadata) ─────────────────────────────────────

const TASK_ICONS: Partial<Record<JobType, React.ReactNode>> = {
  executive_assistant:    <BarChart2   className="w-4 h-4" />,
  audit_ads:              <TrendingDown className="w-4 h-4" />,
  check_inventory:        <Package     className="w-4 h-4" />,
  generate_report:        <FileText    className="w-4 h-4" />,
  create_listing_draft:   <Zap         className="w-4 h-4" />,
  find_keywords:          <Search      className="w-4 h-4" />,
  detect_low_profit_asin: <AlertCircle className="w-4 h-4" />,
  bi_analysis:            <BarChart2   className="w-4 h-4" />,
};

function TaskIcon({ type }: { type: JobType }) {
  return (
    <span className="text-emerald-400">
      {TASK_ICONS[type] ?? <CalendarClock className="w-4 h-4" />}
    </span>
  );
}

// ─── Schedule Card ────────────────────────────────────────────────────────────

interface ScheduleCardProps {
  schedule: AiSchedule;
  onToggle: (id: string, currentStatus: "active" | "paused") => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  toggling: boolean;
  deleting: boolean;
}

function ScheduleCard({ schedule, onToggle, onDelete, toggling, deleting }: ScheduleCardProps) {
  const isActive = schedule.status === "active";
  const registryEntry = JOB_REGISTRY[schedule.task_type];
  const nextRun = schedule.next_run ? new Date(schedule.next_run) : null;
  const lastRun = schedule.last_run ? new Date(schedule.last_run) : null;

  const humanCron = Object.values(PRESET_SCHEDULES).find(
    (p) => p.cron === schedule.cron_schedule
  )?.label ?? schedule.cron_schedule;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-all duration-200",
        isActive
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-white/8 bg-white/[0.03] opacity-70"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <TaskIcon type={schedule.task_type} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate">{schedule.title}</p>
            <p className="text-white/45 text-xs truncate">{registryEntry?.name ?? schedule.task_type}</p>
          </div>
        </div>

        {/* Status badge */}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border shrink-0",
            isActive
              ? "text-emerald-400 bg-emerald-400/10 border-emerald-500/30"
              : "text-white/35 bg-white/5 border-white/10"
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-400 animate-pulse" : "bg-white/30")} />
          {isActive ? "Active" : "Paused"}
        </span>
      </div>

      {/* Schedule & timing */}
      <div className="grid grid-cols-2 gap-3 text-xs mb-4">
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-white/35 mb-0.5">Schedule</p>
          <p className="text-white/75 font-medium">{humanCron}</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-white/35 mb-0.5">Next Run</p>
          <p className="text-white/75 font-medium">
            {nextRun ? nextRun.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
          </p>
        </div>
        {lastRun && (
          <div className="rounded-lg bg-white/5 px-3 py-2 col-span-2">
            <p className="text-white/35 mb-0.5">Last Run</p>
            <p className="text-white/55">{lastRun.toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onToggle(schedule.id, schedule.status)}
          disabled={toggling}
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-xl transition-all disabled:opacity-50",
            isActive
              ? "bg-white/8 hover:bg-white/12 text-white/70"
              : "bg-emerald-500 hover:bg-emerald-400 text-black"
          )}
        >
          {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {toggling ? "Saving…" : isActive ? "Pause" : "Resume"}
        </button>

        <div className="flex-1" />

        <button
          onClick={() => onDelete(schedule.id)}
          disabled={deleting}
          className="flex items-center gap-1.5 text-xs text-rose-400/60 hover:text-rose-400 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-rose-500/5 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Create Schedule Modal ────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreate: (data: {
    title: string;
    task_type: JobType;
    cron_schedule: string;
  }) => Promise<void>;
  creating: boolean;
}

function CreateScheduleModal({ onClose, onCreate, creating }: CreateModalProps) {
  const [taskType, setTaskType] = useState<JobType>("executive_assistant");
  const [scheduleKey, setScheduleKey] = useState<PresetScheduleKey>("every_morning");
  const [title, setTitle] = useState(JOB_REGISTRY.executive_assistant.name);

  const handleTaskChange = (t: JobType) => {
    setTaskType(t);
    setTitle(JOB_REGISTRY[t]?.name ?? t);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cron = PRESET_SCHEDULES[scheduleKey].cron;
    onCreate({ title, task_type: taskType, cron_schedule: cron });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/12 bg-[#141518] shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">New AI Schedule</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Task Type */}
          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">
              Task Type
            </label>
            <div className="relative">
              <select
                value={taskType}
                onChange={(e) => handleTaskChange(e.target.value as JobType)}
                className="w-full appearance-none rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm px-3 py-2.5 pr-8 focus:outline-none focus:border-emerald-500/50 transition-colors"
              >
                {ALL_JOB_TYPES.filter((t) => t !== "bi_analysis").map((t) => (
                  <option key={t} value={t} className="bg-[#141518]">
                    {JOB_REGISTRY[t].name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">
              Label
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              required
              className="w-full rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm px-3 py-2.5 placeholder-white/25 focus:outline-none focus:border-emerald-500/50 transition-colors"
              placeholder="e.g. Daily PPC Audit"
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-1.5">
              Schedule
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PRESET_SCHEDULES).map(([key, val]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScheduleKey(key as PresetScheduleKey)}
                  className={cn(
                    "text-xs text-left px-3 py-2 rounded-xl border transition-all",
                    scheduleKey === key
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                      : "border-white/8 bg-white/[0.04] text-white/55 hover:border-white/20"
                  )}
                >
                  {val.label}
                </button>
              ))}
            </div>
            <p className="text-white/30 text-xs mt-1.5 font-mono">
              cron: {PRESET_SCHEDULES[scheduleKey].cron}
            </p>
          </div>

          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="mt-1 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? "Creating…" : "Create Schedule"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const user = useAuth((s) => s.user);
  const { success, error: showError } = useToastStore();

  const [schedules, setSchedules] = useState<AiSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data, error } = await supabase
        .from("ai_schedules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSchedules((data ?? []) as AiSchedule[]);
    } catch (err: any) {
      showError("Failed to load schedules", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const handleCreate = async (data: { title: string; task_type: JobType; cron_schedule: string }) => {
    if (!user) return;
    setCreating(true);
    try {
      const { nextCronRunAfter } = await import("@/lib/jobs/cron-utils");
      const nextRun = nextCronRunAfter(data.cron_schedule);

      const { supabase } = await import("@/lib/supabase");
      const { error } = await supabase.from("ai_schedules").insert({
        user_id: user.id,
        title: data.title,
        task_type: data.task_type,
        cron_schedule: data.cron_schedule,
        status: "active",
        next_run: nextRun.toISOString(),
      });
      if (error) throw error;
      success("Schedule created", `"${data.title}" will run ${PRESET_SCHEDULES[
        Object.keys(PRESET_SCHEDULES).find(
          (k) => PRESET_SCHEDULES[k as PresetScheduleKey].cron === data.cron_schedule
        ) as PresetScheduleKey
      ]?.label ?? data.cron_schedule}".`);
      setShowCreate(false);
      fetchSchedules();
    } catch (err: any) {
      showError("Failed to create schedule", err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, currentStatus: "active" | "paused") => {
    setTogglingId(id);
    try {
      const { supabase } = await import("@/lib/supabase");
      const newStatus = currentStatus === "active" ? "paused" : "active";
      const { error } = await supabase
        .from("ai_schedules")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s))
      );
      success(newStatus === "active" ? "Schedule resumed" : "Schedule paused", "");
    } catch (err: any) {
      showError("Update failed", err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { supabase } = await import("@/lib/supabase");
      const { error } = await supabase.from("ai_schedules").delete().eq("id", id);
      if (error) throw error;
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      success("Schedule deleted", "");
    } catch (err: any) {
      showError("Delete failed", err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const activeCount = schedules.filter((s) => s.status === "active").length;

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AI Task Center</h1>
          <p className="text-white/50 text-sm mt-1">
            Schedule autonomous AI tasks. All tasks run as first-class jobs in the BI pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchSchedules(true)}
            disabled={refreshing}
            className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors px-3 py-2 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.04]"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black transition-all"
          >
            <Plus className="w-4 h-4" />
            New Schedule
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active Schedules", value: activeCount, color: "text-emerald-400" },
          { label: "Total Schedules",  value: schedules.length, color: "text-white/70" },
          { label: "Task Types Available", value: ALL_JOB_TYPES.length - 1, color: "text-sky-400" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
            <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
            <p className="text-white/40 text-xs mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Schedules Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 rounded-2xl border border-white/8 bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <CalendarClock className="w-7 h-7 text-white/30" />
          </div>
          <div>
            <p className="text-white/60 font-semibold">No schedules yet</p>
            <p className="text-white/35 text-sm mt-1">
              Create a schedule to automate AI analysis tasks on a recurring basis.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black transition-all"
          >
            <Plus className="w-4 h-4" />
            Create First Schedule
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onToggle={handleToggle}
              onDelete={handleDelete}
              toggling={togglingId === schedule.id}
              deleting={deletingId === schedule.id}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateScheduleModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          creating={creating}
        />
      )}
    </div>
  );
}
