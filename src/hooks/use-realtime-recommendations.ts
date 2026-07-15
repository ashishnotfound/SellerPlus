import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ExplainableRecommendation } from "@/lib/ai/schemas";

export function useRealtimeRecommendations(userId?: string) {
  const [recommendations, setRecommendations] = useState<ExplainableRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecommendations = async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("ai_recommendation_history")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
        const mapped: ExplainableRecommendation[] = data.map((row) => ({
          id: row.id,
          recommendation: row.recommendation,
          priority: "Medium",
          confidence: row.confidence || 0,
          confidenceReason: "Derived from Automation Engine",
          evidence: row.evidence || [],
          sourceTables: [],
          sourceKPIs: [],
          aiReasoning: row.action || "No AI reasoning provided.",
          simulation: row.simulation_json,
          dependencies: row.dependencies || [],
          conflicts: [],
          riskLevel: "Medium",
          estimatedTime: "5 mins",
          lifecycle: row.lifecycle || "Pending Approval",
          action: row.action ? { automationType: "Generic", payload: {}, requiresApproval: true, supportsRollback: false } : undefined
        }));
        setRecommendations(mapped);
      }
    } catch (e) {
      console.error("Error fetching recommendations:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();

    if (!userId) return;

    const subscription = supabase
      .channel(`public:ai_recommendation_history:user_id=eq.${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_recommendation_history",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Whenever a change happens, refetch. For a production app we'd mutate state directly based on payload.
          fetchRecommendations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [userId]);

  return { recommendations, loading, refetch: fetchRecommendations };
}
