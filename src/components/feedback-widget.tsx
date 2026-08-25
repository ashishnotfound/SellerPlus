"use client";

import { useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import { useToastStore } from "@/hooks/use-toast-store";
import { motion, AnimatePresence } from "framer-motion";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const toast = useToastStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setIsSubmitting(true);
    
    try {
      const response = await sellerplusApiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          category: "product_feedback",
          message: feedback,
          pagePath: window.location.pathname,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Feedback could not be submitted.");

      toast.success("Feedback received", "Your feedback was securely recorded.");
      setFeedback("");
      setIsOpen(false);
    } catch (error) {
      toast.error(
        "Feedback not sent",
        error instanceof Error ? error.message : "Try again when the service is available.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-50 p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg transition-all hover:scale-105 hidden md:flex items-center gap-2 group"
      >
        <MessageSquarePlus className="w-5 h-5" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 ease-in-out whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:px-1">
          Feedback
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 left-6 z-50 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden hidden md:block"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/50">
              <h3 className="font-semibold text-slate-200">SellerPlus feedback</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <p className="text-sm text-slate-400">
                Report an issue or tell ReyoStudio how SellerPlus can work better for you.
              </p>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe the issue..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none h-24"
                disabled={isSubmitting}
              />
              <button
                type="submit"
                disabled={!feedback.trim() || isSubmitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium transition-colors"
              >
                {isSubmitting ? "Sending..." : "Submit Feedback"}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
