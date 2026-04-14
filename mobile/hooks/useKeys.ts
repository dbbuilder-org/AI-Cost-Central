import { useQuery } from "@tanstack/react-query";
import { fetchKeys } from "@/lib/api";

export function useKeys() {
  return useQuery({
    queryKey: ["keys"],
    queryFn: fetchKeys,
    staleTime: 10 * 60_000,
    retry: 2,
  });
}
