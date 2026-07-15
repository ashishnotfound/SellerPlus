/**
 * SellerPlus OS — Toast Notification Store
 * 
 * Centralized, production-grade toast notification system.
 * Replaces all browser alert() calls with beautiful, non-blocking toasts.
 * Supports success, error, warning, and info variants with auto-dismiss,
 * stacking, and optional action buttons.
 */

"use client";

import { create } from "zustand";

// ─── Types ───────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration: number;       // ms, 0 = persistent
  createdAt: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id" | "createdAt">) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
  
  // Convenience methods
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
}

// ─── Store ───────────────────────────────────────────────────────────

let _counter = 0;
function generateId(): string {
  return `toast_${Date.now()}_${++_counter}`;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = generateId();
    const newToast: Toast = {
      ...toast,
      id,
      createdAt: Date.now(),
    };

    set((state) => ({
      // Stack max 5 toasts visible at a time — oldest auto-removed
      toasts: [...state.toasts.slice(-4), newToast],
    }));

    // Auto-dismiss after duration
    if (toast.duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, toast.duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => set({ toasts: [] }),

  success: (title, message) =>
    get().addToast({ variant: "success", title, message, duration: 4000 }),

  error: (title, message) =>
    get().addToast({ variant: "error", title, message, duration: 6000 }),

  warning: (title, message) =>
    get().addToast({ variant: "warning", title, message, duration: 5000 }),

  info: (title, message) =>
    get().addToast({ variant: "info", title, message, duration: 4000 }),
}));
