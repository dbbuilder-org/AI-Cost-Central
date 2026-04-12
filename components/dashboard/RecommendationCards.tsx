"use client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Recommendation } from "@/types";

interface Props {
  recommendations: Recommendation[];
}

const CATEGORY_LABELS: Record<string, string> = {
  cost_reduction: "Cost Reduction",
  model_migration: "Model Migration",
  reporting: "Reporting",
  anomaly: "Anomaly",
};

const IMPACT_STYLE: Record<string, string> = {
  High: "bg-red-900/60 text-red-300 border-red-800",
  Medium: "bg-amber-900/60 text-amber-300 border-amber-800",
  Low: "bg-green-900/60 text-green-300 border-green-800",
};

const EFFORT_STYLE: Record<string, string> = {
  Low: "bg-green-900/40 text-green-400",
  Medium: "bg-amber-900/40 text-amber-400",
  High: "bg-red-900/40 text-red-400",
};

const CATEGORY_COLOR: Record<string, string> = {
  cost_reduction: "border-l-4 border-l-indigo-500",
  model_migration: "border-l-4 border-l-amber-500",
  reporting: "border-l-4 border-l-cyan-500",
  anomaly: "border-l-4 border-l-red-500",
};

export function RecommendationCards({ recommendations }: Props) {
  if (!recommendations.length) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {recommendations.map((rec, i) => (
        <Card key={i} className={`bg-gray-900 border-gray-800 ${CATEGORY_COLOR[rec.category] ?? ""}`}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-xs ${IMPACT_STYLE[rec.impact]}`}>
                {rec.impact} Impact
              </Badge>
              <Badge className="text-xs bg-gray-800 text-gray-300">
                {CATEGORY_LABELS[rec.category] ?? rec.category}
              </Badge>
              <Badge className={`text-xs ${EFFORT_STYLE[rec.effort]}`}>
                {rec.effort} Effort
              </Badge>
            </div>
            <CardTitle className="text-sm text-gray-200 mt-2 font-medium leading-snug">
              {rec.finding}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-gray-400">{rec.action}</p>
            {rec.savings_estimate !== "Unknown" && (
              <p className="text-xs text-green-400 font-semibold">
                Est. savings: {rec.savings_estimate}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
