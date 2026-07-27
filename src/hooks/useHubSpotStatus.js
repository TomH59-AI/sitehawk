import { useQuery } from "@tanstack/react-query";
import { hubspotStatus } from "@/functions/hubspotStatus";

export default function useHubSpotStatus() {
  const query = useQuery({
    queryKey: ["hubspot-connection-status"],
    queryFn: async () => {
      const response = await hubspotStatus({});
      return response.data?.status || "error";
    },
    staleTime: 60_000,
    retry: false,
  });

  return {
    status: query.isLoading ? "loading" : query.isError ? "error" : query.data,
    refresh: query.refetch,
  };
}