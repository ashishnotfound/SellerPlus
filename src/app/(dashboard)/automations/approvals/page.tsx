"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("workflow_state")
      .select("*")
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch pending approvals");
      console.error(error);
    } else {
      setApprovals(data || []);
    }
    setLoading(false);
  };

  const handleAction = async (id: string, action: "approved" | "rejected") => {
    const { error } = await supabase
      .from("workflow_state")
      .update({ status: action, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast.error(`Failed to ${action} action`);
    } else {
      toast.success(`Action successfully ${action}`);
      setApprovals((prev) => prev.filter((item) => item.id !== id));
      
      // In a full implementation, we'd also call an API route here to emit a "workflow.approved" 
      // event so the ActionWorker picks it up and continues execution.
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Automation Approvals</h1>
        <p className="text-gray-400 mt-2">
          Review and approve actions recommended by the AI COO.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-white/10 bg-white/5">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white">You're all caught up!</h3>
          <p className="text-gray-400 mt-1">No pending actions require your approval.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {approvals.map((approval) => (
            <Card key={approval.id} className="bg-zinc-900 border-zinc-800">
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div>
                  <CardTitle className="text-lg text-white font-medium flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Action Required: {approval.workflow_type.replace("approval:", "").replace("_", " ")}
                  </CardTitle>
                  <p className="text-sm text-gray-400 mt-1">
                    {approval.state_data?.reason || "Standard approval required"}
                  </p>
                </div>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                  Awaiting Review
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="bg-black/20 rounded-md p-4 mb-4 font-mono text-sm text-gray-300 whitespace-pre-wrap">
                  {JSON.stringify(approval.state_data?.payload, null, 2)}
                </div>
                <div className="flex justify-end gap-3">
                  <Button 
                    variant="outline" 
                    className="border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400"
                    onClick={() => handleAction(approval.id, "rejected")}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button 
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    onClick={() => handleAction(approval.id, "approved")}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve Action
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
