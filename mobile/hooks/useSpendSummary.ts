import { useQuery } from "@tanstack/react-query";
import { fetchSummary } from "@/lib/api";
import type { DateRange } from "@/types";

export function useSpendSummary(dateRange: DateRange = "28d") {
  const days = parseInt(dateRange);
  return useQuery({
    queryKey: ["summary", days],
    queryFn: () => fetchSummary(days),
    staleTime: 5 * 60_000,  // 5 min
    retry: 2,
  });
}
