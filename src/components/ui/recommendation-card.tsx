"use client";

import { ExplainableRecommendation } from "@/lib/ai/schemas";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle, XCircle, PlayCircle, AlertTriangle, Clock, Activity, Target } from "lucide-react";

interface RecommendationCardProps {
  recommendation: ExplainableRecommendation;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onExecute?: (id: string) => void;
}

export function RecommendationCard({ recommendation, onApprove, onReject, onExecute }: RecommendationCardProps) {
  const isHighRisk = recommendation.riskLevel === "High";
  
  return (
    <Card className="flex flex-col border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={recommendation.priority === "Critical" ? "destructive" : "default"}>
                {recommendation.priority} Priority
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <Target className="w-3 h-3" />
                {recommendation.confidence}% Confidence
              </Badge>
              {recommendation.lifecycle && (
                <Badge variant="secondary">{recommendation.lifecycle}</Badge>
              )}
            </div>
            <CardTitle className="text-lg leading-snug">{recommendation.recommendation}</CardTitle>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 flex-1">
        {/* Reasoning */}
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
          {recommendation.aiReasoning}
        </div>

        {/* Evidence & Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Evidence
            </h4>
            <ul className="text-sm space-y-1">
              {recommendation.evidence.map((ev, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>{ev}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {recommendation.simulation && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                <Target className="w-3 h-3" /> Expected Impact
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Revenue:</span>
                  <span className={recommendation.simulation.expectedCase.expectedRevenueImpact >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                    {recommendation.simulation.expectedCase.expectedRevenueImpact >= 0 ? "+" : ""}
                    {formatCurrency(recommendation.simulation.expectedCase.expectedRevenueImpact)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Profit:</span>
                  <span className={recommendation.simulation.expectedCase.expectedProfitImpact >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                    {recommendation.simulation.expectedCase.expectedProfitImpact >= 0 ? "+" : ""}
                    {formatCurrency(recommendation.simulation.expectedCase.expectedProfitImpact)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Risk & Time */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <AlertTriangle className={`w-4 h-4 ${isHighRisk ? 'text-destructive' : 'text-warning'}`} />
            Risk: {recommendation.riskLevel}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Time: {recommendation.estimatedTime}
          </div>
          {recommendation.action && (
            <div className="flex items-center gap-1 ml-auto">
              <Badge variant="outline" className="bg-primary/5">Automated Action Ready</Badge>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="bg-muted/20 border-t p-4 flex gap-2 justify-end">
        {(recommendation.lifecycle === "Pending Approval" || recommendation.lifecycle === "Draft") && (
          <>
            <Button variant="outline" size="sm" onClick={() => onReject?.(recommendation.id)} className="gap-1">
              <XCircle className="w-4 h-4" /> Reject
            </Button>
            <Button variant="default" size="sm" onClick={() => onApprove?.(recommendation.id)} className="gap-1">
              <CheckCircle className="w-4 h-4" /> Approve
            </Button>
          </>
        )}
        {recommendation.lifecycle === "Approved" && recommendation.action && (
          <Button variant="default" size="sm" onClick={() => onExecute?.(recommendation.id)} className="gap-1 bg-green-600 hover:bg-green-700">
            <PlayCircle className="w-4 h-4" /> Execute Now
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
