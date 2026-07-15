"use client";

import React, { Component, ErrorInfo } from "react";
import { GlassCard } from "./glass-card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <GlassCard className="max-w-md w-full flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Something went wrong</h3>
              <p className="text-xs text-zinc-500 leading-relaxed max-w-[300px]">
                An unexpected error occurred. This has been logged for investigation.
              </p>
            </div>
            {this.state.error && (
              <div className="w-full p-3 rounded-xl border border-white/5 bg-white/[0.02] text-left">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Error Details</span>
                <p className="text-xs text-rose-300 font-mono break-all">{this.state.error.message}</p>
              </div>
            )}
            <button
              onClick={this.handleRetry}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-400 to-emerald-400 text-black font-bold text-xs flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
          </GlassCard>
        </div>
      );
    }

    return this.props.children;
  }
}
