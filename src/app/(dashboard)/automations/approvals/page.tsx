"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";

interface ActionProposal {
  id: string;
  action_type: string;
  resource_type: string;
  resource_id: string;
  current_state: Record<string, unknown>;
  proposed_state: Record<string, unknown>;
  reasoning: string;
  confidence: number | null;
  expected_impact: Record<string, unknown>;
  risk_level: "low" | "medium" | "high" | "critical";
  status: "approval_required";
  policy_snapshot: Record<string, unknown>;
  expires_at: string | null;
  created_at: string;
  version: number;
}

const riskClasses: Record<ActionProposal["risk_level"], string> = {
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-600",
  critical: "border-red-500/30 bg-red-500/10 text-red-600",
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function ApprovalsPage() {
  const workspaceId = useAuth((state) => state.user?.workspaceId);
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const response = await sellerplusApiFetch("/api/action-proposals?status=approval_required");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Pending approvals could not be loaded.");
      setProposals(payload.data ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pending approvals could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchProposals();
  }, [fetchProposals]);

  async function decide(proposal: ActionProposal, decision: "approve" | "reject") {
    const reason = rejectionReasons[proposal.id]?.trim();
    if (decision === "reject" && !reason) {
      toast.error("Add a rejection reason so the decision remains auditable.");
      return;
    }

    setDecidingId(proposal.id);
    try {
      const response = await sellerplusApiFetch(`/api/action-proposals/${proposal.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, version: proposal.version, reason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The decision could not be recorded.");

      setProposals((current) => current.filter((item) => item.id !== proposal.id));
      toast.success(
        decision === "approve"
          ? payload.data?.jobId
            ? "Approved. The deterministic job is queued."
            : "Proposal approved."
          : "Proposal rejected.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The decision could not be recorded.");
      await fetchProposals();
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Approval center</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Review AI and automation proposals before SellerPlus schedules any work. Approval never bypasses the deterministic policy and execution layers.
          </p>
        </div>
        <Button variant="outline" onClick={() => void fetchProposals()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock3 className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border bg-card">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-label="Loading approvals" />
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-14 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-500" />
          <h2 className="font-medium">No actions need approval</h2>
          <p className="mt-1 text-sm text-muted-foreground">New proposals will appear here with their evidence, impact, and risk.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => {
            const busy = decidingId === proposal.id;
            return (
              <Card key={proposal.id}>
                <CardHeader className="gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      {label(proposal.action_type)}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{proposal.reasoning}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Badge variant="outline" className={riskClasses[proposal.risk_level]}>
                      {label(proposal.risk_level)} risk
                    </Badge>
                    <Badge variant="outline">Awaiting review</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Target</dt>
                      <dd className="mt-1 font-medium">{label(proposal.resource_type)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Confidence</dt>
                      <dd className="mt-1 font-medium">
                        {proposal.confidence == null ? "Not quantified" : `${Math.round(proposal.confidence * 100)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Created</dt>
                      <dd className="mt-1 font-medium">{new Date(proposal.created_at).toLocaleString()}</dd>
                    </div>
                  </dl>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current evidence</h3>
                      <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-3 text-xs">
                        {JSON.stringify(proposal.current_state, null, 2)}
                      </pre>
                    </section>
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proposed work</h3>
                      <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-3 text-xs">
                        {JSON.stringify(proposal.proposed_state, null, 2)}
                      </pre>
                    </section>
                  </div>

                  <label className="block text-sm">
                    <span className="mb-2 block font-medium">Rejection reason</span>
                    <textarea
                      value={rejectionReasons[proposal.id] ?? ""}
                      onChange={(event) => setRejectionReasons((current) => ({
                        ...current,
                        [proposal.id]: event.target.value,
                      }))}
                      maxLength={1_000}
                      rows={2}
                      placeholder="Required only when rejecting"
                      className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                  </label>

                  <div className="flex flex-wrap justify-end gap-3">
                    <Button variant="outline" onClick={() => void decide(proposal, "reject")} disabled={busy}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button onClick={() => void decide(proposal, "approve")} disabled={busy}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      Approve action
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
