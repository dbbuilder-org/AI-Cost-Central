import { useQuery } from "@tanstack/react-query";
import { fetchAlerts } from "@/lib/api";

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    staleTime: 5 * 60_000,
    retry: 2,
  });
}
