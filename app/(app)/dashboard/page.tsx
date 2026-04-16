"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useDashboard } from "@/store/useDashboard";
import { OverviewCards } from "@/components/dashboard/OverviewCards";
import { ModelEfficiencyTable } from "@/components/dashboard/ModelEfficiencyTable";
import { RecommendationCards } from "@/components/dashboard/RecommendationCards";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { RequestEfficiency } from "@/components/dashboard/RequestEfficiency";
import { SmartRouterCard } from "@/components/dashboard/SmartRouterCard";
import { RoutingDecisionsTable } from "@/components/dashboard/RoutingDecisionsTable";
import { SpendOverTime } from "@/components/charts/SpendOverTime";
import { CostByModel } from "@/components/charts/CostByModel";
import { CostByKey } from "@/components/charts/CostByKey";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { buildWorkbook, downloadWorkbook } from "@/lib/excel";

export default function DashboardPage() {
  const {
    summary, rows, recommendations, loading, analyzing, error,
    dateRange, fetchData, runAnalysis, setDateRange,
  } = useDashboard();

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = () => {
    if (!summary) return;
    const wb = buildWorkbook(rows, summary, recommendations);
    downloadWorkbook(wb, `ai-cost-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">AI Spend Dashboard</h1>
          <p className="text-sm text-gray-500">OpenAI · Anthropic · Google — usage and cost across all providers</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range */}
          <div className="flex bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
            {(["7d", "14d", "28d"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  dateRange === r ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={handleExport}
            disabled={!summary}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md border border-gray-700 transition-colors disabled:opacity-40"
          >
            ↓ Export Excel
          </button>

          <button
            onClick={runAnalysis}
            disabled={!summary || analyzing}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors disabled:opacity-40"
          >
            {analyzing ? "Analyzing…" : "✦ AI Analysis"}
          </button>

          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            {loading ? "Loading…" : "↻"}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && !summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 bg-gray-800" />)}
          </div>
          <Skeleton className="h-72 bg-gray-800" />
          <Skeleton className="h-72 bg-gray-800" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !summary && !error && (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg text-gray-400">No usage data found.</p>
          <Link href="/settings/keys" className="text-indigo-400 text-sm mt-2 inline-block hover:underline">
            Add an API key to get started →
          </Link>
        </div>
      )}

      {/* Main dashboard */}
      {summary && (
        <>
          <OverviewCards summary={summary} />

          <Tabs defaultValue="spend">
            <TabsList className="bg-gray-900 border border-gray-800">
              <TabsTrigger value="alerts" className="data-[state=active]:bg-gray-800 text-gray-400 data-[state=active]:text-white">
                Alerts
              </TabsTrigger>
              <TabsTrigger value="spend" className="data-[state=active]:bg-gray-800 text-gray-400 data-[state=active]:text-white">
                Spend Over Time
              </TabsTrigger>
              <TabsTrigger value="models" className="data-[state=active]:bg-gray-800 text-gray-400 data-[state=active]:text-white">
                By Model
              </TabsTrigger>
              <TabsTrigger value="keys" className="data-[state=active]:bg-gray-800 text-gray-400 data-[state=active]:text-white">
                By API Key
              </TabsTrigger>
              <TabsTrigger value="efficiency" className="data-[state=active]:bg-gray-800 text-gray-400 data-[state=active]:text-white">
                Efficiency Table
              </TabsTrigger>
              <TabsTrigger value="request-efficiency" className="data-[state=active]:bg-gray-800 text-gray-400 data-[state=active]:text-white">
                Request Efficiency
                {summary.byModel.some((m) => m.overkillSignal !== "none") && (
                  <Badge className="ml-2 bg-orange-600 text-white text-xs px-1.5 py-0">
                    {summary.byModel.filter((m) => m.overkillSignal !== "none").length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="smartrouter" className="data-[state=active]:bg-gray-800 text-gray-400 data-[state=active]:text-white">
                SmartRouter
              </TabsTrigger>
              <TabsTrigger value="routing-decisions" className="data-[state=active]:bg-gray-800 text-gray-400 data-[state=active]:text-white">
                Decisions
              </TabsTrigger>
              {recommendations.length > 0 && (
                <TabsTrigger value="recommendations" className="data-[state=active]:bg-gray-800 text-gray-400 data-[state=active]:text-white">
                  Recommendations
                  <Badge className="ml-2 bg-indigo-600 text-white text-xs px-1.5 py-0">{recommendations.length}</Badge>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="alerts" className="mt-4">
              <AlertsPanel />
            </TabsContent>

            <TabsContent value="spend" className="mt-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-medium text-gray-400 mb-4">Daily Spend by Model (USD)</h2>
              <SpendOverTime byDay={summary.byDay} />
            </TabsContent>

            <TabsContent value="models" className="mt-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-medium text-gray-400 mb-4">Cost by Model (USD, top 10)</h2>
              <CostByModel byModel={summary.byModel} />
            </TabsContent>

            <TabsContent value="keys" className="mt-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-medium text-gray-400 mb-4">Cost by API Key (USD, top 8)</h2>
              <CostByKey byApiKey={summary.byApiKey} />
            </TabsContent>

            <TabsContent value="efficiency" className="mt-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-medium text-gray-400 mb-4">Model Efficiency — green = cheapest per 1K output tokens</h2>
              <ModelEfficiencyTable byModel={summary.byModel} totalCost={summary.totalCostUSD} />
            </TabsContent>

            <TabsContent value="request-efficiency" className="mt-4">
              <RequestEfficiency byModel={summary.byModel} totalCost={summary.totalCostUSD} />
            </TabsContent>

            <TabsContent value="smartrouter" className="mt-4">
              <SmartRouterCard />
            </TabsContent>

            <TabsContent value="routing-decisions" className="mt-4">
              <RoutingDecisionsTable />
            </TabsContent>

            {recommendations.length > 0 && (
              <TabsContent value="recommendations" className="mt-4">
                <RecommendationCards recommendations={recommendations} />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}
