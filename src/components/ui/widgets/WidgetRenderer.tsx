"use client";

import { LineChartWidget } from "../charts/line-chart-widget";
import { BarChartWidget } from "../charts/bar-chart-widget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Widget } from "@/lib/ai/schemas";

export function WidgetRenderer({ widget }: { widget: Widget }) {
  const importanceColor = 
    widget.importance === "High" ? "destructive" : 
    widget.importance === "Medium" ? "warning" : "default";

  switch (widget.type) {
    case "LineChart":
      return (
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>{widget.title}</CardTitle>
              <Badge variant={importanceColor as any}>{widget.importance}</Badge>
            </div>
            <CardDescription>{widget.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 mt-4">
            {/* The AI provides standard dataset format: [{ date: "...", value: 123 }, ...] */}
            {/* We map the keys dynamically based on the dataset structure */}
            <LineChartWidget 
              data={Array.isArray(widget.dataset) ? widget.dataset : []} 
              xKey={Array.isArray(widget.dataset) && widget.dataset.length > 0 ? Object.keys(widget.dataset[0])[0] : ""} 
              yKey={Array.isArray(widget.dataset) && widget.dataset.length > 0 ? Object.keys(widget.dataset[0])[1] : ""} 
            />
          </CardContent>
        </Card>
      );
      
    case "BarChart":
      return (
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>{widget.title}</CardTitle>
              <Badge variant={importanceColor as any}>{widget.importance}</Badge>
            </div>
            <CardDescription>{widget.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 mt-4">
            <BarChartWidget 
              data={Array.isArray(widget.dataset) ? widget.dataset : []} 
              xKey={Array.isArray(widget.dataset) && widget.dataset.length > 0 ? Object.keys(widget.dataset[0])[0] : ""} 
              yKey={Array.isArray(widget.dataset) && widget.dataset.length > 0 ? Object.keys(widget.dataset[0])[1] : ""} 
            />
          </CardContent>
        </Card>
      );

    case "KPI":
      const rawValue = widget.dataset.value;
      const kpiValue = !widget.dataset.available || rawValue === null
        ? null
        : widget.dataset.format === "currency"
          ? formatCurrency(rawValue)
          : widget.dataset.format === "percent"
            ? `${rawValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
            : widget.dataset.format === "ratio"
              ? rawValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : rawValue.toLocaleString();
        
      return (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="font-medium text-muted-foreground">{widget.title}</CardDescription>
            <CardTitle className="text-3xl">{kpiValue ?? "Not available"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">{widget.description}</div>
            <div className="mt-2 text-[10px] text-muted-foreground">Source: {widget.dataset.source}</div>
          </CardContent>
        </Card>
      );

  }
}
